'use client'

// Generalises the one skeleton that already exists (.life-reports-row-skeleton)
// so tasks, projects, people and history can stop rendering nothing while they
// load. Shapes mirror the real row so nothing jumps on swap-in.

export function LifeSkeleton({
  width,
  height = 12,
}: {
  width?: number | string
  height?: number
}) {
  return (
    <span
      className="life-skeleton"
      style={{ width: width ?? '100%', height }}
      aria-hidden="true"
    />
  )
}

/** A list of placeholder rows matching the .life-row rhythm. */
export function LifeSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="life-skeleton-rows" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="life-skeleton-row">
          <LifeSkeleton width={14} height={14} />
          <div className="life-skeleton-row-text">
            <LifeSkeleton width={`${64 - (i % 3) * 12}%`} height={13} />
            <LifeSkeleton width={`${34 - (i % 2) * 8}%`} height={10} />
          </div>
          <LifeSkeleton width={52} height={10} />
        </div>
      ))}
    </div>
  )
}
