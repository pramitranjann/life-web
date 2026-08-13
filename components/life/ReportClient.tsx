'use client'

import { useEffect, useMemo, useState } from 'react'

import { useViewportMode } from '@/hooks/useViewportMode'
import { fetchJson } from '@/lib/life/client'
import { parseReportSections, sectionKey } from '@/lib/life/markdown-sections'
import { localDateTimeToUtc } from '@/lib/life/time'
import type {
  CalendarEventRecord,
  EntryRecord,
  ReportRecord,
  TaskRecord,
} from '@/lib/life/types'

interface ReportsListResponse {
  localDate: string
  timezone: string
  reports: ReportRecord[]
}

interface ReportDetailResponse {
  timezone: string
  report: ReportRecord
  context: {
    entries: EntryRecord[]
    events: CalendarEventRecord[]
    openTasks: TaskRecord[]
    completedTasks: TaskRecord[]
  }
}

type ReportDetailState = ReportDetailResponse['context'] & {
  report: ReportRecord
}

interface ReportClientProps {
  initialList?: ReportsListResponse
  initialSelectedId?: string | null
  initialDetail?: ReportDetailState | null
}

interface StructuredSection {
  label: string
  body: string
}

const TYPE_LABEL: Record<string, string> = {
  eod: 'Evening brief',
  morning: 'Morning brief',
  weekly: 'Week ahead',
}

const TYPE_SHORT: Record<string, string> = {
  eod: 'Evening',
  morning: 'Morning',
  weekly: 'Weekly',
}

const TITLE_SECTION_KEYS = [
  'what-happened',
  'what-happened-today',
  'one-thing',
  'one-intention',
  'one-thing-worth-sitting-with',
  'tension',
]

const PULL_QUOTE_KEYS = new Set([
  'one-thing',
  'one-intention',
  'one-thing-worth-sitting-with',
])

const FALLBACK_SECTION_LABELS = [
  'What happened today',
  'What happened',
  'Decisions made',
  'Open loops',
  'Tension',
  'One thing worth sitting with',
  'One thing',
]

function shortDay(localDate: string, timeZone: string) {
  const date = localDateTimeToUtc(localDate, timeZone, 12, 0)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
  }).formatToParts(date)
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.day} ${lookup.month}`
}

function stripMarkdown(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`>#]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getFallbackStructuredSections(content: string): StructuredSection[] {
  const clean = stripMarkdown(content).replace(/\s+/g, ' ').trim()
  if (!clean) return []

  const matcher = new RegExp(
    `(${FALLBACK_SECTION_LABELS.map(escapeRegExp).join('|')})`,
    'gi',
  )
  const matches = Array.from(clean.matchAll(matcher))
  if (matches.length === 0) return []

  return matches
    .map((match, index) => {
      const label = match[0].trim()
      const start = (match.index || 0) + match[0].length
      const end = index + 1 < matches.length ? matches[index + 1].index || clean.length : clean.length
      const body = clean.slice(start, end).trim().replace(/^[-:–—]\s*/, '')
      return body ? { label, body } : null
    })
    .filter((section): section is StructuredSection => Boolean(section))
}

function getStructuredSections(content: string): StructuredSection[] {
  const parsed = parseReportSections(content)
  if (parsed.length > 1) return parsed

  if (parsed.length === 1) {
    const fromBody = getFallbackStructuredSections(parsed[0].body)
    if (fromBody.length > 0) return fromBody
    return parsed
  }

  return getFallbackStructuredSections(content)
}

