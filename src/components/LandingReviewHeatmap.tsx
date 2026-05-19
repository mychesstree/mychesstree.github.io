import { useMemo } from 'react'

interface DayData {
  dayIndex: number
  date: string
  count: number
  isFuture: boolean
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function seededRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function buildFakeData(): { days: DayData[]; cols: (DayData | null)[][] } {
  const rand = seededRng(42)
  const start = new Date(2025, 0, 1)
  const today = new Date(2025, 4, 19) // fixed "today" for demo
  const end = new Date(2025, 11, 31)

  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  const todayIdx = Math.round((today.getTime() - start.getTime()) / 86400000)

  const days: DayData[] = []

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const isFuture = i > todayIdx
    let count = 0

    if (!isFuture) {
      const active = rand() > 0.12
      count = active ? Math.round(8 + Math.sin(i / 7) * 3 + rand() * 10) : 0
    } else {
      count = rand() > 0.4 ? Math.round(5 + rand() * 20) : 0
    }

    days.push({
      dayIndex: i,
      date: d.toISOString().split('T')[0],
      count,
      isFuture,
    })
  }

  // Inject some big review sessions for realism
  ;[20, 45, 67, 89, 110, 130].forEach(i => {
    if (i <= todayIdx) days[i].count = Math.round(30 + rand() * 25)
  })

  // Build week columns (Sun→Sat)
  const startDow = start.getDay()
  const cols: (DayData | null)[][] = []
  let col: (DayData | null)[] = Array(startDow).fill(null)

  for (const day of days) {
    col.push(day)
    if (col.length === 7) {
      cols.push(col)
      col = []
    }
  }
  if (col.length > 0) {
    while (col.length < 7) col.push(null)
    cols.push(col)
  }

  return { days, cols }
}

function cellClass(day: DayData): string {
  if (!day.count) return 'hm-cell hm-empty'
  if (day.isFuture) {
    if (day.count < 8)  return 'hm-cell hm-g1'
    if (day.count < 15) return 'hm-cell hm-g2'
    return 'hm-cell hm-g3'
  }
  if (day.count < 8)  return 'hm-cell hm-p1'
  if (day.count < 18) return 'hm-cell hm-p2'
  if (day.count < 28) return 'hm-cell hm-p3'
  return 'hm-cell hm-p4'
}

export default function LandingReviewHeatmap() {
  const { days, cols } = useMemo(() => buildFakeData(), [])

  // Which column each month label starts at
  const monthLabelCols = useMemo(() => {
    const map: Record<number, number> = {}
    cols.forEach((col, ci) => {
      col.forEach(day => {
        if (!day) return
        const d = new Date(day.date)
        if (d.getDate() === 1) map[d.getMonth()] = ci
      })
    })
    return map
  }, [cols])

  const todayStr = '2025-05-19'
  const totalReviewed = days.filter(d => !d.isFuture).reduce((s, d) => s + d.count, 0)
  const dueToday = days.find(d => d.date === todayStr)?.count ?? 0

  // Streak: count back from today
  let streak = 0
  for (let i = days.findIndex(d => d.date === todayStr); i >= 0; i--) {
    if (days[i].count > 0) streak++
    else break
  }

  return (
    <div className="landing-heatmap-bg">
      <div className="landing-heatmap-inner">
        <div className="hm-month-labels">
          {cols.map((_, ci) => {
            const monthIdx = Object.entries(monthLabelCols).find(([, v]) => v === ci)?.[0]
            return (
              <div key={ci} className="hm-month-cell">
                {monthIdx !== undefined ? MONTHS[+monthIdx] : ''}
              </div>
            )
          })}
        </div>

        <div className="hm-grid">
          {cols.map((col, ci) => (
            <div key={ci} className="hm-col">
              {col.map((day, ri) =>
                day ? (
                  <div
                    key={ri}
                    className={`${cellClass(day)}${day.date === todayStr ? ' hm-today' : ''}`}
                    title={`${day.date}: ${day.count} cards`}
                  />
                ) : (
                  <div key={ri} className="hm-cell hm-spacer" />
                )
              )}
            </div>
          ))}
        </div>

        <div className="hm-footer">
          <div className="hm-legend">
            <div className="hm-cell hm-g2" />
            <span>Scheduled</span>
            <div className="hm-divider" />
            <div className="hm-cell hm-p2" />
            <div className="hm-cell hm-p3" />
            <div className="hm-cell hm-p4" />
            <span>Reviewed</span>
          </div>

          <div className="hm-stats">
            <div className="hm-stat">
              <span className="hm-stat-val">{streak}</span>
              <span className="hm-stat-lbl">day streak</span>
            </div>
            <div className="hm-stat">
              <span className="hm-stat-val">{totalReviewed.toLocaleString()}</span>
              <span className="hm-stat-lbl">cards reviewed</span>
            </div>
            <div className="hm-stat">
              <span className="hm-stat-val">{dueToday}</span>
              <span className="hm-stat-lbl">due today</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}