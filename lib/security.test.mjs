import assert from 'node:assert/strict'
import test from 'node:test'

const { isSameOriginRequest } = await import('./security.ts')

function request(url, headers) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  )

  return {
    nextUrl: new URL(url),
    headers: {
      get(name) {
        return normalizedHeaders.get(name.toLowerCase()) ?? null
      },
    },
  }
}

test('accepts the browser-facing origin when Vercel forwards a deployment host', () => {
  assert.equal(
    isSameOriginRequest(
      request('https://life.pramitranjan.com/api/admin/login', {
        origin: 'https://life.pramitranjan.com',
        host: 'life.pramitranjan.com',
        'x-forwarded-host': 'life-dzrus0z2r-pramitranjann.vercel.app',
        'x-forwarded-proto': 'https',
      })
    ),
    true
  )
})

test('rejects a foreign origin', () => {
  assert.equal(
    isSameOriginRequest(
      request('https://life.pramitranjan.com/api/admin/login', {
        origin: 'https://attacker.example',
        host: 'life.pramitranjan.com',
        'x-forwarded-proto': 'https',
      })
    ),
    false
  )
})

test('accepts a missing Origin header when browser metadata proves same origin', () => {
  assert.equal(
    isSameOriginRequest(
      request('https://life.pramitranjan.com/api/admin/login', {
        host: 'life.pramitranjan.com',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-proto': 'https',
      })
    ),
    true
  )
})

test('rejects requests without Origin or same-origin browser metadata', () => {
  assert.equal(
    isSameOriginRequest(
      request('https://life.pramitranjan.com/api/admin/login', {
        host: 'life.pramitranjan.com',
        'x-forwarded-proto': 'https',
      })
    ),
    false
  )
})

test('rejects missing Origin from a cross-origin browser request', () => {
  assert.equal(
    isSameOriginRequest(
      request('https://life.pramitranjan.com/api/admin/login', {
        host: 'life.pramitranjan.com',
        'sec-fetch-site': 'cross-site',
        'x-forwarded-proto': 'https',
      })
    ),
    false
  )
})
