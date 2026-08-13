export interface ReportSection {
  label: string
  body: string
}

const HEADING_RE = /^##\s+(.+?)\s*$/

export function parseReportSections(markdown: string): ReportSection[] {
  if (!markdown.trim()) {
    return []
  }

  const lines = markdown.split('\n')
  const sections: ReportSection[] = []
  let current: ReportSection | null = null

  for (const line of lines) {
    const match = line.match(HEADING_RE)
    if (match) {
      if (current) {
        sections.push({ label: current.label, body: current.body.trim() })
      }
      current = { label: match[1].trim(), body: '' }
      continue
    }

    if (current) {
      current.body += `${line}\n`
    }
  }

  if (current) {
    sections.push({ label: current.label, body: current.body.trim() })
  }

  return sections
}

export function sectionKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
