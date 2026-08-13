import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedPrinterRequest, unauthorizedJson } from '@/lib/life/auth'
import { completePrintJob, DEFAULT_PRINT_DEVICE } from '@/lib/life/print-jobs'

/**
 * The ESP32 reports the outcome of a leased job. A job is marked `printed` ONLY
 * after the device confirms it sent the bytes to the printer; otherwise `failed`
 * with a reason. Only the lease-holding device can complete its job, and only a
 * still-leased job is accepted — a late report for an already-reclaimed lease is
 * ignored (the job has, or will, reprint). A rare duplicate is acceptable;
 * silently losing a job is not.
 */
export async function POST(request: NextRequest) {
  if (!isAuthenticatedPrinterRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      jobId?: string
      deviceId?: string
      success?: boolean
      error?: string | null
    } | null

    const jobId = body?.jobId?.trim()
    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })
    }

    const job = await completePrintJob({
      jobId,
      deviceId: body?.deviceId?.trim() || DEFAULT_PRINT_DEVICE,
      success: body?.success === true,
      error: body?.error ?? null,
    })

    // No row updated: the lease expired and was reclaimed, or this device no
    // longer holds it. Acknowledge without error so the device moves on.
    return NextResponse.json({ ok: true, applied: Boolean(job), status: job?.status ?? null })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Complete failed.' },
      { status: 500 },
    )
  }
}
