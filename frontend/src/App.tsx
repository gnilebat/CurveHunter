import { useCallback, useEffect, useState } from 'react'
import { Map } from './components/Map'
import { RoutePanel } from './components/RoutePanel'
import { NavOverlay } from './components/NavOverlay'
import { NavDebugPanel } from './components/NavDebugPanel'
import { useRoute } from './hooks/useRoute'
import { useNavigation, type NavCue } from './hooks/useNavigation'
import { useNavDebug } from './hooks/useNavDebug'
import { useTTS } from './tts/useTTS'
import { useLocale } from './i18n/LocaleProvider'
import { verbKey } from './lib/maneuver'
import type { Waypoint } from './types'
import './App.css'

const DEBUG_NAV_KEY = 'curvehunter.debug.nav'

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
    waypoints, route, loading, error, options,
    setWaypoint, insertWaypointAfter, removeWaypoint,
    setOption, setOptions, swap, clearAll, retry
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

  // If the user disables debug mid-navigation, exit nav so they don't get stuck
  // without a real GPS fix.
  useEffect(() => {
    if (!debugNav && nav.active && debug.pos === null) {
      // no-op; nav already uses real GPS from this point
    }
  }, [debugNav, nav.active, debug.pos])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (nav.active) return
    const name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const wp: Waypoint = { lat, lng, name }
    const emptyIdx = waypoints.findIndex(w => w === null)
    if (emptyIdx >= 0) {
      setWaypoint(emptyIdx, wp)
    } else {
      setWaypoint(waypoints.length - 1, wp)
    }
  }, [nav.active, waypoints, setWaypoint])

  const handleRecalcFromUser = useCallback(() => {
    if (!nav.userPos) return
    setWaypoint(0, { lat: nav.userPos.lat, lng: nav.userPos.lng, name: 'Current location' })
  }, [nav.userPos, setWaypoint])

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
          onWaypointChange={setWaypoint}
          onInsertAfter={insertWaypointAfter}
          onRemove={removeWaypoint}
          onOptionChange={setOption}
          onOptionsApply={setOptions}
          onSwap={swap}
          onClear={clearAll}
          onRetry={retry}
          onStartNavigation={nav.start}
          anyWaypointSet={anyWaypointSet}
          debugNav={debugNav}
          onToggleDebugNav={setDebugNav}
        />
      )}
      <div className="map-wrap">
        <Map
          waypoints={waypoints}
          route={route}
          onMapClick={handleMapClick}
          followUser={nav.active}
          userPos={nav.userPos}
          dimUrbanSegments={options.ignoreUrbanCurves}
          dimBelowSpeedSegments={options.minCurveSpeed > 0}
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
    </div>
  )
}
