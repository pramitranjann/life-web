import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

const SAFE_BR_TAG = /<br\s*\/?>/gi
const SAFE_SPAN_OPEN_TAG = /<span\s+style\s*=\s*"color:\s*#[0-9a-f]{3,8}"\s*>/gi
const SAFE_SPAN_CLOSE_TAG = /<\/span>/gi
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 8
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const ALLOWED_EMBED_HOSTS = [
  /(^|\.)open\.spotify\.com$/i,
  /(^|\.)vercel\.app$/i,
  /(^|\.)pramitranjan\.com$/i,
]

function trimUrl(value: string) {
  return value.trim()
}

function getDevEmbedHostAllowed(hostname: string) {
  return process.env.NODE_ENV !== 'production' && (hostname === 'localhost' || hostname === '127.0.0.1')
}

function cleanExpiredLoginAttempts(now: number) {
  for (const [key, record] of loginAttempts.entries()) {
    if (record.resetAt <= now) {
      loginAttempts.delete(key)
    }
  }
}

function getClientKey(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  const userAgent = request.headers.get('user-agent')?.trim() || 'unknown'
  return `${forwardedFor || realIp || 'unknown'}:${userAgent}`
}

export function constantTimeEqual(left: string, right: string) {
  const leftHash = createHash('sha256').update(left, 'utf8').digest()
  const rightHash = createHash('sha256').update(right, 'utf8').digest()
  return timingSafeEqual(leftHash, rightHash)
}

export function isSafeRichTextHtml(value: string) {
  const stripped = value
    .replace(SAFE_BR_TAG, '')
    .replace(SAFE_SPAN_OPEN_TAG, '')
    .replace(SAFE_SPAN_CLOSE_TAG, '')

  return !/[<>]/.test(stripped)
}

export function isSafeLinkHref(value: string) {
  const trimmed = trimUrl(value)
  if (!trimmed) return false

  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//')
  }

  if (trimmed.startsWith('#')) {
    return true
  }

  try {
    const url = new URL(trimmed)
    if (url.username || url.password) return false

    return (
      url.protocol === 'https:' ||
      url.protocol === 'http:' ||
      url.protocol === 'mailto:' ||
      url.protocol === 'tel:'
    )
  } catch {
    return false
  }
}

export function isSafeEmbedUrl(value: string) {
  const trimmed = trimUrl(value)
  if (!trimmed) return false

  // Same-origin relative paths (e.g. vendored prototypes under /proto/) are safe by definition.
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//')
  }

  try {
    const url = new URL(trimmed)
    if (url.username || url.password) return false

    if (getDevEmbedHostAllowed(url.hostname)) {
      return url.protocol === 'http:' || url.protocol === 'https:'
    }

    if (url.protocol !== 'https:') return false

    return ALLOWED_EMBED_HOSTS.some((pattern) => pattern.test(url.hostname))
  } catch {
    return false
  }
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const protocol =
    request.headers.get('x-forwarded-proto') ??
    (host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https')

  if (!origin || !host) return false

  return origin === `${protocol}://${host}`
}

export function getLoginThrottleState(request: NextRequest) {
  const now = Date.now()
  cleanExpiredLoginAttempts(now)

  const record = loginAttempts.get(getClientKey(request))
  if (!record) {
    return { limited: false, retryAfterSeconds: 0, remaining: MAX_LOGIN_ATTEMPTS }
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000))
  return {
    limited: record.count >= MAX_LOGIN_ATTEMPTS,
    retryAfterSeconds,
    remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - record.count),
  }
}

export function recordFailedLoginAttempt(request: NextRequest) {
  const now = Date.now()
  cleanExpiredLoginAttempts(now)

  const key = getClientKey(request)
  const current = loginAttempts.get(key)

  if (!current || current.resetAt <= now) {
    const record = { count: 1, resetAt: now + LOGIN_WINDOW_MS }
    loginAttempts.set(key, record)
    return {
      limited: false,
      retryAfterSeconds: Math.ceil(LOGIN_WINDOW_MS / 1000),
      remaining: MAX_LOGIN_ATTEMPTS - record.count,
    }
  }

  current.count += 1
  loginAttempts.set(key, current)

  return {
    limited: current.count >= MAX_LOGIN_ATTEMPTS,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - current.count),
  }
}

export function clearLoginThrottleState(request: NextRequest) {
  loginAttempts.delete(getClientKey(request))
}
