import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedLifeRequest, unauthorizedJson } from '@/lib/life/auth'
import { cancelPrintJob, deletePrintJob, retryPrintJob } from '@/lib/life/print-jobs'

/** Retry, cancel, or remove a print job. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<unknown> },
) {
  if (!isAuthenticatedLifeRequest(request)) {
    return unauthorizedJson()
  }

  const { jobId } = (await context.params) as { jobId: string }

  try {
    const body = (await request.json().catch(() => null)) as { action?: string } | null
    const action = body?.action || 'retry'

    if (action === 'retry') {
      const job = await retryPrintJob(jobId)
      return NextResponse.json({ job })
    }

    if (action === 'cancel') {
      const job = await cancelPrintJob(jobId)
      return NextResponse.json({ job })
    }

    if (action === 'delete') {
      const job = await deletePrintJob(jobId)
      return NextResponse.json({ job })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Print job action failed.' },
      { status: 500 },
    )
  }
}
