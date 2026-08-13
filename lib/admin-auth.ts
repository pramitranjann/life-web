import 'server-only'

import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { constantTimeEqual } from '@/lib/security'

const SESSION_COOKIE = 'life_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14

function getAdminPassword() {
  const value = process.env.ADMIN_PASSWORD
  if (!value) throw new Error('ADMIN_PASSWORD is not set')
  return value
}

function getSessionSecret() {
  const value = process.env.ADMIN_SESSION_SECRET
  if (!value) throw new Error('ADMIN_SESSION_SECRET is not set')
  return value
}

function sign(value: string) {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('hex')
}

export function verifyAdminPassword(password: string) {
  const expected = getAdminPassword()
  return constantTimeEqual(password, expected)
}

export function createAdminSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload = `${expiresAt}`
  return `${payload}.${sign(payload)}`
}

export function isValidAdminSessionToken(token: string | undefined) {
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  if (!constantTimeEqual(sign(payload), signature)) return false

  const expiresAt = Number(payload)
  if (!Number.isFinite(expiresAt)) return false

  return Date.now() < expiresAt
}

export function hasValidAdminSession(request: NextRequest) {
  return isValidAdminSessionToken(request.cookies.get(SESSION_COOKIE)?.value)
}

export async function isAdminSession() {
  const cookieStore = await cookies()
  return isValidAdminSessionToken(cookieStore.get(SESSION_COOKIE)?.value)
}

export function getAdminCookieName() {
  return SESSION_COOKIE
}
