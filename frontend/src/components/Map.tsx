import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol, PMTiles } from 'pmtiles'
import { layers, namedFlavor } from '@protomaps/basemaps'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useLocale } from '../i18n/LocaleProvider'
import { useTheme } from '../theme/ThemeProvider'
import type { Waypoint, RouteResult } from '../types'

const TILES_URL = (import.meta.env.VITE_TILES_URL as string) || '/tiles/map.pmtiles'

const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))

function buildMapStyle(lang: string, theme: 'light' | 'dark'): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${TILES_URL}`,
        attribution: '© <a href="https://openstreetmap.org" target="_blank">OpenStreetMap</a> contributors'
      }
    },
    layers: layers('protomaps', namedFlavor(theme), { lang }) as maplibregl.LayerSpecification[]
  }
}

interface UserPos {
  lat: number
  lng: number
  heading: number | null
}

interface Props {
  waypoints: (Waypoint | null)[]
  route: RouteResult | null
  onMapClick?: (lat: number, lng: number) => void
  /** Fires after the user drags a waypoint marker and releases it. */
  onWaypointDragEnd?: (idx: number, lat: number, lng: number) => void
  /** Fires when the user drags the route polyline and drops it — adds a new
      via waypoint at the insertion index. */
  onRouteDragInsert?: (insertIdx: number, lat: number, lng: number) => void
  /** Fires when the user clicks an alternative route polyline. */
  onAlternativeSelect?: (idx: number) => void
  followUser?: boolean
  userPos?: UserPos | null
  dimUrbanSegments?: boolean
  dimBelowSpeedSegments?: boolean
  /** Bottom area of the viewport covered by a UI panel (e.g. the bottom-sheet). */
  bottomInset?: number
  /** When auto-zoom is on, the follow camera picks a zoom level based on the
      current edge's speed limit (smaller streets → closer in). */
  autoZoom?: boolean
  onToggleAutoZoom?: () => void
  /** Current edge's tagged max-speed in km/h (0 = unknown). Drives auto-zoom. */
  currentMaxSpeed?: number
}

/** Heuristic: faster road → zoomed-out view, smaller streets → zoomed in. */
function zoomForSpeed(kmh: number): number {
  if (kmh >= 110) return 13.5
  if (kmh >= 90) return 14.2
  if (kmh >= 70) return 15
  if (kmh >= 50) return 15.7
  return 16.2  // residential / unknown
}

function buildRouteData(route: RouteResult): GeoJSON.FeatureCollection {
  if (route.segments && route.segments.length > 0) {
    return {
      type: 'FeatureCollection',
      features: route.segments.map(seg => ({
        type: 'Feature',
        properties: {
          score: seg.score,
          urban: seg.isUrban ? 1 : 0,
          highway: seg.isHighway ? 1 : 0,
          slow: seg.isBelowSpeed ? 1 : 0
        },
        geometry: { type: 'LineString', coordinates: seg.coordinates }
      }))
    }
  }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { score: 0, urban: 0, highway: 0, slow: 0 },
      geometry: route.geometry
    }]
  }
}

const ROUTE_LINE_COLOR: maplibregl.ExpressionSpecification = [
  'case',
  ['==', ['get', 'highway'], 1],
  // Highway-like: blue scale (darker = more curvy, unusual for highway)
  ['interpolate', ['linear'], ['get', 'score'],
    0,   '#bfdbfe',   // light blue (straight motorway)
    100, '#60a5fa',
    300, '#3b82f6',
    500, '#1d4ed8',
    900, '#1e3a8a'    // deep navy (very curvy highway, rare)
  ],
  // Normal roads: green→red curviness scale
  ['interpolate', ['linear'], ['get', 'score'],
    0, '#16a34a', 200, '#84cc16', 400, '#eab308', 600, '#f97316', 900, '#dc2626'
  ]
] as maplibregl.ExpressionSpecification

// Install the alt + route sources and layers. Idempotent so it's safe to call
// from both the initial `load` and the `style.load` after a setStyle — some
// sources may survive setStyle on certain MapLibre versions, others don't.
function installRouteLayers(map: maplibregl.Map): void {
  if (!map.getSource('alts')) {
    map.addSource('alts', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })
  }
  if (!map.getLayer('alt-line')) {
    map.addLayer({
      id: 'alt-line',
      type: 'line',
      source: 'alts',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#64748b', 'line-width': 4, 'line-opacity': 0.55 }
    })
  }
  if (!map.getSource('route')) {
    map.addSource('route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })
  }
  if (!map.getLayer('route-casing')) {
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#1f2937', 'line-width': 7, 'line-opacity': 0.35 }
    })
  }
  if (!map.getLayer('route-line')) {
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-width': 5,
        'line-opacity': 0.95,
        'line-color': ROUTE_LINE_COLOR
      }
    })
  }
  // Wide transparent hit-target layer on top of the visible line. The visible
  // line is only 5 px wide, which is far too narrow for a fingertip — this
  // 24-px-wide layer gives touch users a realistic grab area for the
  // drag-to-insert-via gesture. Fully transparent so it has no visual effect.
  if (!map.getLayer('route-hit')) {
    map.addLayer({
      id: 'route-hit',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 24 }
    })
  }
}

export function Map({
  waypoints, route, onMapClick, onWaypointDragEnd, onRouteDragInsert,
  onAlternativeSelect,
  followUser, userPos,
  dimUrbanSegments, dimBelowSpeedSegments,
  bottomInset = 0,
  autoZoom = false, onToggleAutoZoom,
  currentMaxSpeed = 0
}: Props) {
  const { locale } = useLocale()
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const waypointMarkers = useRef<maplibregl.Marker[]>([])
  const altBadges = useRef<maplibregl.Marker[]>([])
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const userArrow = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(locale, theme),
      center: [10.0, 51.0],
      zoom: 5
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false
    }), 'top-right')

    map.on('load', () => { installRouteLayers(map) })

    mapRef.current = map

    // Clamp min-zoom + max-bounds to the actual tile coverage, so the user
    // can't zoom/pan past the edge of the map data into the grey void.
    let cancelled = false
    const archive = new PMTiles(TILES_URL)
    const dataBoundsRef = { current: null as [[number, number], [number, number]] | null }
    const recomputeMinZoom = () => {
      if (!mapRef.current || !dataBoundsRef.current) return
      const cam = mapRef.current.cameraForBounds(dataBoundsRef.current, { padding: 0 })
      if (cam?.zoom !== undefined) {
        // Floor with a small safety margin so the edges aren't grey on resize.
        mapRef.current.setMinZoom(Math.max(0, cam.zoom + 0.05))
      }
    }
    archive.getHeader().then(h => {
      if (cancelled || !mapRef.current) return
      const b: [[number, number], [number, number]] = [
        [h.minLon, h.minLat],
        [h.maxLon, h.maxLat]
      ]
      dataBoundsRef.current = b
      mapRef.current.setMaxBounds(b)
      recomputeMinZoom()
    }).catch(() => { /* tile metadata unavailable — leave defaults */ })
    map.on('resize', recomputeMinZoom)

    return () => {
      cancelled = true
      map.off('resize', recomputeMinZoom)
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Swap basemap when locale or theme changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(buildMapStyle(locale, theme))
    map.once('style.load', () => {
      installRouteLayers(map)
      if (route) {
        const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined
        src?.setData(buildRouteData(route))
      }
    })
  }, [locale, theme]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !onMapClick) return
    const handler = (e: maplibregl.MapMouseEvent) => {
      // Suppress clicks on the route line or alternative lines — those are
      // handled by the drag-to-add-via and select-alternative gestures.
      const layers = ['route-line', 'route-hit', 'alt-line'].filter(l => map.getLayer(l))
      if (layers.length) {
        const hits = map.queryRenderedFeatures(e.point, { layers })
        if (hits.length > 0) return
      }
      onMapClick(e.lngLat.lat, e.lngLat.lng)
    }
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [onMapClick])

  // Drag the route polyline to insert a new via waypoint at the drop point.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !route || !onRouteDragInsert || followUser) return
    const coords = route.geometry.coordinates as number[][]
    if (coords.length === 0) return

    // For each non-null user waypoint, find the closest geometry vertex —
    // those anchor indices split the polyline into per-leg ranges so we know
    // which leg a drop falls on.
    const validWps = waypoints.filter((w): w is Waypoint => w !== null)
    const wpAnchors = validWps.map(w => {
      let best = 0, bestD = Infinity
      for (let i = 0; i < coords.length; i++) {
        const dx = coords[i][0] - w.lng, dy = coords[i][1] - w.lat
        const d = dx * dx + dy * dy
        if (d < bestD) { bestD = d; best = i }
      }
      return best
    })

    let dragging = false
    let moved = false           // tracks whether the gesture qualifies as a drag
    let startPoint: maplibregl.Point | null = null
    let draft: maplibregl.Marker | null = null
    const canvas = map.getCanvas()
    const DRAG_THRESHOLD_PX = 6

    const cleanup = () => {
      dragging = false
      moved = false
      startPoint = null
      map.dragPan.enable()
      canvas.style.cursor = ''
      if (draft) { draft.remove(); draft = null }
    }

    const onLineEnter = () => { if (!dragging) canvas.style.cursor = 'pointer' }
    const onLineLeave = () => { if (!dragging) canvas.style.cursor = '' }

    type LineEvent = maplibregl.MapMouseEvent | maplibregl.MapTouchEvent
    const onLineDown = (e: LineEvent) => {
      // If the underlying DOM target is a marker, the user is grabbing a
      // waypoint pin, not the line. MapLibre fires layer-mousedown for both
      // because the marker overlaps the line visually; we must not start a
      // parallel route-drag gesture or we'd insert a phantom via on release.
      const target = e.originalEvent.target as HTMLElement | null
      if (target && target.closest('.maplibregl-marker')) return

      e.preventDefault()
      dragging = true
      moved = false
      startPoint = e.point
      map.dragPan.disable()
      // Don't show the drag cursor yet — only flip to 'grabbing' once the user
      // actually moves. Pure clicks stay as the regular pointer.
    }

    const onMove = (e: LineEvent) => {
      if (!dragging) return
      if (!moved && startPoint) {
        const dx = e.point.x - startPoint.x
        const dy = e.point.y - startPoint.y
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
        moved = true
        canvas.style.cursor = 'grabbing'
        // Spawn the draft marker only now that we know it's a real drag.
        const el = document.createElement('div')
        el.style.cssText =
          'width:16px;height:16px;border-radius:50%;' +
          'background:#3b82f6;border:3px solid #fff;' +
          'box-shadow:0 0 0 3px rgba(59,130,246,0.35),0 4px 10px rgba(0,0,0,.4);' +
          'pointer-events:none;'
        draft = new maplibregl.Marker({ element: el })
          .setLngLat(e.lngLat)
          .addTo(map)
      }
      if (moved && draft) draft.setLngLat(e.lngLat)
    }

    const onUp = (e: LineEvent) => {
      if (!dragging) return
      const lng = e.lngLat.lng, lat = e.lngLat.lat
      const wasDrag = moved
      cleanup()

      if (!wasDrag) {
        // Pure click on the route line — fall through to the normal map click
        // handler so the armed waypoint input gets filled at this point.
        onMapClick?.(lat, lng)
        return
      }

      // Snap drop to the closest vertex on the route polyline.
      let dropIdx = 0, bestD = Infinity
      for (let i = 0; i < coords.length; i++) {
        const dx = coords[i][0] - lng, dy = coords[i][1] - lat
        const d = dx * dx + dy * dy
        if (d < bestD) { bestD = d; dropIdx = i }
      }

      // Figure out which leg the drop is in → insertion position.
      let insertAt = -1
      for (let i = 0; i < wpAnchors.length - 1; i++) {
        if (dropIdx >= wpAnchors[i] && dropIdx <= wpAnchors[i + 1]) {
          insertAt = i + 1
          break
        }
      }
      if (insertAt < 1 || insertAt >= validWps.length) return  // outside any leg
      onRouteDragInsert(insertAt, lat, lng)
    }

    // MapLibre emits emulated mouse events for touch input too, so these
    // listeners cover both desktop and mobile without separate touch wiring.
    // mouseenter/mouseleave on a route-line layer are per-mousemove hit-tests
    // against potentially thousands of vertices and noticeably slow down map
    // panning. Skip them; the drag-to-insert gesture still works without the
    // visible cursor hint.
    // Bind to the wide transparent `route-hit` layer so touchpoints land. Both
    // pointer + touch event families are wired so the gesture works on phones
    // (where MapLibre does NOT emulate mouse events from touches).
    map.on('mousedown', 'route-hit', onLineDown)
    map.on('touchstart', ['route-hit'], onLineDown)
    map.on('mousemove', onMove)
    map.on('touchmove', onMove)
    map.on('mouseup', onUp)
    map.on('touchend', onUp)
    void onLineEnter; void onLineLeave  // intentionally unused

    return () => {
      map.off('mousedown', 'route-hit', onLineDown)
      map.off('touchstart', ['route-hit'], onLineDown)
      map.off('mousemove', onMove)
      map.off('touchmove', onMove)
      map.off('mouseup', onUp)
      map.off('touchend', onUp)
      cleanup()
    }
  }, [route, waypoints, onRouteDragInsert, onMapClick, followUser])

  useEffect(() => {
    const map = mapRef.current
    waypointMarkers.current.forEach(m => m.remove())
    waypointMarkers.current = []
    if (!map) return
    waypoints.forEach((wp, idx) => {
      if (!wp) return
      const isFirst = idx === 0
      const isLast = idx === waypoints.length - 1
      const color = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#3b82f6'
      const el = document.createElement('div')
      // Markers must be big enough to grab with a fingertip on phones — the
      // previous 14 / 18 px sizes were nearly impossible to hit. The dot
      // itself stays modest visually; an extra transparent ring extends the
      // hit area without making the marker look chunky.
      if (isFirst || isLast) {
        el.style.cssText =
          'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none;'
        const disc = document.createElement('div')
        disc.style.cssText =
          `width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);`
        el.appendChild(disc)
      } else {
        el.style.cssText =
          'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none;'
        const disc = document.createElement('div')
        disc.style.cssText =
          `width:24px;height:24px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font:bold 12px/16px sans-serif;display:flex;align-items:center;justify-content:center;`
        disc.textContent = String(idx)
        el.appendChild(disc)
      }
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map)
      marker.on('dragstart', () => { el.style.cursor = 'grabbing' })
      marker.on('dragend', () => {
        el.style.cursor = 'pointer'
        const ll = marker.getLngLat()
        onWaypointDragEnd?.(idx, ll.lat, ll.lng)
      })
      waypointMarkers.current.push(marker)
    })

    // If any set waypoint is currently off-screen, gently re-fit the view so
    // the user can see what they just placed. Skipped during navigation (the
    // follow camera owns the viewport) and skipped when there's only one
    // waypoint inside the visible area already.
    if (followUser) return
    const set = waypoints.filter((w): w is Waypoint => w !== null)
    if (set.length === 0) return
    const view = map.getBounds()
    const anyOffscreen = set.some(w => !view.contains([w.lng, w.lat]))
    if (!anyOffscreen) return
    if (set.length === 1) {
      const w = set[0]
      map.easeTo({ center: [w.lng, w.lat], duration: 400 })
      return
    }
    const b = set.reduce(
      (bb, w) => bb.extend([w.lng, w.lat] as maplibregl.LngLatLike),
      new maplibregl.LngLatBounds([set[0].lng, set[0].lat], [set[0].lng, set[0].lat])
    )
    map.fitBounds(b, {
      padding: { top: 60, right: 60, left: 60, bottom: 60 + bottomInset },
      maxZoom: 13,
      duration: 400
    })
  }, [waypoints, onWaypointDragEnd, followUser, bottomInset])

  // Dim segments excluded from the curviness score (urban / below-speed)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getLayer('route-line')) return
      // A segment is "excluded" if EITHER active filter matches it
      const dimUrban = dimUrbanSegments ? 1 : 0
      const dimSlow = dimBelowSpeedSegments ? 1 : 0
      const isDimmed: maplibregl.ExpressionSpecification = [
        'any',
        ['==', ['*', ['get', 'urban'], dimUrban], 1],
        ['==', ['*', ['get', 'slow'], dimSlow], 1]
      ]
      map.setPaintProperty('route-line', 'line-opacity',
        ['case', isDimmed, 0.25, 0.95] as maplibregl.ExpressionSpecification
      )
      map.setPaintProperty('route-casing', 'line-opacity',
        ['case', isDimmed, 0.1, 0.35] as maplibregl.ExpressionSpecification
      )
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [dimUrbanSegments, dimBelowSpeedSegments])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const source = map.getSource('route') as maplibregl.GeoJSONSource | undefined
      const altSource = map.getSource('alts') as maplibregl.GeoJSONSource | undefined
      if (!source) return
      if (!route) {
        source.setData({ type: 'FeatureCollection', features: [] })
        altSource?.setData({ type: 'FeatureCollection', features: [] })
        return
      }
      source.setData(buildRouteData(route))

      // Feed alternative paths into the 'alts' source as muted lines below
      // the primary route. We DECIMATE the geometry first — each alt route
      // can have thousands of vertices and rendering all of them at line-
      // width 4 every frame is a major contributor to pan lag. A stride of
      // 5 reduces GPU triangle work ~5× while staying visually faithful.
      if (altSource) {
        const decimate = (coords: number[][], stride: number): number[][] => {
          if (coords.length <= 4) return coords
          const out: number[][] = []
          for (let i = 0; i < coords.length; i += stride) out.push(coords[i])
          const last = coords[coords.length - 1]
          if (out[out.length - 1] !== last) out.push(last)
          return out
        }
        altSource.setData({
          type: 'FeatureCollection',
          features: route.alternatives.map((a, i) => ({
            type: 'Feature',
            properties: { altIdx: i },
            geometry: {
              type: 'LineString',
              coordinates: decimate(a.geometry.coordinates as number[][], 5)
            }
          }))
        })
      }

      const coords = route.geometry.coordinates as [number, number][]
      if (coords.length > 0) {
        // Include alternatives in the fit bounds so they're all visible.
        const bounds = coords.reduce(
          (b, c) => b.extend(c as maplibregl.LngLatLike),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        )
        for (const a of route.alternatives) {
          for (const c of a.geometry.coordinates as number[][]) {
            bounds.extend([c[0], c[1]] as maplibregl.LngLatLike)
          }
        }
        map.fitBounds(bounds, {
          padding: { top: 60, right: 60, left: 60, bottom: 60 + bottomInset },
          maxZoom: 14
        })
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  // Alternative routes are selected only via their floating badge marker —
  // the polyline itself is not interactive. Skipping the layer click handler
  // also avoids any per-click hit-testing cost on the alt geometry.

  // Floating clickable badge near the midpoint of each alternative route —
  // easier hit target than the thin line, plus shows distance + time delta
  // so the user can compare candidates at a glance.
  useEffect(() => {
    const map = mapRef.current
    altBadges.current.forEach(m => m.remove())
    altBadges.current = []
    if (!map || !route || !onAlternativeSelect) return

    route.alternatives.forEach((alt, idx) => {
      const coords = alt.geometry.coordinates as number[][]
      if (coords.length === 0) return
      // Midpoint by array index — good enough visually; cheaper than length-weighted.
      const midIdx = Math.floor(coords.length / 2)
      const [lng, lat] = coords[midIdx]

      const distKm = Math.round(alt.distanceM / 1000)
      const dtMin = Math.round((alt.durationS - route.durationS) / 60)
      const dtStr = dtMin === 0 ? '' : dtMin > 0 ? ` · +${dtMin} min` : ` · ${dtMin} min`

      // Outer element is owned by MapLibre — its CSS transform is used to
      // pin the marker to the map. We must NOT touch its transform; hover
      // effects go on the inner chip.
      const root = document.createElement('div')
      const chip = document.createElement('div')
      chip.style.cssText =
        'background:var(--bg,#fff);' +
        'border:2px solid var(--secondary,#3b82f6);' +
        'border-radius:16px;' +
        'padding:4px 10px;' +
        'font:600 11px/1.3 system-ui,sans-serif;' +
        'color:var(--text,#111);' +
        'cursor:pointer;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.25);' +
        'white-space:nowrap;' +
        'user-select:none;' +
        'transition:transform 0.12s, box-shadow 0.12s;' +
        'transform-origin:center;'
      chip.textContent = `${distKm} km${dtStr}`
      chip.addEventListener('mouseenter', () => {
        chip.style.transform = 'scale(1.08)'
        chip.style.boxShadow = '0 4px 14px rgba(37,99,235,0.35)'
      })
      chip.addEventListener('mouseleave', () => {
        chip.style.transform = ''
        chip.style.boxShadow = '0 2px 8px rgba(0,0,0,.25)'
      })
      chip.addEventListener('click', (e) => {
        e.stopPropagation()
        onAlternativeSelect(idx)
      })
      root.appendChild(chip)

      const marker = new maplibregl.Marker({ element: root })
        .setLngLat([lng, lat])
        .addTo(map)
      altBadges.current.push(marker)
    })
  }, [route, onAlternativeSelect])

  // When the bottom UI panel resizes, gently pan the map upward by half the
  // height change so the visible-area centre stays roughly steady. No zoom
  // change, no re-fit — just a slight follow. Skipped during navigation
  // (camera is locked to the user).
  const prevInset = useRef(bottomInset)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setPadding({ top: 0, right: 0, left: 0, bottom: bottomInset })
    if (followUser) { prevInset.current = bottomInset; return }
    const delta = bottomInset - prevInset.current
    prevInset.current = bottomInset
    if (delta !== 0) map.panBy([0, delta / 2], { duration: 0 })
  }, [bottomInset, followUser])

  // User-position marker (navigation mode)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!userPos) {
      userMarker.current?.remove()
      userMarker.current = null
      userArrow.current = null
      return
    }
    if (!userMarker.current) {
      const el = document.createElement('div')
      el.innerHTML = `
        <div style="
          width:22px;height:22px;border-radius:50%;
          background:#2563eb;border:3px solid #fff;
          box-shadow:0 0 0 2px rgba(37,99,235,0.35),0 2px 6px rgba(0,0,0,.4);
          display:flex;align-items:center;justify-content:center;
          line-height:0;
        ">
          <svg data-arrow xmlns="http://www.w3.org/2000/svg"
               width="12" height="12" viewBox="-10 -10 20 20"
               style="display:block;transform-origin:center center;transition:transform 0.2s;">
            <polygon points="0,-7 5,5 0,2 -5,5" fill="#fff" />
          </svg>
        </div>`
      userArrow.current = el.querySelector('[data-arrow]') as HTMLElement | null
      userMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([userPos.lng, userPos.lat])
        .addTo(map)
    } else {
      userMarker.current.setLngLat([userPos.lng, userPos.lat])
    }
    if (userArrow.current && userPos.heading !== null && !isNaN(userPos.heading)) {
      userArrow.current.style.transform = `rotate(${userPos.heading}deg)`
    }
  }, [userPos])

  // When navigation begins, fly to the start waypoint immediately so the
  // user isn't stuck looking at the previous fitBounds while waiting for a
  // GPS fix. Triggered once per follow-mode transition.
  useEffect(() => {
    if (!followUser) return
    const map = mapRef.current
    if (!map) return
    const start = waypoints[0]
    if (!start) return
    map.easeTo({
      center: [start.lng, start.lat],
      zoom: 15,
      pitch: 50,
      bearing: 0,
      duration: 500
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followUser])

  // Follow user position when navigating
  useEffect(() => {
    const map = mapRef.current
    if (!map || !followUser || !userPos) return
    map.easeTo({
      center: [userPos.lng, userPos.lat],
      // Only the recentre + manual buttons set zoom — the follow camera
      // leaves zoom alone so user-chosen zoom level sticks. Auto-zoom mode
      // overrides this with a speed-derived zoom.
      ...(autoZoom ? { zoom: zoomForSpeed(currentMaxSpeed) } : {}),
      pitch: 50,
      bearing: userPos.heading ?? 0,
      duration: 200
    })
  }, [followUser, userPos, autoZoom, currentMaxSpeed])

  // Reset camera when navigation ends
  useEffect(() => {
    const map = mapRef.current
    if (!map || followUser) return
    map.easeTo({ pitch: 0, bearing: 0, duration: 500 })
  }, [followUser])

  const recentre = () => {
    const m = mapRef.current
    if (!m || !userPos) return
    m.easeTo({
      center: [userPos.lng, userPos.lat],
      zoom: 16,
      pitch: 50,
      bearing: userPos.heading ?? 0,
      duration: 500
    })
  }

  const navButtonStyle: React.CSSProperties = {
    width: 44, height: 44,
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg, var(--secondary), var(--secondary-hover))',
    color: '#fff', cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(77, 124, 223, 0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }
  const stackBtn = { ...navButtonStyle, width: 40, height: 40 } as React.CSSProperties

  const fitRoute = () => {
    const m = mapRef.current
    if (!m || !route) return
    const coords = route.geometry.coordinates as [number, number][]
    if (coords.length === 0) return
    const bounds = coords.reduce(
      (b, c) => b.extend(c as maplibregl.LngLatLike),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    )
    for (const a of route.alternatives) {
      for (const c of a.geometry.coordinates as number[][]) {
        bounds.extend([c[0], c[1]] as maplibregl.LngLatLike)
      }
    }
    m.fitBounds(bounds, {
      padding: { top: 60, right: 60, left: 60, bottom: 60 + bottomInset },
      maxZoom: 14,
      duration: 500
    })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Sits under MapLibre's NavigationControl + GeolocateControl in the
          top-right column. Visible only when there is a route to fit and we
          aren't already following the user (in nav mode the bottom stack
          owns the camera). */}
      {!followUser && route && (
        <button
          onClick={fitRoute}
          aria-label="Fit route to view"
          title="Fit route to view"
          style={{
            position: 'absolute',
            top: 'calc(140px + env(safe-area-inset-top))',
            right: 10,
            width: 29, height: 29,
            borderRadius: 4,
            border: 'none',
            background: '#fff',
            color: '#333',
            boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 5
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9V4h5" />
            <path d="M20 9V4h-5" />
            <path d="M4 15v5h5" />
            <path d="M20 15v5h-5" />
          </svg>
        </button>
      )}

      {followUser && userPos && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 96,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
            zIndex: 25
          }}
        >
          {onToggleAutoZoom && (
            <button
              onClick={onToggleAutoZoom}
              aria-pressed={autoZoom}
              title="Auto-zoom"
              aria-label="Auto-zoom"
              style={{
                ...stackBtn,
                background: autoZoom
                  ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))'
                  : stackBtn.background,
                boxShadow: autoZoom
                  ? '0 4px 10px rgba(245, 158, 11, 0.45)'
                  : stackBtn.boxShadow
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7V3h4" />
                <path d="M21 7V3h-4" />
                <path d="M3 17v4h4" />
                <path d="M21 17v4h-4" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              const m = mapRef.current; if (!m) return
              // setZoom (sync) instead of easeTo so the follow-camera easeTo
              // that fires on the next userPos tick can't cut the zoom step short.
              m.stop()
              m.setZoom(m.getZoom() + 1)
            }}
            aria-label="Zoom in"
            title="Zoom in"
            style={stackBtn}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={() => {
              const m = mapRef.current; if (!m) return
              m.stop()
              m.setZoom(m.getZoom() - 1)
            }}
            aria-label="Zoom out"
            title="Zoom out"
            style={stackBtn}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={recentre}
            aria-label="Recentre on me"
            title="Recentre"
            style={navButtonStyle}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
