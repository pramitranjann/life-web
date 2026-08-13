import { createHash } from 'node:crypto'

import { OWNER_ID } from '@/lib/life/constants'
import { sendLifeNotificationEmail } from '@/lib/life/email'
import { createLifeNotification } from '@/lib/life/notifications'
import { getSupabaseAdmin } from '@/lib/life/supabase'
import type { ProgramApplicationMonitorRecord } from '@/lib/life/types'

const CLAUDE_CAMPUS_URL = 'https://claude.com/programs/campus'
const CODEX_AMBASSADORS_URL = 'https://developers.openai.com/community/codex-ambassadors'
const OPENAI_CAMPUS_NETWORK_URL = 'https://openai.com/index/openai-campus-network-student-club-interest-form/'

const OPEN_PATTERNS = [
  /applications? (?:are )?(?:now )?(?:open|being accepted)/i,
  /accepting applications?/i,
  /applications? now accepting/i,
  /apply now/i,
]
const CLOSED_PATTERNS = [/applications? (?:have )?closed/i, /applications? are closed/i]
const PAUSED_PATTERNS = [/applications? paused/i, /applications? are currently paused/i]
const EXPLICIT_DATE_PATTERN = /\b(?:applications?|cohort)\b.{0,140}\b(?:opens?|reopens?|starts?|begins?)\b.{0,100}\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|20\d{2}|\d{1,2}[/-]\d{1,2})\b/i

type ProgramApplicationStatus =
  | 'open'
  | 'date_announced'
  | 'closed'
  | 'paused'
  | 'rolling_interest'
  | 'no_window'
  | 'unknown'

type Observation = {
  status: ProgramApplicationStatus
  excerpt: string
}

type ProgramDefinition = {
  key: string
  name: string
  type: string
  url: string
  inspect: (pageText: string) => Observation
}

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

export function htmlToMonitorText(html: string) {
  return decodeHtml(
    html
      .replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>|<\/div>|<\/section>|<\/h[1-6]>|<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function section(text: string, start: RegExp, end?: RegExp) {
  const startMatch = start.exec(text)
  if (!startMatch?.index && startMatch?.index !== 0) {
    return text
  }

  const fromStart = text.slice(startMatch.index)
  if (!end) {
    return fromStart
  }

  const endMatch = end.exec(fromStart.slice(startMatch[0].length))
  if (!endMatch?.index && endMatch?.index !== 0) {
    return fromStart
  }

  return fromStart.slice(0, startMatch[0].length + endMatch.index)
}

function excerptAround(text: string, patterns: RegExp[], fallback: string) {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match?.index !== undefined) {
      const start = Math.max(0, match.index - 180)
      const end = Math.min(text.length, match.index + match[0].length + 240)
      return text.slice(start, end).replace(/\s+/g, ' ').trim()
    }
  }

  return fallback.replace(/\s+/g, ' ').trim().slice(0, 420)
}

function classify(text: string, fallbackStatus: Extract<ProgramApplicationStatus, 'rolling_interest' | 'no_window' | 'unknown'>): Observation {
  const excerptPatterns = [...OPEN_PATTERNS, EXPLICIT_DATE_PATTERN, ...PAUSED_PATTERNS, ...CLOSED_PATTERNS]
  const excerpt = excerptAround(text, excerptPatterns, text)

  if (OPEN_PATTERNS.some((pattern) => pattern.test(text))) {
    return { status: 'open', excerpt }
  }
  if (EXPLICIT_DATE_PATTERN.test(text)) {
    return { status: 'date_announced', excerpt }
  }
  if (PAUSED_PATTERNS.some((pattern) => pattern.test(text))) {
    return { status: 'paused', excerpt }
  }
  if (CLOSED_PATTERNS.some((pattern) => pattern.test(text))) {
    return { status: 'closed', excerpt }
  }

  return { status: fallbackStatus, excerpt }
}

export function inspectClaudeCampusAmbassador(pageText: string) {
  return classify(
    section(pageText, /Supporting student builders|Claude Campus Ambassador/i, /Claude Builder Clubs/i),
    'unknown',
  )
}

export function inspectClaudeBuilderClub(pageText: string) {
  return classify(
    section(pageText, /Claude Builder Clubs/i, /Why join a Claude campus program/i),
    'no_window',
  )
}

export function inspectCodexAmbassadors(pageText: string) {
  return classify(
    section(pageText, /Codex Ambassadors/i, /What ambassadors do/i),
    'unknown',
  )
}

export function inspectOpenAICampusNetwork(pageText: string) {
  const tracked = section(pageText, /OpenAI Campus Network/i)
  const observation = classify(tracked, 'rolling_interest')
  if (observation.status !== 'rolling_interest') {
    return observation
  }

  return {
    status: observation.status,
    excerpt: excerptAround(tracked, [/student club interest form/i, /tell us about your student club/i, /submit/i], tracked),
  }
}

