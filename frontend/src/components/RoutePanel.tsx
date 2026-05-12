import { useState } from 'react'
import type { Waypoint, RouteResult, SearchResult } from '../types'
import { SearchInput } from './SearchInput'
import styles from './RoutePanel.module.css'

interface Props {
  start: Waypoint | null
  end: Waypoint | null
  route: RouteResult | null
  loading: boolean
  error: string | null
  preferCurvy: boolean
  onStartChange: (wp: Waypoint | null) => void
  onEndChange: (wp: Waypoint | null) => void
  onPreferCurvyChange: (v: boolean) => void
  onSwap: () => void
  onClear: () => void
  onRetry: () => void
  onStartNavigation: () => void
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

function toWaypoint(r: SearchResult): Waypoint {
  return { lat: r.lat, lng: r.lng, name: r.name }
}

export function RoutePanel({
  start, end, route, loading, error, preferCurvy,
  onStartChange, onEndChange, onPreferCurvyChange,
  onSwap, onClear, onRetry, onStartNavigation
}: Props) {
  const [geoLoading, setGeoLoading] = useState(false)

  function useMyLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onStartChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: 'My location'
        })
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const bothSet = start !== null && end !== null

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.logoIcon}>⛰</span>
        <span className={styles.logoText}>CurveHunter</span>
      </header>

      <div className={styles.inputsBlock}>
        <div className={styles.inputRow}>
          <span className={styles.dot} style={{ background: '#22c55e' }} />
          <SearchInput
            placeholder="Start point"
            value={start?.name ?? ''}
            isSelected={start !== null}
            onChange={(r) => onStartChange(toWaypoint(r))}
            onClear={() => onStartChange(null)}
          />
          <button
            className={styles.iconBtn}
            title="Use my location"
            onClick={useMyLocation}
            disabled={geoLoading}
            aria-label="Use my location"
          >
            {geoLoading ? '…' : '⌖'}
          </button>
        </div>

        <button
          className={styles.swapBtn}
          onClick={onSwap}
          disabled={!start && !end}
          title="Swap start and destination"
          aria-label="Swap"
        >⇅</button>

        <div className={styles.inputRow}>
          <span className={styles.dot} style={{ background: '#ef4444' }} />
          <SearchInput
            placeholder="Destination"
            value={end?.name ?? ''}
            isSelected={end !== null}
            onChange={(r) => onEndChange(toWaypoint(r))}
            onClear={() => onEndChange(null)}
          />
          <span className={styles.iconBtnPlaceholder} />
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

      <button
        className={styles.primaryBtn}
        onClick={onRetry}
        disabled={!bothSet || loading}
      >
        {loading ? 'Calculating…' : route ? 'Recalculate route' : 'Find route'}
      </button>

      {!bothSet && !error && (
        <p className={styles.hint}>
          Pick a start and destination — or click anywhere on the map to drop a pin.
        </p>
      )}

      {error && (
        <div className={styles.error}>
          <span>{error}</span>
          <button className={styles.retryLink} onClick={onRetry}>Retry</button>
        </div>
      )}

      {route && (
        <>
          <div className={styles.legend}>
            <div className={styles.legendBar} />
            <div className={styles.legendLabels}>
              <span>straight</span>
              <span>twisty</span>
            </div>
          </div>

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

          <button className={styles.navBtn} onClick={onStartNavigation}>
            ▶ Start navigation
          </button>
        </>
      )}

      <div className={styles.spacer} />

      {(start || end || route) && (
        <button className={styles.clearBtn} onClick={onClear}>Clear all</button>
      )}

      <footer className={styles.footer}>
        © <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
      </footer>
    </aside>
  )
}
