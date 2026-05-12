import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
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
  start: Waypoint | null
  end: Waypoint | null
  route: RouteResult | null
  onMapClick?: (lat: number, lng: number) => void
  followUser?: boolean
  userPos?: UserPos | null
  dimUrbanSegments?: boolean
  dimBelowSpeedSegments?: boolean
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
  start, end, route, onMapClick, followUser, userPos,
  dimUrbanSegments, dimBelowSpeedSegments
}: Props) {
  const { locale } = useLocale()
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const startMarker = useRef<maplibregl.Marker | null>(null)
  const endMarker = useRef<maplibregl.Marker | null>(null)
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const userArrow = useRef<HTMLDivElement | null>(null)

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
    return () => { map.remove(); mapRef.current = null }
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
      onMapClick(e.lngLat.lat, e.lngLat.lng)
    }
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [onMapClick])

  useEffect(() => {
    const map = mapRef.current
    startMarker.current?.remove()
    if (!map || !start) return
    const el = document.createElement('div')
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);'
    startMarker.current = new maplibregl.Marker({ element: el }).setLngLat([start.lng, start.lat]).addTo(map)
  }, [start])

  useEffect(() => {
    const map = mapRef.current
    endMarker.current?.remove()
    if (!map || !end) return
    const el = document.createElement('div')
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);'
    endMarker.current = new maplibregl.Marker({ element: el }).setLngLat([end.lng, end.lat]).addTo(map)
  }, [end])

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
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [route])

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
        ">
          <div data-arrow style="
            width:0;height:0;
            border-left:5px solid transparent;border-right:5px solid transparent;
            border-bottom:9px solid #fff;
            transform-origin:center 70%;
            transition:transform 0.3s;
          "></div>
        </div>`
      userArrow.current = el.querySelector('[data-arrow]') as HTMLDivElement | null
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
      duration: 800
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
