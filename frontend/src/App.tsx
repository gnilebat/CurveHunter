import { useCallback } from 'react'
import { Map } from './components/Map'
import { RoutePanel } from './components/RoutePanel'
import { NavOverlay } from './components/NavOverlay'
import { useRoute } from './hooks/useRoute'
import { useNavigation } from './hooks/useNavigation'
import { DEFAULT_ROUTE_OPTIONS } from './types'
import type { Waypoint } from './types'
import './App.css'

export default function App() {
  const {
    start, end, route, loading, error, options,
    setStart, setEnd, setOption, setOptions, swap, clearAll, retry
  } = useRoute()

  const nav = useNavigation(route)

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (nav.active) return
    const name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const wp: Waypoint = { lat, lng, name }
    if (!start) { setStart(wp); return }
    if (!end) { setEnd(wp); return }
    setEnd(wp)
  }, [nav.active, start, end, setStart, setEnd])

  const handleRecalcFromUser = useCallback(() => {
    if (!nav.userPos || !end) return
    setStart({ lat: nav.userPos.lat, lng: nav.userPos.lng, name: 'Current location' })
  }, [nav.userPos, end, setStart])

  return (
    <div className="app">
      {!nav.active && (
        <RoutePanel
          start={start}
          end={end}
          route={route}
          loading={loading}
          error={error}
          options={options}
          onStartChange={setStart}
          onEndChange={setEnd}
          onOptionChange={setOption}
          onOptionsReset={() => setOptions(DEFAULT_ROUTE_OPTIONS)}
          onOptionsApply={setOptions}
          onSwap={swap}
          onClear={clearAll}
          onRetry={retry}
          onStartNavigation={nav.start}
        />
      )}
      <div className="map-wrap">
        <Map
          start={start}
          end={end}
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
          />
        )}
      </div>
    </div>
  )
}
