const LIFE_METADATA_COMMENT_RE = /<!--\s*life:([a-z0-9-]+)=([a-z0-9-]+)\s*-->\s*/gi

export interface LifePageBodyParts {
  body: string
  metadataComments: string[]
  templateArchetype: string | null
}

export function splitLifePageBody(value: string): LifePageBodyParts {
  const metadataComments: string[] = []
  let templateArchetype: string | null = null

  const body = value.replace(LIFE_METADATA_COMMENT_RE, (comment, key: string, rawValue: string) => {
    metadataComments.push(comment.trim())
    if (key === 'template-archetype') {
      templateArchetype = rawValue.trim()
    }
    return ''
  }).trimStart()

  return {
    body,
    metadataComments,
    templateArchetype,
  }
}

export function stripLifePageMetadata(value: string) {
  return splitLifePageBody(value).body
}

/**
 * Toggle the nth task-list item in a Tiptap HTML body.
 *
 * Page bodies are HTML since the rich editor landed, so the markdown scan
 * above no longer matches anything a page actually contains. Tiptap stores the
 * state on `<li data-checked>` and mirrors it onto the nested `<input>`, so
 * both have to move together or the reader and editor disagree.
 *
 * Browser-only: DOMParser does not exist on the server. The reader calls this
 * from a click handler, so that holds.
 */
export function toggleNthHtmlCheckbox(html: string, index: number) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const items = doc.querySelectorAll('li[data-checked]')
  const item = items[index]
  if (!item) return html

  const checked = item.getAttribute('data-checked') === 'true'
  item.setAttribute('data-checked', checked ? 'false' : 'true')

  const box = item.querySelector('input[type="checkbox"]')
  if (box) {
    if (checked) box.removeAttribute('checked')
    else box.setAttribute('checked', 'checked')
  }

  return doc.body.innerHTML
}

export function mergeLifePageMetadata(storedBody: string, visibleBody: string) {
  const { metadataComments } = splitLifePageBody(storedBody)
  const body = visibleBody.trimStart()

  if (metadataComments.length === 0) return body
  return `${metadataComments.join('\n')}\n\n${body}`.trimEnd()
}