const PROGRAMS: ProgramDefinition[] = [
  {
    key: 'claude-campus-ambassador',
    name: 'Claude Campus Ambassador',
    type: 'Paid, campus-specific, 10-week',
    url: CLAUDE_CAMPUS_URL,
    inspect: inspectClaudeCampusAmbassador,
  },
  {
    key: 'claude-builder-club',
    name: 'Claude Builder Club',
    type: 'Cohort-based, club-lead application',
    url: CLAUDE_CAMPUS_URL,
    inspect: inspectClaudeBuilderClub,
  },
  {
    key: 'codex-ambassadors',
    name: 'Codex Ambassadors',
    type: 'City/community-based, honorarium',
    url: CODEX_AMBASSADORS_URL,
    inspect: inspectCodexAmbassadors,
  },
  {
    key: 'openai-campus-network',
    name: 'OpenAI Campus Network',
    type: 'Student club program',
    url: OPENAI_CAMPUS_NETWORK_URL,
    inspect: inspectOpenAICampusNetwork,
  },
]

function statusHash(status: ProgramApplicationStatus, excerpt: string) {
  return createHash('sha256')
    .update(`${status}\n${excerpt.toLowerCase().replace(/\s+/g, ' ').trim()}`)
    .digest('hex')
}

function isActionableStatus(status: ProgramApplicationStatus) {
  return status === 'open' || status === 'date_announced'
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'PRLife-Application-Monitor/1.0 (+https://life.pramitranjan.com)',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`)
  }

  return htmlToMonitorText(await response.text())
}

async function checkProgram(
  program: ProgramDefinition,
  loadPage: (url: string) => Promise<string>,
) {
  const supabase = getSupabaseAdmin()
  const checkedAt = new Date().toISOString()
  const { data: existing, error: existingError } = await supabase
    .from('program_application_monitors')
    .select('*')
    .eq('user_id', OWNER_ID)
    .eq('program_key', program.key)
    .maybeSingle<ProgramApplicationMonitorRecord>()

  if (existingError) {
    throw existingError
  }

  try {
    const pageText = await loadPage(program.url)
    const observation = program.inspect(pageText)
    const hash = statusHash(observation.status, observation.excerpt)
    const changed = Boolean(existing && (
      existing.status !== observation.status || existing.status_hash !== hash
    ))
    const shouldNotify = Boolean(existing && changed && isActionableStatus(observation.status))
    let notified = false
    let lastNotifiedHash = existing?.last_notified_hash || null

    if (shouldNotify && lastNotifiedHash !== hash) {
      const title = observation.status === 'open'
        ? `${program.name} applications are open`
        : `${program.name} announced an application date`
      const notification = await createLifeNotification({
        kind: 'program_application',
        title,
        body: observation.excerpt,
        url: program.url,
        metadata: {
          programKey: program.key,
          programName: program.name,
          status: observation.status,
          statusHash: hash,
        },
        dedupeKey: `program-application:${program.key}:${hash}`,
      })

      if (notification) {
        notified = true
        await sendLifeNotificationEmail({
          title,
          body: observation.excerpt,
          url: program.url,
        })
      }
      lastNotifiedHash = hash
    }

    const { error: upsertError } = await supabase
      .from('program_application_monitors')
      .upsert({
        program_key: program.key,
        user_id: OWNER_ID,
        program_name: program.name,
        program_type: program.type,
        url: program.url,
        status: observation.status,
        status_excerpt: observation.excerpt,
        status_hash: hash,
        last_checked_at: checkedAt,
        last_changed_at: changed || !existing ? checkedAt : existing.last_changed_at,
        last_notified_hash: lastNotifiedHash,
        last_error: null,
        updated_at: checkedAt,
      }, { onConflict: 'program_key' })

    if (upsertError) {
      throw upsertError
    }

    return {
      programKey: program.key,
      status: observation.status,
      changed,
      notified,
      baseline: !existing,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown application monitor error.'
    if (existing) {
      const { error: updateError } = await supabase
        .from('program_application_monitors')
        .update({
          last_checked_at: checkedAt,
          last_error: message,
          updated_at: checkedAt,
        })
        .eq('user_id', OWNER_ID)
        .eq('program_key', program.key)

      if (updateError) {
        console.error(`Failed to persist ${program.key} monitor error`, updateError)
      }
    }

    console.error(`Application monitor failed for ${program.key}`, error)
    return { programKey: program.key, error: message }
  }
}

export async function runProgramApplicationChecks() {
  const pages = new Map<string, Promise<string>>()
  const loadPage = (url: string) => {
    const existing = pages.get(url)
    if (existing) {
      return existing
    }

    const request = fetchPage(url)
    pages.set(url, request)
    return request
  }

  return Promise.all(PROGRAMS.map(async (program) => {
    try {
      return await checkProgram(program, loadPage)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown application monitor error.'
      console.error(`Application monitor setup failed for ${program.key}`, error)
      return { programKey: program.key, error: message }
    }
  }))
}
