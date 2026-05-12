import { useState } from 'react'
import type { Waypoint, RouteResult, SearchResult } from '../types'
import { SearchInput } from './SearchInput'
import { useLocale } from '../i18n/LocaleProvider'
import { LOCALES } from '../i18n/strings'
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

function formatDistance(m: number, locale: string) {
  if (m >= 1000) return `${(m / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`
  return `${Math.round(m)} m`
}

function formatDuration(s: number, hShort: string, minShort: string) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} ${hShort} ${m} ${minShort}` : `${m} ${minShort}`
}

function toWaypoint(r: SearchResult): Waypoint {
  return { lat: r.lat, lng: r.lng, name: r.name }
}

export function RoutePanel({
  start, end, route, loading, error, preferCurvy,
  onStartChange, onEndChange, onPreferCurvyChange,
  onSwap, onClear, onRetry, onStartNavigation
}: Props) {
  const { t, locale, setLocale } = useLocale()
  const [geoLoading, setGeoLoading] = useState(false)

  function useMyLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onStartChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: t('panel.useMyLocation')
        })
        setGeoLoading(false)
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function curvyLabel(score: number | null) {
    if (score === null) return '—'
    if (score < 100) return `${Math.round(score)} (${t('panel.curvyStraight')})`
    if (score < 400) return `${Math.round(score)} (${t('panel.curvyWinding')})`
    if (score < 800) return `${Math.round(score)} (${t('panel.curvyCurvy')})`
    return `${Math.round(score)} (${t('panel.curvyTwisty')})`
  }

  const bothSet = start !== null && end !== null
  const localeTag = locale === 'de' ? 'de-DE' : 'en-US'

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.logoIcon}>⛰</span>
        <span className={styles.logoText}>{t('panel.brand')}</span>
      </header>

      <div className={styles.inputsBlock}>
        <div className={styles.inputRow}>
          <span className={styles.dot} style={{ background: '#22c55e' }} />
          <SearchInput
            placeholder={t('panel.placeholderStart')}
            value={start?.name ?? ''}
            isSelected={start !== null}
            onChange={(r) => onStartChange(toWaypoint(r))}
            onClear={() => onStartChange(null)}
          />
          <button
            className={styles.iconBtn}
            title={t('panel.useMyLocation')}
            onClick={useMyLocation}
            disabled={geoLoading}
            aria-label={t('panel.useMyLocation')}
          >
            {geoLoading ? '…' : '⌖'}
          </button>
        </div>

        <button
          className={styles.swapBtn}
          onClick={onSwap}
          disabled={!start && !end}
          title={t('panel.swap')}
          aria-label={t('panel.swap')}
        >⇅</button>

        <div className={styles.inputRow}>
          <span className={styles.dot} style={{ background: '#ef4444' }} />
          <SearchInput
            placeholder={t('panel.placeholderEnd')}
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
        <span>{t('panel.preferCurvy')}</span>
      </label>

      <button
        className={styles.primaryBtn}
        onClick={onRetry}
        disabled={!bothSet || loading}
      >
        {loading
          ? t('panel.calculating')
          : route
            ? t('panel.recalculate')
            : t('panel.findRoute')}
      </button>

      {!bothSet && !error && (
        <p className={styles.hint}>{t('panel.hint')}</p>
      )}

      {error && (
        <div className={styles.error}>
          <span>{error}</span>
          <button className={styles.retryLink} onClick={onRetry}>{t('panel.retry')}</button>
        </div>
      )}

      {route && (
        <>
          <div className={styles.legend}>
            <div className={styles.legendBar} />
            <div className={styles.legendLabels}>
              <span>{t('panel.legendStraight')}</span>
              <span>{t('panel.legendTwisty')}</span>
            </div>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('panel.distance')}</span>
              <span className={styles.statValue}>{formatDistance(route.distanceM, localeTag)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('panel.duration')}</span>
              <span className={styles.statValue}>
                {formatDuration(route.durationS, t('nav.hourShort'), t('nav.minShort'))}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('panel.ascent')}</span>
              <span className={styles.statValue}>{Math.round(route.ascentM)} m</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('panel.curviness')}</span>
              <span className={styles.statValue}>{curvyLabel(route.curvatureScore)}</span>
            </div>
          </div>

          <button className={styles.navBtn} onClick={onStartNavigation}>
            {t('panel.startNavigation')}
          </button>
        </>
      )}

      <div className={styles.spacer} />

      {(start || end || route) && (
        <button className={styles.clearBtn} onClick={onClear}>{t('panel.clearAll')}</button>
      )}

      <div className={styles.langRow}>
        <span className={styles.langLabel}>{t('panel.language')}</span>
        <div className={styles.langToggle} role="group">
          {LOCALES.map((l) => (
            <button
              key={l}
              className={`${styles.langBtn} ${locale === l ? styles.langBtnActive : ''}`}
              onClick={() => setLocale(l)}
              aria-pressed={locale === l}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        © <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap</a>
        {' '}{locale === 'de' ? 'Mitwirkende' : 'contributors'}
      </footer>
    </aside>
  )
}
