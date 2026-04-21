import type { Waypoint, RouteResult } from '../types'
import { SearchInput } from './SearchInput'
import type { SearchResult } from '../types'
import styles from './RoutePanel.module.css'

interface Props {
  start: Waypoint | null
  end: Waypoint | null
  route: RouteResult | null
  loading: boolean
  error: string | null
  preferCurvy: boolean
  onStartChange: (wp: Waypoint) => void
  onEndChange: (wp: Waypoint) => void
  onPreferCurvyChange: (v: boolean) => void
  onClear: () => void
}

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function formatDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m} min`
}

function curvyLabel(score: number | null) {
  if (score === null) return '—'
  if (score < 100) return `${Math.round(score)} (straight)`
  if (score < 400) return `${Math.round(score)} (winding)`
  if (score < 800) return `${Math.round(score)} (curvy)`
  return `${Math.round(score)} (twisty!)`
}

export function RoutePanel({
  start, end, route, loading, error, preferCurvy,
  onStartChange, onEndChange, onPreferCurvyChange, onClear
}: Props) {
  function toWaypoint(r: SearchResult): Waypoint {
    return { lat: r.lat, lng: r.lng, name: r.name }
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>⛰</span>
        <span className={styles.logoText}>CurveHunter</span>
      </div>

      <div className={styles.inputs}>
        <div className={styles.inputRow}>
          <span className={styles.dot} style={{ background: '#22c55e' }} />
          <SearchInput
            placeholder="Start point"
            value={start?.name ?? ''}
            onChange={(r) => onStartChange(toWaypoint(r))}
          />
        </div>
        <div className={styles.inputRow}>
          <span className={styles.dot} style={{ background: '#ef4444' }} />
          <SearchInput
            placeholder="Destination"
            value={end?.name ?? ''}
            onChange={(r) => onEndChange(toWaypoint(r))}
          />
        </div>
      </div>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={preferCurvy}
          onChange={(e) => onPreferCurvyChange(e.target.checked)}
        />
        <span>Prefer curvy roads</span>
      </label>

      {loading && <p className={styles.status}>Calculating route…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {route && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Distance</span>
            <span className={styles.statValue}>{formatDistance(route.distanceM)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Duration</span>
            <span className={styles.statValue}>{formatDuration(route.durationS)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Ascent</span>
            <span className={styles.statValue}>{Math.round(route.ascentM)} m</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Curviness</span>
            <span className={styles.statValue}>{curvyLabel(route.curvatureScore)}</span>
          </div>
        </div>
      )}

      {(start || end || route) && (
        <button className={styles.clearBtn} onClick={onClear}>Clear route</button>
      )}

      <footer className={styles.footer}>
        © <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
      </footer>
    </aside>
  )
}
