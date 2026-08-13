function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

export function getLifeServerEnv() {
  return {
    get supabaseUrl() {
      return requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    },
    get supabaseServiceRoleKey() {
      return requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    },
    get anthropicApiKey() {
      return requireEnv('ANTHROPIC_API_KEY')
    },
    get resendApiKey() {
      return requireEnv('RESEND_API_KEY')
    },
    get cronSecret() {
      return requireEnv('CRON_SECRET')
    },
    // Non-throwing variant for auth fallthrough: returns null when unset so a
    // missing CRON_SECRET yields a clean 401 instead of a 500, and other bearer
    // tokens (mobile/device) can still be checked.
    get cronSecretOptional(): string | null {
      return process.env.CRON_SECRET ?? null
    },
    // Optional: dedicated bearer token for native companion apps.
    // Returns null when unset so auth simply skips it.
    get mobileToken(): string | null {
      return process.env.LIFE_MOBILE_TOKEN ?? null
    },
    // Dedicated bearer token for the desk ESP32. Scoped ONLY to the printer
    // claim/complete endpoints — never grants admin/cron access. Null when
    // unset so the printer endpoints simply reject all requests.
    get printerDeviceToken(): string | null {
      return process.env.PRINTER_DEVICE_TOKEN ?? null
    },
    ownerEmail: process.env.OWNER_EMAIL || 'pramit@pramitranjan.com',
    ownerTimezone: process.env.OWNER_TIMEZONE || 'UTC',
    get googleClientId() {
      return requireEnv('GOOGLE_CLIENT_ID')
    },
    get googleClientSecret() {
      return requireEnv('GOOGLE_CLIENT_SECRET')
    },
    get googleRefreshToken() {
      return requireEnv('GOOGLE_REFRESH_TOKEN')
    },
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  }
}
