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
    return [x, y]
  })

  const linePath = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
  const areaPath = `${linePath} L${P + innerW},${P + innerH} L${P},${P + innerH} Z`

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
        <path d={areaPath} className={styles.area} />
        <path d={linePath} className={styles.line} />
      </svg>
    </div>
  )
}
