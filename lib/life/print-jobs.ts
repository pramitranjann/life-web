import { OWNER_ID } from '@/lib/life/constants'
import { getProjectBySlugDb } from '@/lib/life/projects-db'
import { buildReceiptPayload, type ReceiptLayout } from '@/lib/life/receipt'
import { getOwnerSettings } from '@/lib/life/settings'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { PrintJobRecord, TaskPrintInfo, TaskRecord } from '@/lib/life/types'

export const DEFAULT_PRINT_DEVICE = 'desk'
const ACTIVE_STATUSES = ['pending', 'leased'] as const
// Postgres unique_violation — the partial index that blocks a second active job
// per task. We treat it as "already queued", not an error.
const UNIQUE_VIOLATION = '23505'

/** The single active (pending or leased) job for a task, if any. */
async function getActiveJobForTask(taskId: string): Promise<PrintJobRecord | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('task_id', taskId)
    .in('status', ACTIVE_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<PrintJobRecord[]>()

  if (error) throw error
  return data?.[0] ?? null
}

/**
 * Queue a durable receipt for a task. Idempotent on the active-job constraint:
 * if a pending/leased job already exists for the task, returns it with
 * `duplicate: true` instead of creating a second one. This is the only way jobs
 * are created — manual "Print task", reprint, and (V2) auto-queue all call here.
 */
export async function createPrintJob(input: {
  task: Pick<TaskRecord, 'id' | 'title' | 'status' | 'due_local_date' | 'details' | 'project_slug'>
  deviceId?: string
  layout?: ReceiptLayout
  /** Skip the active-job guard to force a brand-new job (explicit reprint). */
  allowDuplicate?: boolean
}): Promise<{ job: PrintJobRecord; duplicate: boolean }> {
  const { task } = input
  const deviceId = input.deviceId || DEFAULT_PRINT_DEVICE

  if (!input.allowDuplicate) {
    const existing = await getActiveJobForTask(task.id)
    if (existing) return { job: existing, duplicate: true }
  }

  const settings = await getOwnerSettings()
  const project = task.project_slug ? await getProjectBySlugDb(task.project_slug) : null
  const projectName = project?.name ?? null
  const parentProjectName = project?.parent_slug
    ? (await getProjectBySlugDb(project.parent_slug))?.name ?? null
    : null
  const receipt = buildReceiptPayload({
    task,
    projectName,
    parentProjectName,
    timeZone: settings.timezone,
    layout: input.layout,
  })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('print_jobs')
    .insert({
      user_id: OWNER_ID,
      task_id: task.id,
      device_id: deviceId,
      task_title: task.title,
      receipt_payload: receipt,
      status: 'pending',
    })
    .select('*')
    .single()

  // Lost a race with a concurrent queue request — return the now-existing job.
  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION && !input.allowDuplicate) {
      const existing = await getActiveJobForTask(task.id)
      if (existing) return { job: existing, duplicate: true }
    }
    throw error
  }

  return { job: data as PrintJobRecord, duplicate: false }
}

/** All jobs for the owner, newest first. */
export async function getPrintJobs(): Promise<PrintJobRecord[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('user_id', OWNER_ID)
    .order('created_at', { ascending: false })
    .returns<PrintJobRecord[]>()

  if (error) throw error
  return data || []
}

/**
 * Per-task print state derived from jobs. The latest job sets the current state;
 * `hasPrinted` stays true if any job ever succeeded, so a printed receipt stays
 * visible after the task is completed or a later reprint fails.
 */
export function derivePrintInfo(jobs: PrintJobRecord[]): Map<string, TaskPrintInfo> {
  const byTask = new Map<string, TaskPrintInfo>()
  // jobs arrive newest-first; the first one seen per task is the latest.
  for (const job of jobs) {
    if (!job.task_id) continue
    const current = byTask.get(job.task_id)
    if (!current) {
      byTask.set(job.task_id, {
        state: job.status,
        jobId: job.id,
        printedAt: job.printed_at,
        lastError: job.last_error,
        attempts: job.attempts,
        hasPrinted: job.status === 'printed',
      })
    } else if (job.status === 'printed' && !current.hasPrinted) {
      current.hasPrinted = true
      if (!current.printedAt) current.printedAt = job.printed_at
    }
  }
  return byTask
}

/** Atomically lease one pending job for a device (see claim_print_job SQL). */
export async function claimPrintJob(
  deviceId: string,
  leaseSeconds = 180,
): Promise<PrintJobRecord | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('claim_print_job', {
    p_device: deviceId,
    p_lease_seconds: leaseSeconds,
  })

  if (error) throw error
  const rows = (data as PrintJobRecord[] | null) ?? []
  return rows[0] ?? null
}

/**
 * Record the device's outcome for a leased job. Only the device that holds the
 * lease may complete it, and only a leased job can be completed — a late report
 * for a job whose lease already expired and was reclaimed is ignored.
 */
export async function completePrintJob(input: {
  jobId: string
  deviceId: string
  success: boolean
  error?: string | null
}): Promise<PrintJobRecord | null> {
  const supabase = getSupabaseAdmin()
  const update = input.success
    ? {
        status: 'printed' as const,
        printed_at: new Date().toISOString(),
        last_error: null,
        lease_expires_at: null,
      }
    : {
        status: 'failed' as const,
        last_error: input.error?.slice(0, 500) || 'Unknown printer error.',
        lease_expires_at: null,
      }

  const { data, error } = await supabase
    .from('print_jobs')
    .update(update)
    .eq('user_id', OWNER_ID)
    .eq('id', input.jobId)
    .eq('device_id', input.deviceId)
    .eq('status', 'leased')
    .select('*')
    .maybeSingle()

  if (error) throw error
  return (data as PrintJobRecord | null) ?? null
}

/** Requeue a failed job for another attempt. */
export async function retryPrintJob(jobId: string): Promise<PrintJobRecord> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('print_jobs')
    .update({ status: 'pending', last_error: null, leased_at: null, lease_expires_at: null })
    .eq('user_id', OWNER_ID)
    .eq('id', jobId)
    .eq('status', 'failed')
    .select('*')
    .single()

  if (error) throw error
  return data as PrintJobRecord
}

/** Manually stop a queued or currently leased job so it no longer blocks reprint. */
export async function cancelPrintJob(jobId: string): Promise<PrintJobRecord> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('print_jobs')
    .update({
      status: 'failed',
      last_error: 'Cancelled by user.',
      lease_expires_at: null,
      leased_at: null,
    })
    .eq('user_id', OWNER_ID)
    .eq('id', jobId)
    .in('status', ['pending', 'leased'])
    .select('*')
    .single()

  if (error) throw error
  return data as PrintJobRecord
}

/** Remove a failed job, or an expired leased job that is only lingering for review. */
export async function deletePrintJob(jobId: string): Promise<PrintJobRecord> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Print job not found.')

  const job = data as PrintJobRecord
  const leaseExpired =
    job.status === 'leased' &&
    job.lease_expires_at != null &&
    new Date(job.lease_expires_at).getTime() < Date.now()

  if (job.status !== 'failed' && !leaseExpired) {
    throw new Error('Only failed or expired print jobs can be deleted.')
  }

  const { error: deleteError } = await supabase
    .from('print_jobs')
    .delete()
    .eq('user_id', OWNER_ID)
    .eq('id', jobId)

  if (deleteError) throw deleteError
  return job
}
