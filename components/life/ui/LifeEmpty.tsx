'use client'

// One voice for "nothing here" across Life. Replaces the bare strings:
// "Nothing here.", "No projects yet…", "Nothing waiting to print.",
// "Nothing scheduled.", "No one matches…"

export function LifeEmpty({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="life-empty-state">
      {/* ponytail: a ruled mark, not an icon set — Life has no icon library
          and emoji are off the table. */}
      <span className="life-empty-mark" aria-hidden="true" />
      <p className="life-empty-title">{title}</p>
      {description ? <p className="life-empty-desc">{description}</p> : null}
      {action ? (
        <button type="button" className="life-btn ghost" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
