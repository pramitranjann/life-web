export default function LifeLoading() {
  return (
    <div className="life-today">
      <form className="life-today-search" role="search">
        <span aria-hidden="true">⌕</span>
        <input type="search" placeholder="Search…" aria-label="Search life" readOnly />
      </form>
      <p className="eyebrow life-today-eyebrow">
        Today · <b>Loading</b>
      </p>
      <h1 className="life-greeting">Good morning, Pramit.</h1>

      <div className="life-today-grid">
        <section className="life-capture">

          <div className="life-composer">
            <div className="skeleton-line" style={{ minHeight: 104, margin: 0 }} />
            <div className="life-composer-bar">
              <button type="button" className="life-mic" disabled>
                <span className="life-mic-dot" />
                Hold to capture
              </button>
              <span className="spacer" />
              <button className="life-btn ghost" type="button" disabled>
                Clear
              </button>
              <button className="life-btn primary" type="button" disabled>
                Save entry
              </button>
            </div>
          </div>

          <div className="life-quick-wrap">
            <div className="life-quick">
              <span className="life-quick-label">Quick add</span>
              <button type="button" className="life-quick-chip" disabled>
                ＋ Task
              </button>
              <button type="button" className="life-quick-chip" disabled>
                ＋ Note
              </button>
              <button type="button" className="life-quick-chip" disabled>
                ＋ Event
              </button>
            </div>
          </div>

          <section className="life-capture-stream">
            <div className="life-card">
              <div className="life-card-head">
                <h2>Captured today</h2>
                <span className="life-card-action">All entries →</span>
              </div>
              <div className="life-capture-feed">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="life-capture-item">
                    <span className="life-capture-time">--:--</span>
                    <div className="life-capture-body">
                      <div className="life-capture-meta">
                        <span className="life-entry-kind" style={{ color: 'var(--life-accent)' }}>
                          Voice
                        </span>
                      </div>
                      <div className="skeleton-line" style={{ margin: 0, height: 12, width: item === 3 ? '54%' : '82%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>

        <aside className="life-side">
          <div className="life-card life-morning-brief-card">
            <div className="life-card-head">
              <h2>Morning brief</h2>
              <span className="eyebrow">--:--</span>
            </div>
            <div className="life-brief-body">
              <div className="skeleton-line" style={{ margin: 0, width: '88%' }} />
              <div className="skeleton-line" style={{ margin: '10px 0 0', width: '74%' }} />
              <div className="skeleton-line" style={{ margin: '10px 0 0', width: '62%' }} />
            </div>
          </div>

          <div className="life-card life-today-tasks-card">
            <div className="life-card-head">
              <h2>Today&rsquo;s tasks</h2>
              <span className="count-pill">0</span>
            </div>
            <div className="life-rows">
              {[1, 2, 3].map((item) => (
                <div key={item} className="life-row">
                  <span className="life-check" aria-hidden="true" />
                  <div className="life-row-body">
                    <div className="skeleton-line" style={{ margin: 0, width: item === 3 ? '56%' : '74%' }} />
                  </div>
                  <span className="life-row-aside">--</span>
                </div>
              ))}
            </div>
          </div>

          <div className="life-card life-today-schedule-card">
            <div className="life-card-head">
              <h2>Schedule</h2>
              <span className="count-pill">0</span>
            </div>
            <div className="life-rows">
              {[1, 2].map((item) => (
                <div key={item} className="life-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <span className="time-chip">--:--</span>
                  <div className="skeleton-line" style={{ margin: 0, width: item === 1 ? '68%' : '52%' }} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
