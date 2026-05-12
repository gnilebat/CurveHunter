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
    waypoints, route, loading, error, options,
    setWaypoint, insertWaypointAfter, removeWaypoint,
    setOption, setOptions, swap, clearAll, retry
  } = useRoute()

  const nav = useNavigation(route)

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
          onOptionsReset={() => setOptions(DEFAULT_ROUTE_OPTIONS)}
          onOptionsApply={setOptions}
          onSwap={swap}
          onClear={clearAll}
          onRetry={retry}
          onStartNavigation={nav.start}
          anyWaypointSet={anyWaypointSet}
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
          />
        )}
      </div>
    </div>
  )
}
