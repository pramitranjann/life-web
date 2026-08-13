'use client'

import { useMemo, useState } from 'react'

import { LifeMenu } from '@/components/life/ui/LifeMenu'
import { LifeTable, type TableColumn } from '@/components/life/ui/LifeTable'
import { shortTaskCode } from '@/lib/life/receipt'
import { localDateTimeToUtc } from '@/lib/life/time'
import type { PrintJobRecord, TaskPrintInfo, TaskRecord } from '@/lib/life/types'

// LifeTable's T extends Record<string, unknown>; interfaces (unlike type
// literals) have no implicit index signature, so the domain types need this
// intersection to satisfy the constraint. Property types are unaffected.

const PRINT_STATE_LABEL: Record<string, string> = {
  none: 'Not printed',
  pending: 'Queued',
  leased: 'Printing…',
  printed: 'Printed',
  failed: 'Failed',
}
const ATTENTION_WINDOW_MS = 5 * 60 * 1000

function whenLabel(iso: string | null, timeZone: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function dueLabel(dueLocalDate: string | null, timeZone: string) {
  if (!dueLocalDate) return null
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(localDateTimeToUtc(dueLocalDate, timeZone, 12, 0))
}

function isLeaseStale(job: PrintJobRecord, now: number) {
  return job.status === 'leased' && job.lease_expires_at != null && new Date(job.lease_expires_at).getTime() < now
}

function isManualCancel(job: PrintJobRecord) {
  return job.last_error === 'Cancelled by user.'
}

function isCancelledInfo(info: TaskPrintInfo | undefined) {
  return info?.state === 'failed' && info.lastError === 'Cancelled by user.'
}

function latestTimestamp(job: PrintJobRecord) {
  return (
    job.printed_at ||
    job.leased_at ||
    job.created_at
  )
}

function isAttentionFresh(job: PrintJobRecord, now: number) {
  return now - new Date(latestTimestamp(job)).getTime() <= ATTENTION_WINDOW_MS
}

export function PrintManagement({
  tasks,
  printJobs,
  printInfo,
  timezone,
  labelFor,
  onQueueMany,
  onReprint,
  onCancel,
  onDelete,
  onRetry,
}: {
  tasks: TaskRecord[]
  printJobs: PrintJobRecord[]
  printInfo: Record<string, TaskPrintInfo>
  timezone: string
  labelFor: (slug: string | null) => string
  onQueueMany: (taskIds: string[]) => Promise<boolean>
  onReprint: (taskId: string) => Promise<boolean>
  onCancel: (jobId: string) => Promise<void>
  onDelete: (jobId: string) => Promise<void>
  onRetry: (jobId: string) => Promise<void>
}) {
  const now = Date.now()
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState(false)
  // Project options drawn from whatever the current tasks reference.
  const projectOptions = useMemo(() => {
    const slugs = new Set<string>()
    for (const task of tasks) if (task.project_slug) slugs.add(task.project_slug)
    return Array.from(slugs)
  }, [tasks])

  const matchesFilters = (task: TaskRecord) => {
    if (projectFilter !== 'all' && (task.project_slug || '') !== projectFilter) return false
    if (!showDone && task.status === 'done') return false
    return true
  }

  // Needs Printing: never-queued tasks with no successful receipt. Failed jobs
  // live in Needs Attention; queued/leased live in Queue.
  const needsPrinting = useMemo(
    () =>
      tasks.filter((task) => {
        if (!matchesFilters(task)) return false
        const info = printInfo[task.id]
        if (!info) return true
        return isCancelledInfo(info) && !info.hasPrinted
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, printInfo, projectFilter, showDone],
  )

  const queueJobs = printJobs.filter((job) => job.status === 'pending' || (job.status === 'leased' && !isLeaseStale(job, now)))
  const printedJobs = printJobs.filter((job) => job.status === 'printed')
  const attentionJobs = printJobs.filter(
    (job) => (((job.status === 'failed' && !isManualCancel(job)) || isLeaseStale(job, now)) && isAttentionFresh(job, now)),
  )
  const latestBoardError = attentionJobs.find((job) => job.status === 'failed' && !isManualCancel(job) && job.last_error)
  const latestLease = printJobs.find((job) => job.leased_at)
  const printerState = queueJobs.some((job) => job.status === 'leased')
    ? 'printing'
    : attentionJobs.some((job) => isLeaseStale(job, now) || (job.status === 'failed' && !isManualCancel(job)))
      ? 'error'
      : queueJobs.length > 0
        ? 'queued'
        : 'idle'

  async function bulkQueue(ids: string[]) {
    if (!ids.length || busy) return false
    setBusy(true)
    try {
      // Reported back to LifeTable: a failed queue keeps the rows selected.
      return Boolean(await onQueueMany(ids))
    } finally {
      setBusy(false)
    }
  }

  async function reprint(taskId: string) {
    if (busy) return
    setBusy(true)
    try {
      await onReprint(taskId)
    } finally {
      setBusy(false)
    }
  }

  async function retry(jobId: string) {
    if (busy) return
    setBusy(true)
    try {
      await onRetry(jobId)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(jobId: string) {
    if (busy) return
    setBusy(true)
    try {
      await onCancel(jobId)
    } finally {
      setBusy(false)
    }
  }

  async function remove(jobId: string) {
    if (busy) return
    setBusy(true)
    try {
      await onDelete(jobId)
    } finally {
      setBusy(false)
    }
  }

  const needsPrintingColumns: TableColumn<TaskRecord>[] = [
    {
      key: 'title',
      label: 'Task',
      title: true,
      render: (task) => (
        <span className={`life-print-row-title${task.status === 'done' ? ' is-done' : ''}`}>{task.title}</span>
      ),
    },
    {
      key: 'project_slug',
      label: 'Project',
      render: (task) => (task.project_slug ? <span className="life-tag">{labelFor(task.project_slug)}</span> : null),
    },
    {
      key: 'due_local_date',
      label: 'Due',
      render: (task) => {
        const due = dueLabel(task.due_local_date, timezone)
        return due ? <span className="life-due-chip">{due}</span> : null
      },
    },
    {
      key: 'id',
      label: 'Code',
      render: (task) => <span className="life-print-code">{shortTaskCode(task.id)}</span>,
    },
  ]

  const queueColumns: TableColumn<PrintJobRecord>[] = [
    { key: 'task_title', label: 'Task', title: true },
    {
      key: 'status',
      label: 'Status',
      render: (job) => <span className={`life-print-badge state-${job.status}`}>{PRINT_STATE_LABEL[job.status]}</span>,
    },
    {
      key: 'created_at',
      label: 'Queued',
      render: (job) => <span className="life-print-when">{whenLabel(job.created_at, timezone)}</span>,
    },
  ]

  const attentionColumns: TableColumn<PrintJobRecord>[] = [
    { key: 'task_title', label: 'Task', title: true },
    {
      key: 'status',
      label: 'Status',
      render: (job) => (
        <span className="life-print-badge state-failed">
          {isLeaseStale(job, now) ? 'Stuck' : isManualCancel(job) ? 'Cancelled' : 'Failed'}
        </span>
      ),
    },
    {
      key: 'last_error',
      label: 'Error',
      render: (job) => {
        if (isLeaseStale(job, now)) {
          return <span className="life-print-error">No completion came back from the ESP board before the lease expired.</span>
        }
        return job.last_error ? <span className="life-print-error">{job.last_error}</span> : null
      },
    },
  ]

  const printedColumns: TableColumn<PrintJobRecord>[] = [
    { key: 'task_title', label: 'Task', title: true },
    {
      key: 'printed_at',
      label: 'Printed',
      render: (job) => <span className="life-print-when">{whenLabel(job.printed_at, timezone)}</span>,
    },
  ]

  return (
    <div className="life-print-section">
      <section className="life-print-status">
        <div className="life-print-status-head">
          <h3>Printer Status</h3>
          <span className={`life-print-badge state-${printerState === 'error' ? 'failed' : printerState === 'printing' ? 'leased' : printerState === 'queued' ? 'pending' : 'printed'}`}>
            {printerState === 'printing' ? 'Printing now' : printerState === 'error' ? 'Needs attention' : printerState === 'queued' ? 'Jobs queued' : 'Idle'}
          </span>
        </div>
        <div className="life-print-status-grid">
          <div className="life-print-status-card">
            <span className="life-print-status-label">Latest board activity</span>
            <span className="life-print-status-value">
              {latestLease ? whenLabel(latestTimestamp(latestLease), timezone) : 'No lease activity yet'}
            </span>
          </div>
          <div className="life-print-status-card">
            <span className="life-print-status-label">Latest ESP error</span>
            <span className={`life-print-status-value${latestBoardError ? ' is-error' : ''}`}>
              {latestBoardError?.last_error || 'No device errors reported'}
            </span>
          </div>
        </div>
      </section>

      <div className="life-print-filterbar">
        <LifeMenu
          ariaLabel="Filter by project"
          value={projectFilter}
          options={[
            { value: 'all', label: 'All projects' },
            ...projectOptions.map((slug) => ({
              value: slug,
              label: labelFor(slug),
            })),
          ]}
          onChange={(value) => setProjectFilter(value)}
        />
        <label className="life-print-check-label">
          <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />
          Show completed
        </label>
      </div>

      {/* NEEDS PRINTING */}
      <section className="life-print-bucket">
        <div className="life-print-bucket-head">
          <h3>Needs Printing</h3>
          <span className="life-print-count">{needsPrinting.length}</span>
        </div>
        {needsPrinting.length === 0 ? (
          <div className="life-empty">Nothing waiting to print.</div>
        ) : (
          <LifeTable<TaskRecord>
            columns={needsPrintingColumns}
            rows={needsPrinting}
            getRowId={(task) => task.id}
            selectable
            onBulk={bulkQueue}
            bulkLabel="Queue for desk"
          />
        )}
      </section>

      {/* QUEUE */}
      <section className="life-print-bucket">
        <div className="life-print-bucket-head">
          <h3>Queue</h3>
          <span className="life-print-count">{queueJobs.length}</span>
        </div>
        {queueJobs.length === 0 ? (
          <div className="life-empty">No jobs waiting for the printer.</div>
        ) : (
          <LifeTable<PrintJobRecord>
            columns={queueColumns}
            rows={queueJobs}
            getRowId={(job) => job.id}
            rowActions={(job) => (
              <button type="button" className="life-btn ghost" disabled={busy} onClick={() => cancel(job.id)}>
                Cancel
              </button>
            )}
          />
        )}
      </section>

      {/* NEEDS ATTENTION */}
      <section className="life-print-bucket">
        <div className="life-print-bucket-head">
          <h3>Needs Attention</h3>
          <span className="life-print-count">{attentionJobs.length}</span>
        </div>
        {attentionJobs.length === 0 ? (
          <div className="life-empty">No failed or stuck jobs.</div>
        ) : (
          <LifeTable<PrintJobRecord>
            columns={attentionColumns}
            rows={attentionJobs}
            getRowId={(job) => job.id}
            rowActions={(job) => (
              <>
                <button type="button" className="life-btn ghost" disabled={busy} onClick={() => retry(job.id)}>
                  Retry
                </button>
                {isLeaseStale(job, now) ? (
                  <button type="button" className="life-btn ghost" disabled={busy} onClick={() => cancel(job.id)}>
                    Cancel
                  </button>
                ) : null}
                <button type="button" className="life-btn ghost" disabled={busy} onClick={() => remove(job.id)}>
                  Delete
                </button>
              </>
            )}
          />
        )}
      </section>

      {/* PRINTED */}
      <section className="life-print-bucket">
        <div className="life-print-bucket-head">
          <h3>Printed</h3>
          <span className="life-print-count">{printedJobs.length}</span>
        </div>
        {printedJobs.length === 0 ? (
          <div className="life-empty">No receipts printed yet.</div>
        ) : (
          <LifeTable<PrintJobRecord>
            columns={printedColumns}
            rows={printedJobs}
            getRowId={(job) => job.id}
            rowActions={(job) =>
              job.task_id ? (
                <button type="button" className="life-btn ghost" disabled={busy} onClick={() => reprint(job.task_id as string)}>
                  Reprint
                </button>
              ) : null
            }
          />
        )}
      </section>
    </div>
  )
}
