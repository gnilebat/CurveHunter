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
  followUser?: boolean
  userPos?: UserPos | null
  dimUrbanSegments?: boolean
  dimBelowSpeedSegments?: boolean
  /** Bottom area of the viewport covered by a UI panel (e.g. the bottom-sheet). */
  bottomInset?: number
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

export function Map({
  waypoints, route, onMapClick, onWaypointDragEnd, onRouteDragInsert,
  followUser, userPos,
  dimUrbanSegments, dimBelowSpeedSegments,
  bottomInset = 0
}: Props) {
  const { locale } = useLocale()
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const waypointMarkers = useRef<maplibregl.Marker[]>([])
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

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      // Subtle dark casing under the coloured line
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1f2937',
          'line-width': 7,
          'line-opacity': 0.35
        }
      })
      // Coloured route line — green (straight) → red (twisty)
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
    })

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
      if (map.getSource('route')) return
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1f2937', 'line-width': 7, 'line-opacity': 0.35 }
      })
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
      // Suppress clicks on the route line — those are handled by the
      // drag-to-add-via gesture below.
      if (map.getLayer('route-line')) {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['route-line'] })
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
    let draft: maplibregl.Marker | null = null
    const canvas = map.getCanvas()

    const cleanup = () => {
      dragging = false
      map.dragPan.enable()
      canvas.style.cursor = ''
      if (draft) { draft.remove(); draft = null }
    }

    const onLineEnter = () => { if (!dragging) canvas.style.cursor = 'grab' }
    const onLineLeave = () => { if (!dragging) canvas.style.cursor = '' }

    const onLineDown = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault()
      dragging = true
      map.dragPan.disable()
      canvas.style.cursor = 'grabbing'

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

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!dragging || !draft) return
      draft.setLngLat(e.lngLat)
    }

    const onUp = (e: maplibregl.MapMouseEvent) => {
      if (!dragging) return
      const lng = e.lngLat.lng, lat = e.lngLat.lat
      cleanup()

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
    map.on('mouseenter', 'route-line', onLineEnter)
    map.on('mouseleave', 'route-line', onLineLeave)
    map.on('mousedown', 'route-line', onLineDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)

    return () => {
      map.off('mouseenter', 'route-line', onLineEnter)
      map.off('mouseleave', 'route-line', onLineLeave)
      map.off('mousedown', 'route-line', onLineDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      cleanup()
    }
  }, [route, waypoints, onRouteDragInsert, followUser])

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
      if (isFirst || isLast) {
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab;`
      } else {
        el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font:bold 11px/14px sans-serif;display:flex;align-items:center;justify-content:center;cursor:grab;`
        el.textContent = String(idx)
      }
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map)
      marker.on('dragstart', () => { el.style.cursor = 'grabbing' })
      marker.on('dragend', () => {
        el.style.cursor = 'grab'
        const ll = marker.getLngLat()
        onWaypointDragEnd?.(idx, ll.lat, ll.lng)
      })
      waypointMarkers.current.push(marker)
    })
  }, [waypoints, onWaypointDragEnd])

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
      if (!source) return
      if (!route) {
        source.setData({ type: 'FeatureCollection', features: [] })
        return
      }
      source.setData(buildRouteData(route))

      const coords = route.geometry.coordinates as [number, number][]
      if (coords.length > 0) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c as maplibregl.LngLatLike),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        )
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

  // Follow user position when navigating
  useEffect(() => {
    const map = mapRef.current
    if (!map || !followUser || !userPos) return
    map.easeTo({
      center: [userPos.lng, userPos.lat],
      zoom: 16,
      pitch: 50,
      bearing: userPos.heading ?? 0,
      duration: 200
    })
  }, [followUser, userPos])

  // Reset camera when navigation ends
  useEffect(() => {
    const map = mapRef.current
    if (!map || followUser) return
    map.easeTo({ pitch: 0, bearing: 0, duration: 500 })
  }, [followUser])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
