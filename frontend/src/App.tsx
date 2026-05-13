import { useCallback, useEffect, useMemo, useState } from 'react'
import { Map } from './components/Map'
import { RoutePanel } from './components/RoutePanel'
import { NavOverlay } from './components/NavOverlay'
import { NavDebugPanel } from './components/NavDebugPanel'
import { SaveMenu } from './components/SaveMenu'
import { PromptDialog } from './components/PromptDialog'
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
import type { Waypoint, RouteOptions } from './types'
import './App.css'

const DEBUG_NAV_KEY = 'curvehunter.debug.nav'

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

  const [debugNav, setDebugNavState] = useState<boolean>(() => {
    try { return localStorage.getItem(DEBUG_NAV_KEY) === 'true' } catch { return false }
  })
  const setDebugNav = useCallback((on: boolean) => {
    setDebugNavState(on)
    try { localStorage.setItem(DEBUG_NAV_KEY, on ? 'true' : 'false') } catch { /* ignore */ }
  }, [])
  const debug = useNavDebug(route, debugNav)

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

  const nav = useNavigation(route, handleCue, debugNav ? debug.pos : null)

  useWakeLock(nav.active)

  // Inset the map by the visible portion of the bottom sheet on mobile, but
  // stop following the panel past 50% viewport height — once the sheet covers
  // half the screen the map stays put even as the panel keeps growing.
  const bottomInset =
    isMobile && !nav.active
      ? Math.min(panelHeight, typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400)
      : 0

  // If the user disables debug mid-navigation, exit nav so they don't get stuck
  // without a real GPS fix.
  useEffect(() => {
    if (!debugNav && nav.active && debug.pos === null) {
      // no-op; nav already uses real GPS from this point
    }
  }, [debugNav, nav.active, debug.pos])

  // When navigation stops, pause and rewind the debug simulator so it
  // doesn't keep advancing in the background (which was also feeding stale
  // off-route cues to TTS).
  useEffect(() => {
    if (!nav.active && debugNav) {
      debug.setPlaying(false)
      debug.reset()
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
          debugNav={debugNav}
          onToggleDebugNav={setDebugNav}
          customPresets={customPresets.presets}
          activeCustomPresetId={activeCustomPresetId}
          onApplyCustomPreset={(p) => setOptions(p.options)}
          onDeleteCustomPreset={(p) => setPendingDelete({ kind: 'preset', entry: p })}
          onOpenMenu={() => setMenuOpen(true)}
          onSavePlace={handleSavePlace}
          onSaveRoute={handleSaveRoute}
          onSavePreset={handleSavePreset}
          onExportGpx={handleExportGpx}
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
          />
        )}
        {nav.active && debugNav && (
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
            onClose={() => setDebugNav(false)}
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
