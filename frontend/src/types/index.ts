export interface Waypoint {
  lat: number
  lng: number
  name: string
}

export interface RouteResult {
  geometry: GeoJSON.LineString
  distanceM: number
  durationS: number
  ascentM: number
  descentM: number
  curvatureScore: number | null
}

export interface SearchResult {
  lat: number
  lng: number
  name: string
  displayName: string
}

export interface RouteRequest {
  start: Waypoint
  end: Waypoint
  preferCurvy: boolean
}
