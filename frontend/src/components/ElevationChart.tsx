import { useMemo } from 'react'
import type { RouteResult } from '../types'
import styles from './ElevationChart.module.css'

interface Props {
  route: RouteResult
  height?: number
}

function haversineM(a: number[], b: number[]): number {
  const R = 6_371_000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Map |grade %| → colour. Mirrors the route-line curviness palette so the
// chart visually rhymes with the map: green = easy, red = steep.
function gradeColor(absGradePct: number): string {
  // Stops: 0 (green) · 4% (lime) · 7% (yellow) · 10% (orange) · 14%+ (red)
  const stops: { t: number; c: [number, number, number] }[] = [
    { t: 0,  c: [22, 163, 74] },   // #16a34a
    { t: 4,  c: [132, 204, 22] },  // #84cc16
    { t: 7,  c: [234, 179, 8] },   // #eab308
    { t: 10, c: [249, 115, 22] },  // #f97316
    { t: 14, c: [220, 38, 38] }    // #dc2626
  ]
  if (absGradePct <= stops[0].t) return `rgb(${stops[0].c.join(',')})`
  if (absGradePct >= stops[stops.length - 1].t) {
    return `rgb(${stops[stops.length - 1].c.join(',')})`
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1]
    if (absGradePct >= a.t && absGradePct <= b.t) {
      const f = (absGradePct - a.t) / (b.t - a.t)
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * f)
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * f)
      const b2 = Math.round(a.c[2] + (b.c[2] - a.c[2]) * f)
      return `rgb(${r},${g},${b2})`
    }
  }
  return `rgb(${stops[0].c.join(',')})`
}

/** SVG line chart of route elevation vs. distance. Returns null when the
 *  geometry has no elevation data. */
export function ElevationChart({ route, height = 70 }: Props) {
  const data = useMemo(() => {
    const coords = route.geometry.coordinates as number[][]
    if (coords.length < 2 || coords[0].length < 3) return null

    // Downsample to ~120 points for a smooth SVG path without thousands of nodes.
    const target = 120
    const stride = Math.max(1, Math.floor(coords.length / target))

    let dist = 0
    const samples: { x: number; y: number }[] = []
    let minE = Infinity, maxE = -Infinity

    for (let i = 0; i < coords.length; i++) {
      if (i > 0) dist += haversineM(coords[i - 1], coords[i])
      if (i % stride !== 0 && i !== coords.length - 1) continue
      const ele = coords[i][2]
      if (typeof ele !== 'number' || !isFinite(ele)) continue
      samples.push({ x: dist, y: ele })
      if (ele < minE) minE = ele
      if (ele > maxE) maxE = ele
    }

    if (samples.length < 2) return null
    const totalDist = samples[samples.length - 1].x
    const span = Math.max(1, maxE - minE)
    return { samples, totalDist, minE, maxE, span }
  }, [route])

  if (!data) return null

  const W = 320, H = height, P = 4
  const innerW = W - P * 2
  const innerH = H - P * 2

  const points = data.samples.map(s => {
    const x = P + (s.x / data.totalDist) * innerW
    const y = P + innerH - ((s.y - data.minE) / data.span) * innerH
    return [x, y] as [number, number]
  })

  // Per-segment colour by absolute gradient (%). Drawn as discrete <line>s so
  // steep ramps are visually distinct from flat stretches.
  const segments = points.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = points[i]
    const s1 = data.samples[i], s2 = data.samples[i + 1]
    const dx = Math.max(1, s2.x - s1.x)  // metres
    const dy = s2.y - s1.y               // metres
    const grade = (dy / dx) * 100        // signed %
    return { x1, y1, x2, y2, color: gradeColor(Math.abs(grade)) }
  })

  // Area fill: vertical gradient so higher-elevation points read warmer. Uses
  // a fixed id with a route-derived suffix to avoid collisions if multiple
  // charts mount simultaneously.
  const gradId = `elev-grad-${Math.round(data.totalDist)}-${Math.round(data.maxE)}`
  const areaPath =
    `M${points[0][0]},${points[0][1]} ` +
    points.slice(1).map(([x, y]) => `L${x},${y}`).join(' ') +
    ` L${P + innerW},${P + innerH} L${P},${P + innerH} Z`

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>↗ {Math.round(route.ascentM)} m</span>
        <span className={styles.label}>↘ {Math.round(route.descentM)} m</span>
        <span className={styles.range}>
          {Math.round(data.minE)} – {Math.round(data.maxE)} m
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <defs>
          {/* y=0 is the top of the chart = max elevation, so the top stop is
              the "high" colour. */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#eab308" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.10" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  )
}
