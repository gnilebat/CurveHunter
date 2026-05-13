import { Fragment, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Waypoint, RouteResult, RouteOptions, SearchResult } from '../types'
import type { RouteError } from '../hooks/useRoute'
import type { CustomPreset } from '../hooks/useCustomPresets'
import {
  MIN_CURVE_SPEED_STEPS,
  ROUTE_PRESETS, PRESET_ORDER, matchPreset, type PresetId
} from '../types'
import { SearchInput } from './SearchInput'
import { Slider } from './Slider'
import { StepSlider } from './StepSlider'
import { InfoIcon } from './InfoIcon'
import { ElevationChart } from './ElevationChart'
import { useLocale } from '../i18n/LocaleProvider'
import { LOCALES } from '../i18n/strings'
import { useTheme, THEMES, type Theme } from '../theme/ThemeProvider'
import styles from './RoutePanel.module.css'

interface Props {
  waypoints: (Waypoint | null)[]
  route: RouteResult | null
  loading: boolean
  error: RouteError | null
  options: RouteOptions
  onWaypointChange: (idx: number, wp: Waypoint | null) => void
  onInsertAfter: (idx: number) => void
  onRemove: (idx: number) => void
  onOptionChange: <K extends keyof RouteOptions>(key: K, value: RouteOptions[K]) => void
  onOptionsApply: (opts: RouteOptions) => void
  onSwap: () => void
  onClear: () => void
  onRetry: () => void
  onStartNavigation: () => void
  anyWaypointSet: boolean
  debugNav: boolean
  onToggleDebugNav: (on: boolean) => void

  customPresets: CustomPreset[]
  activeCustomPresetId: string | null
  onApplyCustomPreset: (p: CustomPreset) => void
  onDeleteCustomPreset: (p: CustomPreset) => void

  onOpenMenu: () => void
  onSavePlace: () => void
  onSaveRoute: () => void
  onSavePreset: () => void
  onExportGpx: () => void
  onShareRoute: () => void

  panelHeight: number
  onPanelHeightChange: (h: number) => void

  roundTripEnabled: boolean
  roundTripDistanceKm: number
  onToggleRoundTrip: (on: boolean) => void
  onRoundTripDistance: (km: number) => void
  onReshuffleRoundTrip: () => void

  onImportGpx: (file: File) => void

  activeIdx: number | null
  onSetActiveIdx: (idx: number | null) => void
}

