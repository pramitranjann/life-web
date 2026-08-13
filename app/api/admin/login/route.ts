import { NextRequest, NextResponse } from 'next/server'
import { createAdminSessionToken, getAdminCookieName, verifyAdminPassword } from '@/lib/admin-auth'
import {
  clearLoginThrottleState,
  getLoginThrottleState,
  isSameOriginRequest,
  recordFailedLoginAttempt,
} from '@/lib/security'

function getSafeNextPath(value: string | null | undefined) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function loginRedirectUrl(request: NextRequest, nextPath: string, error: 'invalid' | 'rate_limited') {
  const url = new URL('/login', request.url)
  url.searchParams.set('next', nextPath)
  url.searchParams.set('error', error)
  return url
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const throttleState = getLoginThrottleState(request)
  if (throttleState.limited) {
    const contentType = request.headers.get('content-type') || ''
    const isJsonRequest = contentType.includes('application/json')

    if (!isJsonRequest) {
      const formData = await request.formData().catch(() => null)
      const nextPath = getSafeNextPath(typeof formData?.get('nextPath') === 'string' ? String(formData.get('nextPath')) : null)
      return NextResponse.redirect(loginRedirectUrl(request, nextPath, 'rate_limited'), {
        status: 303,
        headers: { 'Retry-After': `${throttleState.retryAfterSeconds}` },
      })
    }

    return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, {
      status: 429,
      headers: { 'Retry-After': `${throttleState.retryAfterSeconds}` },
    })
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    const isJsonRequest = contentType.includes('application/json')
    let nextPath = '/'
    let password = ''

    if (isJsonRequest) {
      const body = await request.json()
      password = typeof body?.password === 'string' ? body.password : ''
    } else {
      const formData = await request.formData()
      password = typeof formData.get('password') === 'string' ? String(formData.get('password')) : ''
      nextPath = getSafeNextPath(typeof formData.get('nextPath') === 'string' ? String(formData.get('nextPath')) : null)
    }

    if (!password || !verifyAdminPassword(password)) {
      const failedAttempt = recordFailedLoginAttempt(request)

      if (!isJsonRequest) {
        return NextResponse.redirect(loginRedirectUrl(request, nextPath, failedAttempt.limited ? 'rate_limited' : 'invalid'), {
          status: 303,
          headers: { 'Retry-After': `${failedAttempt.retryAfterSeconds}` },
        })
      }

      return NextResponse.json(
        {
          error: failedAttempt.limited
            ? 'Too many login attempts. Try again later.'
            : 'Invalid password',
        },
        {
          status: failedAttempt.limited ? 429 : 401,
          headers: { 'Retry-After': `${failedAttempt.retryAfterSeconds}` },
        }
      )
    }

    clearLoginThrottleState(request)

    const response = isJsonRequest
      ? NextResponse.json({ ok: true })
      : NextResponse.redirect(new URL(nextPath, request.url), { status: 303 })

    response.cookies.set(getAdminCookieName(), createAdminSessionToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
      priority: 'high',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