function trimSentence(value: string, maxLength = 72) {
  const clean = value.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
  if (clean.length <= maxLength) return clean
  const clipped = clean.slice(0, maxLength)
  const boundary = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, boundary > 0 ? boundary : clipped.length)}…`
}

function firstSentence(value: string) {
  const sentences = stripMarkdown(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  return sentences[0] || ''
}

function trimOuterQuotes(value: string) {
  let next = value.trim()
  while (
    (next.startsWith('"') && next.endsWith('"')) ||
    (next.startsWith("'") && next.endsWith("'")) ||
    (next.startsWith('“') && next.endsWith('”'))
  ) {
    next = next.slice(1, -1).trim()
  }
  return next.replace(/^["“”'\s]+/, '').replace(/["“”'\s]+$/, '').trim()
}

function getReportTitle(report: ReportRecord) {
  const sections = getStructuredSections(report.content)
  for (const key of TITLE_SECTION_KEYS) {
    const section = sections.find((candidate) => sectionKey(candidate.label) === key)
    if (section) {
      const sentence = firstSentence(section.body)
      if (sentence) return trimSentence(sentence)
    }
  }

  const firstSectionSentence = firstSentence(sections[0]?.body || '')
  if (firstSectionSentence) return trimSentence(firstSectionSentence)

  const fallback = firstSentence(report.content)
  if (fallback) return trimSentence(fallback)

  return TYPE_LABEL[report.type] || 'Report'
}

function getPullQuote(detail: ReportDetailState) {
  const sections = getStructuredSections(detail.report.content)
  const section = sections.find((candidate) => PULL_QUOTE_KEYS.has(sectionKey(candidate.label)))
  if (!section) return null

  const clean = stripMarkdown(section.body)
  if (!clean) return null

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length >= 2) {
    return {
      label: section.label,
      lead: trimOuterQuotes(sentences.slice(0, -1).join(' ').trim()),
      accent: trimOuterQuotes(sentences.at(-1)?.trim() || ''),
    }
  }

  return {
    label: section.label,
    lead: trimOuterQuotes(clean),
    accent: '',
  }
}

function getBodySections(detail: ReportDetailState) {
  return getStructuredSections(detail.report.content)
    .filter((section) => !PULL_QUOTE_KEYS.has(sectionKey(section.label)))
    .map((section) => ({
      ...section,
      key: sectionKey(section.label),
      paragraphs: stripMarkdown(section.body)
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    }))
}

function getReportMetrics(detail: ReportDetailState) {
  return [
    { label: 'Captures', value: detail.entries.length },
    { label: 'Events', value: detail.events.length },
    { label: 'Tasks', value: detail.openTasks.length + detail.completedTasks.length },
  ]
}

export function ReportClient({
  initialList,
  initialSelectedId = null,
  initialDetail = null,
}: ReportClientProps) {
  const viewport = useViewportMode()
  const [reports, setReports] = useState<ReportRecord[]>(initialList?.reports || [])
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [detailCache, setDetailCache] = useState<Record<string, ReportDetailState>>(
    initialDetail ? { [initialDetail.report.id]: initialDetail } : {},
  )
  const [timezone, setTimezone] = useState(initialList?.timezone || 'UTC')
  const [loading, setLoading] = useState(!initialList)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (initialList) return

    let cancelled = false

    fetchJson<ReportsListResponse>('/api/life/reports?all=true')
      .then((payload) => {
        if (cancelled) return
        setReports(payload.reports)
        setTimezone(payload.timezone)
        const todayEod = payload.reports.find(
          (report) => report.local_date === payload.localDate && report.type === 'eod',
        )
        setSelectedId(
          todayEod?.id ||
            payload.reports.find((report) => report.type === 'eod')?.id ||
            payload.reports[0]?.id ||
            null,
        )
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reports.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [initialList])

  useEffect(() => {
    if (!selectedId || detailCache[selectedId]) return

    let cancelled = false
    setDetailError(null)
    setDetailLoading(true)

    fetchJson<ReportDetailResponse>(`/api/life/reports?id=${selectedId}`)
      .then((payload) => {
        if (cancelled) return
        setTimezone(payload.timezone)
        setDetailCache((current) => ({
          ...current,
          [payload.report.id]: {
            report: payload.report,
            entries: payload.context.entries,
            events: payload.context.events,
            openTasks: payload.context.openTasks,
            completedTasks: payload.context.completedTasks,
          },
        }))
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : 'Failed to load report detail.')
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [detailCache, selectedId])

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedId) || null,
    [reports, selectedId],
  )
  const selectedDetail = selectedId ? detailCache[selectedId] || null : null

  const reportTitle = useMemo(
    () => (selectedDetail ? getReportTitle(selectedDetail.report) : ''),
    [selectedDetail],
  )
  const pullQuote = useMemo(
    () => (selectedDetail ? getPullQuote(selectedDetail) : null),
    [selectedDetail],
  )
  const bodySections = useMemo(
    () => (selectedDetail ? getBodySections(selectedDetail) : []),
    [selectedDetail],
  )
  const reportMetrics = useMemo(
    () => (selectedDetail ? getReportMetrics(selectedDetail) : []),
    [selectedDetail],
  )
  const linkedEntries = useMemo(
    () => selectedDetail?.entries.slice(0, 3) || [],
    [selectedDetail],
  )

  const isEmpty = !loading && reports.length === 0

  if (viewport === 'phone') {
    return (
      <div>
        <div style={{ padding: '18px 16px 0' }}>
          <div className="life-page-head">
            <div>
              <p className="eyebrow">Library</p>
              <h1>Briefs &amp; reflections</h1>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6, marginBottom: 20 }}>
            {loading
              ? Array.from({ length: 3 }, (_, index) => (
                  <div
                    key={`loading-${index}`}
                    className="life-reports-row life-reports-row-skeleton"
                    style={{ minHeight: 42, height: 42 }}
                  />
                ))
              : reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className={`life-reports-row${selectedId === report.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedId(report.id)}
                    style={{ minHeight: 42, height: 42, padding: '0 14px' }}
                  >
                    <span className="life-reports-row-date">{shortDay(report.local_date, timezone)}</span>
                    <span className="life-reports-row-type">
                      {TYPE_SHORT[report.type] || report.type}
                    </span>
                  </button>
                ))}
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {detailError ? <p className="error-text">{detailError}</p> : null}
          {isEmpty ? <p className="muted-text">No reports yet.</p> : null}
          {!loading && !selectedReport && !isEmpty ? <p className="muted-text">No report selected.</p> : null}
          {detailLoading && !selectedDetail ? <p className="muted-text">Loading report…</p> : null}

          {selectedDetail ? (
            <div style={{ display: 'grid', gap: 18, paddingBottom: 32 }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: 10 }}>
                  {TYPE_LABEL[selectedDetail.report.type] || selectedDetail.report.type} ·{' '}
                  <b>{shortDay(selectedDetail.report.local_date, timezone)}</b>
                </p>
                <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-.02em', margin: 0, lineHeight: 1.15 }}>
                  {reportTitle}
                </h1>
              </div>

              {pullQuote ? (
                <div style={{ padding: '4px 0 16px', borderBottom: '1px solid var(--life-hairline)' }}>
                  <p style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
                    &quot;{pullQuote.lead}
                    {pullQuote.accent ? (
                      <>
                        {' '}
                        <span style={{ color: 'var(--life-accent)' }}>{pullQuote.accent}</span>
                      </>
                    ) : null}
                    &quot;
                  </p>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 16 }}>
                {bodySections.map((section) => (
                  <div
                    key={`${section.key}-${section.label}`}
                    style={
                      section.key === 'tension'
                        ? { padding: '0 0 16px', borderLeft: '2px solid var(--life-accent)', paddingLeft: 14 }
                        : { padding: '0 0 16px', borderBottom: '1px solid var(--life-hairline)' }
                    }
                  >
                    <h3 className="eyebrow" style={{ margin: '0 0 8px' }}>
                      {section.label}
                    </h3>
                    {section.paragraphs.map((paragraph, index) => (
                      <p
                        key={`${section.key}-${index}`}
                        style={{ margin: 0, color: 'var(--life-muted)', lineHeight: 1.65, fontSize: 14 }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="life-page-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Briefs</h1>
        </div>
        <div className="life-page-stat">{reports.length}</div>
      </div>

      <div className="life-reports-shell">
        <aside className="life-report-rail">
          <div className="life-report-rail-head">
            <p className="eyebrow">
              <span className="life-report-desktop-label">Recent reports</span>
              <span className="life-report-phone-label">Reports</span>
            </p>
            <span className="count-pill">{reports.length}</span>
          </div>

          <div className="life-reports-sidebar">
            {loading
              ? Array.from({ length: 3 }, (_, index) => (
                  <div
                    key={`loading-${index}`}
                    className="life-reports-row life-reports-row-skeleton"
                  />
                ))
              : reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className={`life-reports-row${selectedId === report.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedId(report.id)}
                  >
                    <span className="life-reports-row-date">{shortDay(report.local_date, timezone)}</span>
                    <span className="life-reports-row-type">
                      {TYPE_SHORT[report.type] || report.type}
                    </span>
                  </button>
                ))}

            {!loading && reports.length === 0 ? (
              <div className="life-reports-row life-reports-row-empty">
                <span className="life-reports-row-date">No reports yet</span>
                <span className="life-reports-row-type">Empty</span>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="life-reports-reader">
          {error ? <p className="error-text">{error}</p> : null}
          {detailError ? <p className="error-text">{detailError}</p> : null}
          {isEmpty ? <p className="life-reports-placeholder">No reports yet.</p> : null}
          {!loading && !selectedReport && !isEmpty ? (
            <p className="life-reports-placeholder">No report selected.</p>
          ) : null}
          {detailLoading && !selectedDetail ? (
            <p className="life-reports-placeholder">Loading report…</p>
          ) : null}

          {selectedDetail ? (
            <>
              <header className="life-reports-reader-head">
                <p className="eyebrow">
                  {TYPE_LABEL[selectedDetail.report.type] || selectedDetail.report.type} ·{' '}
                  <b>{shortDay(selectedDetail.report.local_date, timezone)}</b>
                </p>
                <h1>{reportTitle}</h1>
              </header>

              <section className="life-report-metrics">
                {reportMetrics.map((metric) => (
                  <div key={metric.label} className="life-report-metric">
                    <div className="life-report-metric-value">{metric.value}</div>
                    <div className="life-report-metric-label">{metric.label}</div>
                  </div>
                ))}
              </section>

              {pullQuote ? (
                <section className="life-report-pullquote">
                  <p className="eyebrow">{pullQuote.label}</p>
                  <p className="life-report-pullquote-text">
                    &quot;{pullQuote.lead}
                    {pullQuote.accent ? (
                      <>
                        {' '}
                        <span className="life-report-pullquote-mark">{pullQuote.accent}</span>
                      </>
                    ) : null}
                    &quot;
                  </p>
                </section>
              ) : null}

              <div className="life-report-sections">
                {bodySections.map((section) => (
                  <section
                    key={`${section.key}-${section.label}`}
                    className={`life-report-section${section.key === 'tension' ? ' life-report-section-accent' : ''}`}
                  >
                    <h3>{section.label}</h3>
                    <div className="life-report-section-body">
                      {section.paragraphs.map((paragraph, index) => (
                        <p key={`${section.key}-${index}`}>{paragraph}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {linkedEntries.length > 0 ? (
                <section className="life-report-linked">
                  <h3>From your captures</h3>
                  <div className="life-report-linked-list">
                    {linkedEntries.map((entry) => (
                      <div key={entry.id} className="life-report-linked-item">
                        <span
                          className="life-report-linked-label"
                          style={{ color: entry.source === 'voice' ? 'var(--life-accent)' : 'var(--life-label)' }}
                        >
                          {entry.source === 'voice' ? 'Voice' : 'Text'}
                        </span>
                        <p className="life-report-linked-text">{entry.content}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
