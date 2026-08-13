import { NextRequest, NextResponse } from 'next/server'

import { isAuthenticatedPrinterRequest, unauthorizedJson } from '@/lib/life/auth'
import { claimPrintJob, DEFAULT_PRINT_DEVICE } from '@/lib/life/print-jobs'

/**
 * The desk ESP32 polls this every 5–10s to lease one pending receipt. The lease
 * is atomic (no two devices get the same job) and expired leases are reclaimed
 * inside the same call, so a device that lost power/Wi-Fi never strands a job.
 *
 * Response: { job: { id, payload, leaseExpiresAt } } or { job: null } when idle.
 * Only the compact receipt payload is sent — no task list, no personal data.
 */
export async function POST(request: NextRequest) {
  if (!isAuthenticatedPrinterRequest(request)) {
    return unauthorizedJson()
  }

  try {
    const body = (await request.json().catch(() => null)) as { deviceId?: string } | null
    const deviceId = body?.deviceId?.trim() || DEFAULT_PRINT_DEVICE
    const job = await claimPrintJob(deviceId)

    if (!job) {
      return NextResponse.json({ job: null })
    }

    return NextResponse.json({
      job: {
        id: job.id,
        payload: job.receipt_payload,
        leaseExpiresAt: job.lease_expires_at,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Claim failed.' },
      { status: 500 },
    )
  }
}
