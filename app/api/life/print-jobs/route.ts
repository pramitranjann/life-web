import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { createPrintJob, getPrintJobs } from '@/lib/life/print-jobs'
import type { ReceiptLayout } from '@/lib/life/receipt'
import { getTaskById } from '@/lib/life/tasks'

const VALID_LAYOUTS = new Set<ReceiptLayout>(['compact', 'standard', 'focus'])

export async function GET(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const jobs = await getPrintJobs()
    return NextResponse.json({ jobs })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load print jobs.' },
      { status: 500 },
    )
  }
}

/**
 * Queue a durable receipt for a task (the manual "Print task" action). Never
 * prints from the browser — it only creates the job the ESP32 will lease.
 * `reprint: true` is the explicit override that forces a new job even when one
 * already printed; otherwise an existing active job is returned as a duplicate.
 */
export async function POST(request: NextRequest) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      taskId?: string
      reprint?: boolean
      layout?: ReceiptLayout
    } | null

    const taskId = body?.taskId?.trim()
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required.' }, { status: 400 })
    }
    if (body?.layout && !VALID_LAYOUTS.has(body.layout)) {
      return NextResponse.json({ error: 'Invalid print layout.' }, { status: 400 })
    }

    const task = await getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
    }

    const { job, duplicate } = await createPrintJob({
      task,
      layout: body?.layout,
      allowDuplicate: body?.reprint === true,
    })

    return NextResponse.json({ job, duplicate })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue print job.' },
      { status: 500 },
    )
  }
}
