import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map } from './components/Map'
import { RoutePanel } from './components/RoutePanel'
import { NavOverlay } from './components/NavOverlay'
import { NavDebugPanel } from './components/NavDebugPanel'
import { SaveMenu } from './components/SaveMenu'
import { PromptDialog } from './components/PromptDialog'
import { Modal } from './components/Modal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { useRoute } from './hooks/useRoute'
import { useNavigation, type NavCue } from './hooks/useNavigation'
import { useNavDebug } from './hooks/useNavDebug'
import { useWakeLock } from './hooks/useWakeLock'
import { useIsMobile } from './hooks/useIsMobile'
import { useSavedRoutes, type SavedRoute } from './hooks/useSavedRoutes'
import { useCustomPresets, type CustomPreset } from './hooks/useCustomPresets'
import { useSavedPlaces, type SavedPlace } from './hooks/useSavedPlaces'
import { useTTS } from './tts/useTTS'
import { useLocale } from './i18n/LocaleProvider'
import { verbKey } from './lib/maneuver'
import { routeToGpx, downloadGpx, defaultGpxFilename, parseGpx } from './lib/gpx'
import { buildShareUrl, decodeRoute } from './lib/share'
import type { Waypoint, RouteOptions } from './types'
import './App.css'

const AUTO_ZOOM_KEY = 'curvehunter.nav.autoZoom'

function sameOptions(a: RouteOptions, b: RouteOptions): boolean {
  return (
    a.curviness === b.curviness &&
    a.avoidMotorways === b.avoidMotorways &&
    a.avoidTrunks === b.avoidTrunks &&
    a.avoidUrban === b.avoidUrban &&
    a.ignoreUrbanCurves === b.ignoreUrbanCurves &&
    a.minCurveSpeed === b.minCurveSpeed &&
    a.avoidUnpaved === b.avoidUnpaved
  )
}

function roundDistance(m: number): { value: number; unit: 'm' | 'km' } {
  if (m >= 1000) {
    return { value: Math.round(m / 100) / 10, unit: 'km' }
  }
  // Snap to nice spoken numbers: 30, 50, 100, 200, 300, 500
  const snaps = [30, 50, 100, 200, 300, 500]
  let best = snaps[0]
  for (const s of snaps) if (Math.abs(s - m) < Math.abs(best - m)) best = s
  return { value: best, unit: 'm' }
}