const PRESET_LABEL_KEY: Record<PresetId, string> = {
  fastest: 'options.presetFastest',
  curvy: 'options.presetCurvy',
  curvyPlus: 'options.presetCurvyPlus',
  curvyMax: 'options.presetCurvyMax'
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

// Rough estimate at curvy-touring pace (~50 km/h). Just an info string.
function formatRoundTripDuration(km: number, t: (k: string) => string): string {
  const minutes = Math.round((km / 50) * 60)
  if (minutes < 60) return `${minutes} ${t('nav.minShort')}`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} ${t('nav.hourShort')}` : `${h} ${t('nav.hourShort')} ${m} ${t('nav.minShort')}`
}

export function RoutePanel({
  waypoints, route, loading, error, options,
  onWaypointChange, onInsertAfter, onRemove,
  onOptionChange,
  onOptionsApply,
  onSwap, onClear, onRetry, onStartNavigation,
  anyWaypointSet,
  debugNav, onToggleDebugNav,
  customPresets, activeCustomPresetId,
  onApplyCustomPreset, onDeleteCustomPreset,
  onOpenMenu, onSavePlace, onSaveRoute, onSavePreset, onExportGpx, onShareRoute,
  panelHeight, onPanelHeightChange,
  roundTripEnabled, roundTripDistanceKm,
  onToggleRoundTrip, onRoundTripDistance, onReshuffleRoundTrip,
  onImportGpx,
  activeIdx, onSetActiveIdx
}: Props) {
  const activePreset = matchPreset(options)
  const { t, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const [geoLoading, setGeoLoading] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(true)

  const isMobile = useIsMobile()
  // Default to options collapsed on mobile so the input section is visible.
  useEffect(() => { if (isMobile) setOptionsOpen(false) }, [isMobile])

  const dragState = useRef({ startY: 0, startH: 0, dragging: false })
  const gpxInputRef = useRef<HTMLInputElement>(null)
  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isMobile) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startY: e.clientY, startH: panelHeight, dragging: true }
  }
  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current.dragging) return
    const dy = e.clientY - dragState.current.startY
    // Panel is anchored to the bottom; dragging up should grow it.
    const next = dragState.current.startH - dy
    const min = 64
    const max = Math.round(window.innerHeight * 0.95)
    onPanelHeightChange(Math.min(max, Math.max(min, next)))
  }
  function onHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current.dragging) return
    dragState.current.dragging = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onWaypointChange(0, {
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
    const n = Math.round(score)
    if (score < 100)  return `${n} (${t('panel.curvyStraight')})`
    if (score < 350)  return `${n} (${t('panel.curvyWinding')})`
    if (score < 700)  return `${n} (${t('panel.curvyCurvy')})`
    if (score < 1200) return `${n} (${t('panel.curvyTwisty')})`
    return `${n} (${t('panel.curvyExtreme')})`
  }

  const allSet = roundTripEnabled
    ? waypoints[0] !== null
    : waypoints.length >= 2 && waypoints.every((w): w is Waypoint => w !== null)
  const localeTag = locale === 'de' ? 'de-DE' : 'en-US'

  function dotColor(idx: number) {
    if (idx === 0) return '#22c55e'
    if (idx === waypoints.length - 1) return '#ef4444'
    return '#3b82f6'
  }

  function placeholderFor(idx: number) {
    if (idx === 0) return t('panel.placeholderStart')
    if (idx === waypoints.length - 1) return t('panel.placeholderEnd')
    return t('panel.placeholderVia')
  }

  const isCustomized = activePreset === null

  return (
    <aside
      className={`${styles.panel} ${isMobile ? styles.bottomSheet : ''}`}
      style={isMobile ? ({ ['--panel-h' as string]: `${panelHeight}px` } as React.CSSProperties) : undefined}
    >
      {isMobile && (
        <div
          className={styles.dragHandle}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panel"
        >
          <span className={styles.dragGrip} />
        </div>
      )}
      <header className={styles.header}>
        <span className={styles.logoIcon} aria-hidden>
          <svg width="28" height="28" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#f59e0b" />
            <path d="M14 50 C 24 42 24 28 32 26 S 40 18 48 14"
                  fill="none" stroke="#ffffff" strokeWidth="7"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={styles.logoText}>{t('panel.brand')}</span>
        <button
          className={styles.menuBtn}
          onClick={onOpenMenu}
          title={t('save.menuTitle')}
          aria-label={t('save.menuTitle')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      <div className={styles.modeRow} role="tablist">
        <button
          className={`${styles.modeBtn} ${!roundTripEnabled ? styles.modeBtnActive : ''}`}
          onClick={() => onToggleRoundTrip(false)}
          aria-pressed={!roundTripEnabled}
          role="tab"
        >{t('panel.modeDirect')}</button>
        <button
          className={`${styles.modeBtn} ${roundTripEnabled ? styles.modeBtnActive : ''}`}
          onClick={() => onToggleRoundTrip(true)}
          aria-pressed={roundTripEnabled}
          role="tab"
        >{t('panel.modeRoundTrip')}</button>
        <input
          ref={gpxInputRef}
          type="file"
          accept=".gpx,application/gpx+xml,text/xml"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImportGpx(f)
            e.target.value = ''  // allow re-picking the same file
          }}
          style={{ display: 'none' }}
        />
        <button
          className={styles.modeImportBtn}
          onClick={() => gpxInputRef.current?.click()}
          title={t('panel.importGpx')}
          aria-label={t('panel.importGpx')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
      </div>

      <div className={styles.inputsBlock}>
        {waypoints.map((wp, idx) => {
          if (roundTripEnabled && idx > 0) return null
          const isFirst = idx === 0
          const isLast = roundTripEnabled ? true : idx === waypoints.length - 1
          const isIntermediate = !isFirst && !isLast
          return (
            <Fragment key={idx}>
              <div className={styles.inputRow}>
                <span className={styles.dot} style={{ background: dotColor(idx) }} />
                <SearchInput
                  placeholder={placeholderFor(idx)}
                  value={wp?.name ?? ''}
                  isSelected={wp !== null}
                  onChange={(r) => onWaypointChange(idx, toWaypoint(r))}
                  onClear={() => onWaypointChange(idx, null)}
                  shouldFocus={activeIdx === idx}
                  onInputFocus={() => onSetActiveIdx(idx)}
                />
                {isFirst ? (
                  <>
                    <button
                      className={styles.iconBtn}
                      title={t('panel.useMyLocation')}
                      onClick={useMyLocation}
                      disabled={geoLoading}
                      aria-label={t('panel.useMyLocation')}
                    >
                      {geoLoading ? '…' : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                          <circle cx="12" cy="12" r="7" />
                          <line x1="12" y1="2" x2="12" y2="5" />
                          <line x1="12" y1="19" x2="12" y2="22" />
                          <line x1="2" y1="12" x2="5" y2="12" />
                          <line x1="19" y1="12" x2="22" y2="12" />
                        </svg>
                      )}
                    </button>
                    <button
                      className={styles.iconBtn}
                      title={t('panel.savePlace')}
                      onClick={onSavePlace}
                      disabled={!wp}
                      aria-label={t('panel.savePlace')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                  </>
                ) : isIntermediate ? (
                  <>
                    <button
                      className={styles.iconBtn}
                      title={t('panel.removeVia')}
                      onClick={() => onRemove(idx)}
                      aria-label={t('panel.removeVia')}
                    >×</button>
                    <span className={styles.iconBtnPlaceholder} />
                  </>
                ) : (
                  <>
                    <span className={styles.iconBtnPlaceholder} />
                    <span className={styles.iconBtnPlaceholder} />
                  </>
                )}
              </div>
              {!isLast && (
                <button
                  className={styles.swapBtn}
                  onClick={() => onInsertAfter(idx)}
                  title={t('panel.addBelow')}
                  aria-label={t('panel.addBelow')}
                >+</button>
              )}
            </Fragment>
          )
        })}
        {!roundTripEnabled && (
          <button
            className={styles.swapBtn}
            onClick={onSwap}
            disabled={!anyWaypointSet}
            title={t('panel.swap')}
            aria-label={t('panel.swap')}
          >⇅</button>
        )}
      </div>

      {roundTripEnabled && (
        <div className={styles.roundTripBlock}>
          <div className={styles.roundTripHead}>
            <span className={styles.roundTripLabel}>
              {t('panel.roundTripDistance')} —
              <b> {Math.round(roundTripDistanceKm)} km</b>
              <span className={styles.roundTripEta}> · ≈ {formatRoundTripDuration(roundTripDistanceKm, t)}</span>
            </span>
            <button
              className={styles.roundTripShuffle}
              onClick={onReshuffleRoundTrip}
              title={t('panel.shuffleRoundTrip')}
              aria-label={t('panel.shuffleRoundTrip')}
            >⟲</button>
          </div>
          <input
            type="range"
            min={10}
            max={300}
            step={5}
            value={roundTripDistanceKm}
            onChange={(e) => onRoundTripDistance(Number(e.target.value))}
            className={styles.roundTripRange}
          />
        </div>
      )}

      <div className={styles.presetRow} role="group">
        {PRESET_ORDER.map((id) => (
          <button
            key={id}
            className={`${styles.presetBtn} ${activePreset === id && !activeCustomPresetId ? styles.presetActive : ''}`}
            onClick={() => onOptionsApply(ROUTE_PRESETS[id])}
            aria-pressed={activePreset === id && !activeCustomPresetId}
          >
            {t(PRESET_LABEL_KEY[id])}
          </button>
        ))}
        {customPresets.map((p) => {
          const isActive = activeCustomPresetId === p.id
          return (
            <div key={p.id} className={styles.customPresetWrap}>
              <button
                className={`${styles.presetBtn} ${styles.customPresetBtn} ${isActive ? styles.presetActive : ''}`}
                onClick={() => onApplyCustomPreset(p)}
                aria-pressed={isActive}
                title={p.name}
              >
                <span className={styles.customStar} aria-hidden>★</span>
                <span className={styles.customPresetLabel}>{p.name}</span>
              </button>
              <button
                className={styles.customDeleteBtn}
                onClick={(e) => { e.stopPropagation(); onDeleteCustomPreset(p) }}
                aria-label={t('save.delete')}
                title={t('save.delete')}
              >×</button>
            </div>
          )
        })}
        <button
          className={styles.savePresetBtn}
          onClick={onSavePreset}
          title={t('panel.savePreset')}
          aria-label={t('panel.savePreset')}
        >+ ★</button>
      </div>

      <section className={styles.options}>
        <button
          className={styles.optionsHead}
          onClick={() => setOptionsOpen(!optionsOpen)}
          aria-expanded={optionsOpen}
        >
          <span className={styles.optionsGear} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span className={styles.optionsTitle}>{t('options.title')}</span>
          {isCustomized && <span className={styles.optionsBadge}>●</span>}
          <span className={`${styles.optionsChevron} ${optionsOpen ? styles.optionsChevronOpen : ''}`} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>

        {optionsOpen && (
          <div className={styles.optionsBody}>
            <Slider
              label={t('options.curviness')}
              hint={t('options.curvinessHint')}
              value={options.curviness}
              max={2}
              markerAt={1}
              warningOverMarker={t('options.curvinessExtremeWarn')}
              onChange={(v) => onOptionChange('curviness', v)}
              intense
            />
            <Slider
              label={t('options.avoidMotorways')}
              value={options.avoidMotorways}
              onChange={(v) => onOptionChange('avoidMotorways', v)}
            />
            <Slider
              label={t('options.avoidTrunks')}
              value={options.avoidTrunks}
              onChange={(v) => onOptionChange('avoidTrunks', v)}
            />
            <Slider
              label={t('options.avoidUrban')}
              hint={t('options.avoidUrbanHint')}
              value={options.avoidUrban}
              onChange={(v) => onOptionChange('avoidUrban', v)}
            />
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={options.ignoreUrbanCurves}
                onChange={(e) => onOptionChange('ignoreUrbanCurves', e.target.checked)}
              />
              <span className={styles.toggleLabel}>{t('options.ignoreUrbanCurves')}</span>
              <InfoIcon text={t('options.ignoreUrbanCurvesHint')} />
            </label>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={options.avoidUnpaved}
                onChange={(e) => onOptionChange('avoidUnpaved', e.target.checked)}
              />
              <span className={styles.toggleLabel}>{t('options.avoidUnpaved')}</span>
              <InfoIcon text={t('options.avoidUnpavedHint')} />
            </label>

            <StepSlider
              label={t('options.minCurveSpeed')}
              tooltip={t('options.minCurveSpeedHint')}
              value={options.minCurveSpeed}
              steps={[...MIN_CURVE_SPEED_STEPS]}
              formatValue={(v) => v === 0 ? t('options.minCurveSpeedOff') : `≥ ${v} km/h`}
              onChange={(v) => onOptionChange('minCurveSpeed', v)}
            />

          </div>
        )}
      </section>

      <button
        className={styles.primaryBtn}
        onClick={onRetry}
        disabled={!allSet || loading}
      >
        {loading
          ? t('panel.calculating')
          : route
            ? t('panel.recalculate')
            : t('panel.findRoute')}
      </button>

      {!allSet && !error && (
        <p className={styles.hint}>{t('panel.hint')}</p>
      )}

      {error && (
        <div className={styles.error}>
          <span>{t(error.key, error.vars)}</span>
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
            <div className={styles.legendTitle}>{t('panel.legendHighwayTitle')}</div>
            <div className={styles.legendBarHighway} />
            <div className={styles.legendLabels}>
              <span>{t('panel.legendHighwayLow')}</span>
              <span>{t('panel.legendHighwayHigh')}</span>
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

          <ElevationChart route={route} />

          {(route.motorwayM > 0 || route.trunkM > 0) && (
            <div className={styles.breakdown}>
              <span className={styles.breakdownChip}>
                <span className={styles.breakdownDot} style={{ background: '#1e3a8a' }} />
                {t('panel.breakdownAutobahn')}
                <b>{formatDistance(route.motorwayM, localeTag)}</b>
              </span>
              <span className={styles.breakdownChip}>
                <span className={styles.breakdownDot} style={{ background: '#3b82f6' }} />
                {t('panel.breakdownKraftfahrstrasse')}
                <b>{formatDistance(route.trunkM, localeTag)}</b>
              </span>
            </div>
          )}

          <div className={styles.routeActionsRow}>
            <button className={styles.navBtn} onClick={onStartNavigation}>
              {t('panel.startNavigation')}
            </button>
            <button
              className={styles.saveRouteBtn}
              onClick={onSaveRoute}
              title={t('panel.saveRoute')}
              aria-label={t('panel.saveRoute')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              className={styles.saveRouteBtn}
              onClick={onExportGpx}
              title={t('panel.exportGpx')}
              aria-label={t('panel.exportGpx')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              className={styles.saveRouteBtn}
              onClick={onShareRoute}
              title={t('panel.shareRoute')}
              aria-label={t('panel.shareRoute')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          </div>
        </>
      )}

      <div className={styles.spacer} />

      {(anyWaypointSet || route) && (
        <button className={styles.clearBtn} onClick={onClear}>{t('panel.clearAll')}</button>
      )}

      <label className={styles.toggle} style={{ fontSize: 12, opacity: 0.85 }}>
        <input
          type="checkbox"
          checked={debugNav}
          onChange={(e) => onToggleDebugNav(e.target.checked)}
        />
        <span className={styles.toggleLabel}>{t('nav.debug.enable')}</span>
      </label>

      <div className={styles.langRow}>
        <div className={styles.settingsGroup}>
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
        <div className={styles.settingsGroup}>
          <span className={styles.langLabel}>{t('panel.theme')}</span>
          <div className={styles.langToggle} role="group">
            {THEMES.map((th: Theme) => (
              <button
                key={th}
                className={`${styles.langBtn} ${theme === th ? styles.langBtnActive : ''}`}
                onClick={() => setTheme(th)}
                aria-pressed={theme === th}
                aria-label={t(th === 'light' ? 'panel.themeLight' : 'panel.themeDark')}
              >
                {th === 'light' ? '☀' : '☾'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        © <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap</a>
        {' '}{locale === 'de' ? 'Mitwirkende' : 'contributors'}
      </footer>
    </aside>
  )
}
