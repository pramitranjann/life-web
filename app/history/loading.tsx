export default function HistoryLoading() {
  return (
    <div className="life-history-shell">
      <div className="life-card life-card-skeleton" style={{ minHeight: 200 }}>
        <div className="life-card-head">
          <div className="skeleton-line skeleton-title" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton-line" style={{ margin: '10px 16px' }} />
        ))}
      </div>
    </div>
  )
}