export default function App() {
  const {
    waypoints, route, loading, error, options, roundTrip,
    setWaypoint, insertWaypointAfter, removeWaypoint,
    setOption, setOptions, setRoundTrip, reshuffleRoundTrip,
    selectAlternative,
    swap, clearAll, loadRoute, prependWaypoint, insertWaypointAt, retry
  } = useRoute()

  const tts = useTTS()
  const { locale, t } = useLocale()
  const speechLang = locale === 'de' ? 'de-DE' : 'en-US'

  // Route-preview simulator. Only active while navigation is running AND the
  // user has explicitly opened the preview panel from the nav overlay.
  const [simOpen, setSimOpen] = useState(false)
  const debug = useNavDebug(route, simOpen)

  const [autoZoom, setAutoZoomState] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_ZOOM_KEY) === 'true' } catch { return false }
  })
  const toggleAutoZoom = useCallback(() => {
    setAutoZoomState(prev => {
      const next = !prev
      try { localStorage.setItem(AUTO_ZOOM_KEY, next ? 'true' : 'false') } catch { /* ignore */ }
      return next
    })
  }, [])

  const isMobile = useIsMobile()
  const [panelHeight, setPanelHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.55) : 480
  )
  useEffect(() => {
    const onResize = () => setPanelHeight(h => Math.min(h, window.innerHeight * 0.95))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const savedRoutes = useSavedRoutes()
  const customPresets = useCustomPresets()
  const savedPlaces = useSavedPlaces()

  // Which waypoint input is currently "armed" — i.e. the one a map click
  // will populate. Starts at 0 (start) on load. Advances to the next empty
  // slot after each fill; goes to null once all slots are filled, so an
  // accidental map click can't move endpoints.
  const [activeIdx, setActiveIdx] = useState<number | null>(0)

  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingSave, setPendingSave] = useState<
    | { kind: 'place'; lat: number; lng: number; defaultName: string }
    | { kind: 'route' }
    | { kind: 'preset' }
    | null
  >(null)
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'preset'; entry: CustomPreset }
    | null
  >(null)

  // Match the current options against saved custom presets to highlight the active one.
  const activeCustomPresetId = useMemo<string | null>(() => {
    const match = customPresets.presets.find(p => sameOptions(p.options, options))
    return match?.id ?? null
  }, [customPresets.presets, options])

  const handleSavePlace = useCallback(() => {
    const wp = waypoints[0]
    if (!wp) return
    setPendingSave({ kind: 'place', lat: wp.lat, lng: wp.lng, defaultName: wp.name })
  }, [waypoints])

  const handleSaveRoute = useCallback(() => {
    if (!route) return
    setPendingSave({ kind: 'route' })
  }, [route])

  const handleSavePreset = useCallback(() => {
    setPendingSave({ kind: 'preset' })
  }, [])

  const handleImportGpx = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const wps = parseGpx(text)
      loadRoute(wps, options)
    } catch (e) {
      // Surface the error via the existing route-error channel by faking
      // an ApiError-like message wouldn't be clean — for now, alert.
      // eslint-disable-next-line no-alert
      alert((e as Error).message || 'GPX import failed')
    }
  }, [loadRoute, options])

  const [shareUrl, setShareUrl] = useState<string | null>(null)

  // Import a shared route if the URL contains ?r=<token>. Runs once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('r')
    if (!token) return
    const shared = decodeRoute(token)
    // Strip the query so a reload doesn't re-apply the import.
    const clean = new URL(window.location.href)
    clean.search = ''
    window.history.replaceState({}, '', clean.toString())
    if (shared) loadRoute(shared.wps, shared.opts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleShareRoute = useCallback(async () => {
    const wps = waypoints.filter((w): w is Waypoint => w !== null)
    if (wps.length < 2) return
    const url = buildShareUrl(wps, options)
    // Native share sheet on supporting platforms (iOS / Android / some desktop).
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Schräglage',
          text: `${wps[0].name} → ${wps[wps.length - 1].name}`,
          url
        })
        return
      } catch {
        // User cancelled or share failed — fall through to the in-app modal.
      }
    }
    setShareUrl(url)
  }, [waypoints, options])

  const handleExportGpx = useCallback(() => {
    if (!route) return
    const wps = waypoints.filter((w): w is Waypoint => w !== null)
    const name = wps.length >= 2
      ? `${wps[0].name} → ${wps[wps.length - 1].name}`
      : 'Schräglage route'
    const gpx = routeToGpx(route, wps, name)
    downloadGpx(defaultGpxFilename(), gpx)
  }, [route, waypoints])

  const handleConfirmSave = useCallback((name: string) => {
    if (!pendingSave) return
    if (pendingSave.kind === 'place') {
      savedPlaces.save(name, pendingSave.lat, pendingSave.lng)
    } else if (pendingSave.kind === 'route') {
      const wps = waypoints.filter((w): w is Waypoint => w !== null)
      if (wps.length >= 2) savedRoutes.save(name, wps, options)
    } else if (pendingSave.kind === 'preset') {
      customPresets.save(name, options)
    }
    setPendingSave(null)
  }, [pendingSave, waypoints, options, savedRoutes, savedPlaces, customPresets])

  const applySavedRoute = useCallback((r: SavedRoute) => {
    loadRoute(r.waypoints, r.options)
  }, [loadRoute])

  const applySavedPlace = useCallback((p: SavedPlace) => {
    const emptyIdx = waypoints.findIndex(w => w === null)
    const target = emptyIdx >= 0 ? emptyIdx : 0
    setWaypoint(target, { lat: p.lat, lng: p.lng, name: p.name })
  }, [waypoints, setWaypoint])

  const composeCue = useCallback((cue: NavCue): string | null => {
    if (cue.kind === 'arrive') return t('nav.cue.arrive')
    if (cue.kind === 'offRoute') return t('nav.cue.offRoute')
    if (cue.sign === undefined) return null

    const verbRaw = t(`nav.verb.${verbKey(cue.sign)}`)
    // Verbs in the catalogue are sentence-capitalised; lower-case them when
    // inlining into "In 200 m turn right onto X" / "In 200 m rechts abbiegen".
    const verb = verbRaw.charAt(0).toLowerCase() + verbRaw.slice(1)
    const onto = cue.streetName
      ? t('nav.cue.ontoStreet', { street: cue.streetName })
      : ''

    if (cue.kind === 'near') {
      return t('nav.cue.nowVerb', { verb, onto })
    }
    const d = roundDistance(cue.distanceM ?? 0)
    const distance = `${d.value} ${d.unit === 'km' ? t('nav.unitKm') : t('nav.unitM')}`
    return t('nav.cue.inDistance', { distance, verb, onto })
  }, [t])

  const handleCue = useCallback((cue: NavCue) => {
    const text = composeCue(cue)
    if (!text) return
    tts.cancel()  // replace any pending speech with the freshest cue
    tts.speak(text, speechLang)
  }, [composeCue, tts, speechLang])

  const nav = useNavigation(route, handleCue, simOpen ? debug.pos : null)

  useWakeLock(nav.active)

  // Inset the map by the visible portion of the bottom sheet on mobile, but
  // stop following the panel past 50% viewport height — once the sheet covers
  // half the screen the map stays put even as the panel keeps growing.
  const bottomInset =
    isMobile && !nav.active
      ? Math.min(panelHeight, typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400)
      : 0

  // When navigation stops, close + reset the preview simulator so it doesn't
  // keep advancing in the background (which was also feeding stale off-route
  // cues to TTS).
  useEffect(() => {
    if (!nav.active && simOpen) {
      debug.setPlaying(false)
      debug.reset()
      setSimOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.active])

  // When navigation starts, force auto-zoom on so the camera adapts to the
  // current road type without the user having to tap it. In-memory only — the
  // user's persisted preference is restored when navigation ends.
  const prevAutoZoomBeforeNav = useRef<boolean | null>(null)
  useEffect(() => {
    if (nav.active) {
      if (prevAutoZoomBeforeNav.current === null) {
        prevAutoZoomBeforeNav.current = autoZoom
        if (!autoZoom) setAutoZoomState(true)
      }
    } else if (prevAutoZoomBeforeNav.current !== null) {
      setAutoZoomState(prevAutoZoomBeforeNav.current)
      prevAutoZoomBeforeNav.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.active])

  // Wrapper around setWaypoint that also advances the "armed" input to the
  // next empty slot after a successful fill, and re-arms the cleared slot on
  // clear. Used everywhere a waypoint changes (search pick, map click, drag).
  const setWaypointAndAdvance = useCallback((idx: number, wp: Waypoint | null) => {
    setWaypoint(idx, wp)
    if (wp === null) {
      setActiveIdx(idx)
      return
    }
    const nextEmpty = waypoints.findIndex((w, i) => i > idx && w === null)
    setActiveIdx(nextEmpty === -1 ? null : nextEmpty)
  }, [setWaypoint, waypoints])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (nav.active) return
    // Only fill a waypoint when one is explicitly armed. Otherwise the map
    // click is ignored so the user can pan freely without disturbing pins.
    if (activeIdx === null || activeIdx < 0 || activeIdx >= waypoints.length) return
    const name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    setWaypointAndAdvance(activeIdx, { lat, lng, name })
  }, [nav.active, activeIdx, waypoints, setWaypointAndAdvance])

  const handleRouteDragInsert = useCallback((insertIdx: number, lat: number, lng: number) => {
    const name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    insertWaypointAt(insertIdx, { lat, lng, name })
  }, [insertWaypointAt])

  const handleWaypointDragEnd = useCallback((idx: number, lat: number, lng: number) => {
    // Replace the dragged waypoint with the new position. Name becomes a
    // coordinate stamp so it's clear it was hand-placed rather than searched.
    const name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    setWaypoint(idx, { lat, lng, name })
  }, [setWaypoint])

  const handleRecalcFromUser = useCallback(() => {
    if (!nav.userPos) return
    // Prepend current location as a new first waypoint — the existing start
    // becomes the first via point, so we route TO it and then continue along
    // the original route.
    prependWaypoint({
      lat: nav.userPos.lat, lng: nav.userPos.lng, name: t('nav.currentLocation')
    })
  }, [nav.userPos, prependWaypoint, t])

  const anyWaypointSet = waypoints.some(w => w !== null)

  return (
    <div className="app">
      {!nav.active && (
        <RoutePanel
          waypoints={waypoints}
          route={route}
          loading={loading}
          error={error}
          options={options}
          onWaypointChange={setWaypointAndAdvance}
          onInsertAfter={insertWaypointAfter}
          onRemove={removeWaypoint}
          onOptionChange={setOption}
          onOptionsApply={setOptions}
          onSwap={swap}
          onClear={() => { clearAll(); setActiveIdx(0) }}
          onRetry={retry}
          onStartNavigation={nav.start}
          anyWaypointSet={anyWaypointSet}
          customPresets={customPresets.presets}
          activeCustomPresetId={activeCustomPresetId}
          onApplyCustomPreset={(p) => setOptions(p.options)}
          onDeleteCustomPreset={(p) => setPendingDelete({ kind: 'preset', entry: p })}
          onOpenMenu={() => setMenuOpen(true)}
          onSavePlace={handleSavePlace}
          onSaveRoute={handleSaveRoute}
          onSavePreset={handleSavePreset}
          onExportGpx={handleExportGpx}
          onShareRoute={handleShareRoute}
          panelHeight={panelHeight}
          onPanelHeightChange={setPanelHeight}
          roundTripEnabled={roundTrip.enabled}
          roundTripDistanceKm={roundTrip.distanceKm}
          onToggleRoundTrip={(on) => setRoundTrip({ enabled: on })}
          onRoundTripDistance={(km) => setRoundTrip({ distanceKm: km })}
          onReshuffleRoundTrip={reshuffleRoundTrip}
          onImportGpx={handleImportGpx}
          activeIdx={activeIdx}
          onSetActiveIdx={setActiveIdx}
        />
      )}
      <div className="map-wrap">
        <Map
          waypoints={waypoints}
          route={route}
          onMapClick={handleMapClick}
          onWaypointDragEnd={nav.active ? undefined : handleWaypointDragEnd}
          onRouteDragInsert={nav.active ? undefined : handleRouteDragInsert}
          onAlternativeSelect={nav.active ? undefined : selectAlternative}
          followUser={nav.active}
          userPos={nav.userPos}
          dimUrbanSegments={options.ignoreUrbanCurves}
          dimBelowSpeedSegments={options.minCurveSpeed > 0}
          bottomInset={bottomInset}
          autoZoom={autoZoom}
          onToggleAutoZoom={toggleAutoZoom}
          currentMaxSpeed={nav.currentMaxSpeed}
        />
        {nav.active && (
          <NavOverlay
            currentInstruction={nav.currentInstruction}
            nextInstruction={nav.nextInstruction}
            distanceToNextTurnM={nav.distanceToNextTurnM}
            distanceRemainingM={nav.distanceRemainingM}
            durationRemainingS={nav.durationRemainingS}
            speedMs={nav.userPos?.speed ?? null}
            offRoute={nav.offRoute}
            arrived={nav.arrived}
            onStop={nav.stop}
            onRecalculate={handleRecalcFromUser}
            voiceEnabled={tts.enabled}
            voiceAvailable={tts.available}
            onToggleVoice={() => tts.setEnabled(!tts.enabled)}
            recalculating={loading}
            maxSpeed={nav.currentMaxSpeed}
            simulateOpen={simOpen}
            onToggleSimulate={() => setSimOpen(o => !o)}
          />
        )}
        {nav.active && simOpen && (
          <NavDebugPanel
            traveledM={debug.traveledM}
            totalM={debug.totalM}
            playing={debug.playing}
            speedKmh={debug.speedKmh}
            onSetTraveled={debug.setTraveledM}
            onSetSpeed={debug.setSpeedKmh}
            onPlayToggle={() => debug.setPlaying(!debug.playing)}
            onStep={() => debug.step(100)}
            onNextTurn={debug.jumpToNextTurn}
            onReset={debug.reset}
            onClose={() => setSimOpen(false)}
          />
        )}
      </div>

      <SaveMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        routes={savedRoutes.routes}
        presets={customPresets.presets}
        places={savedPlaces.places}
        onApplyRoute={applySavedRoute}
        onApplyPreset={(p) => setOptions(p.options)}
        onApplyPlace={applySavedPlace}
        onRenameRoute={savedRoutes.rename}
        onRenamePreset={customPresets.rename}
        onRenamePlace={savedPlaces.rename}
        onDeleteRoute={savedRoutes.remove}
        onDeletePreset={customPresets.remove}
        onDeletePlace={savedPlaces.remove}
      />

      <PromptDialog
        open={pendingSave !== null}
        title={
          pendingSave?.kind === 'place' ? t('save.placeTitle')
          : pendingSave?.kind === 'route' ? t('save.routeTitle')
          : pendingSave?.kind === 'preset' ? t('save.presetTitle')
          : ''
        }
        label={t('save.nameLabel')}
        initialValue={
          pendingSave?.kind === 'place' ? pendingSave.defaultName : ''
        }
        onCancel={() => setPendingSave(null)}
        onConfirm={handleConfirmSave}
      />

      <Modal
        open={shareUrl !== null}
        onClose={() => setShareUrl(null)}
        title={t('share.title')}
        width={420}
      >
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {t('share.body')}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            readOnly
            value={shareUrl ?? ''}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              flex: 1, padding: '8px 10px',
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg-elevated)', color: 'var(--text)',
              fontSize: 12
            }}
          />
          <button
            onClick={async () => {
              if (shareUrl) {
                try { await navigator.clipboard.writeText(shareUrl) } catch { /* ignore */ }
              }
            }}
            style={{
              padding: '8px 14px',
              border: 'none', borderRadius: 6,
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            {t('share.copy')}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete?.kind === 'preset'}
        title={t('save.deleteTitle')}
        message={t('save.deleteConfirm', { name: pendingDelete?.entry.name ?? '' })}
        destructive
        confirmLabel={t('save.delete')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete?.kind === 'preset') {
            customPresets.remove(pendingDelete.entry.id)
          }
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
