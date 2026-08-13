export default function TasksLoading() {
  return (
    <div className="life-tasks-shell">
      <div className="life-page-head">
        <div className="skeleton-line skeleton-title" style={{ width: '20%' }} />
      </div>
      <div className="life-card life-card-skeleton">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton-line" style={{ margin: '12px 16px' }} />
        ))}
      </div>
    </div>
  )
}
