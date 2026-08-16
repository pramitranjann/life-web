'use client'

import { useState, type FormEvent } from 'react'

function getSafeNextPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  if (value === '/life') return '/'
  if (value.startsWith('/life/')) return value.slice('/life'.length)
  return value
}

function getLoginError(status: number, serverError?: string) {
  if (status === 401) return 'Incorrect password. Try again.'
  if (status === 403) return 'This login request was blocked. Reload the page and try again.'
  if (status === 429) return 'Too many login attempts. Try again later.'
  return serverError || 'Login failed. Try again.'
}

export function LifeLoginForm({ nextPath = '/' }: { nextPath?: string }) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const form = event.currentTarget
    const password = String(new FormData(form).get('password') || '')

    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; ok?: boolean }

      if (!response.ok || !result.ok) {
        setError(getLoginError(response.status, result.error))
        return
      }

      window.location.assign(getSafeNextPath(nextPath))
    } catch {
      setError('Could not reach Life. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="life-login-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Password</span>
        <input
          aria-describedby={error ? 'life-login-error' : undefined}
          autoComplete="current-password"
          className="text-input"
          name="password"
          type="password"
          required
        />
      </label>
      {error ? (
        <p aria-live="polite" className="error-text" id="life-login-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Entering…' : 'Enter'}
      </button>
    </form>
  )
}
