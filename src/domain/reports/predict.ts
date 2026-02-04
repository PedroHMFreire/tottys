export type SeriesPoint = { day: string; valor: number }

export function movingAverage(points: SeriesPoint[], windowSize = 3) {
  if (!points.length) return []
  const out: SeriesPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - windowSize + 1)
    const slice = points.slice(start, i + 1)
    const avg = slice.reduce((a, p) => a + p.valor, 0) / slice.length
    out.push({ day: points[i].day, valor: avg })
  }
  return out
}

export function simpleForecast(points: SeriesPoint[], daysAhead = 3) {
  if (points.length === 0) return []
  const last = points[points.length - 1]
  const avg = points.reduce((a, p) => a + p.valor, 0) / points.length
  const out: SeriesPoint[] = []
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(last.day + 'T00:00:00')
    d.setDate(d.getDate() + i)
    out.push({ day: d.toISOString().slice(0, 10), valor: avg })
  }
  return out
}
