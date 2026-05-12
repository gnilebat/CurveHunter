import { useCallback } from 'react'
import { Map } from './components/Map'
import { RoutePanel } from './components/RoutePanel'
import { NavOverlay } from './components/NavOverlay'
import { useRoute } from './hooks/useRoute'
import { useNavigation } from './hooks/useNavigation'
import type { Waypoint } from './types'
import './App.css'

export default function App() {
  const {
    start, end, route, loading, error, preferCurvy,
    setStart, setEnd, setPreferCurvy, swap, clearAll, retry
  } = useRoute()

  const nav = useNavigation(route)

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (nav.active) return  // Disable map-click during navigation
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
          preferCurvy={preferCurvy}
          onStartChange={setStart}
          onEndChange={setEnd}
          onPreferCurvyChange={setPreferCurvy}
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
        />
        {nav.active && (
          <NavOverlay
            currentInstruction={nav.currentInstruction}
            distanceToNextTurnM={nav.distanceToNextTurnM}
            distanceRemainingM={nav.distanceRemainingM}
            durationRemainingS={nav.durationRemainingS}
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
