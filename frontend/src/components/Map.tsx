import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { layers, namedFlavor } from '@protomaps/basemaps'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Waypoint, RouteResult } from '../types'

const TILES_URL = (import.meta.env.VITE_TILES_URL as string) || '/tiles/map.pmtiles'

// Register PMTiles protocol once
const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))

function buildMapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://cdn.protomaps.com/fonts/pbf/{fontstack}/{range}.pbf',
    sprite: 'https://cdn.protomaps.com/sprites/v4',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${TILES_URL}`,
        attribution: '© <a href="https://openstreetmap.org" target="_blank">OpenStreetMap</a> contributors'
      }
    },
    layers: layers('protomaps', namedFlavor('light')) as maplibregl.LayerSpecification[]
  }
}

interface Props {
  start: Waypoint | null
  end: Waypoint | null
  route: RouteResult | null
  onMapClick?: (lat: number, lng: number) => void
}

export function Map({ start, end, route, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const startMarker = useRef<maplibregl.Marker | null>(null)
  const endMarker = useRef<maplibregl.Marker | null>(null)

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(),
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
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#f97316',
          'line-width': 4,
          'line-opacity': 0.9
        }
      })
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Map click handler
  useEffect(() => {
    const map = mapRef.current
    if (!map || !onMapClick) return
    const handler = (e: maplibregl.MapMouseEvent) => {
      onMapClick(e.lngLat.lat, e.lngLat.lng)
    }
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [onMapClick])

  // Update start marker
  useEffect(() => {
    const map = mapRef.current
    startMarker.current?.remove()
    if (!map || !start) return
    const el = document.createElement('div')
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);'
    startMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat([start.lng, start.lat])
      .addTo(map)
  }, [start])

  // Update end marker
  useEffect(() => {
    const map = mapRef.current
    endMarker.current?.remove()
    if (!map || !end) return
    const el = document.createElement('div')
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);'
    endMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat([end.lng, end.lat])
      .addTo(map)
  }, [end])

  // Update route line
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('route') as maplibregl.GeoJSONSource | undefined
    if (!source) return

    if (!route) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    source.setData({
      type: 'Feature',
      properties: {},
      geometry: route.geometry
    })

    // Fit map to route bounds
    const coords = route.geometry.coordinates as [number, number][]
    if (coords.length > 0) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c as maplibregl.LngLatLike),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      )
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
    }
  }, [route])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
