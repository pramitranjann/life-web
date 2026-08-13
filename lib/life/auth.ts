import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { hasValidAdminSession } from '@/lib/admin-auth'
import { constantTimeEqual } from '@/lib/security'
import { getLifeServerEnv } from '@/lib/life/env'

export function isAuthenticatedLifeRequest(request: NextRequest) {
  if (hasValidAdminSession(request)) {
    return true
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const presented = authHeader.slice('Bearer '.length)
  const env = getLifeServerEnv()
  if (env.cronSecretOptional && constantTimeEqual(presented, env.cronSecretOptional)) {
    return true
  }
  if (env.mobileToken && constantTimeEqual(presented, env.mobileToken)) {
    return true
  }
  return false
}

/**
 * Authenticate the desk ESP32. Deliberately separate from
 * isAuthenticatedLifeRequest: the device presents ONLY the PRINTER_DEVICE_TOKEN
 * and gets access to nothing beyond the printer claim/complete endpoints. Admin
 * sessions and the cron/mobile tokens are NOT accepted here.
 */
export function isAuthenticatedPrinterRequest(request: NextRequest) {
  const token = getLifeServerEnv().printerDeviceToken
  if (!token) {
    return false
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  return constantTimeEqual(authHeader.slice('Bearer '.length), token)
}

export function unauthorizedJson() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
