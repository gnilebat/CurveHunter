import { useCallback } from 'react'
import { Map } from './components/Map'
import { RoutePanel } from './components/RoutePanel'
import { useRoute } from './hooks/useRoute'
import type { Waypoint } from './types'
import './App.css'

export default function App() {
  const {
    start, end, route, loading, error, preferCurvy,
    setStart, setEnd, setPreferCurvy, clearRoute
  } = useRoute()

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const wp: Waypoint = { lat, lng, name }
    if (!start) { setStart(wp); return }
    if (!end) { setEnd(wp); return }
    setEnd(wp)
  }, [start, end, setStart, setEnd])

  return (
    <div className="app">
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
        onClear={clearRoute}
      />
      <div className="map-wrap">
        <Map
          start={start}
          end={end}
          route={route}
          onMapClick={handleMapClick}
        />
      </div>
    </div>
  )
}
