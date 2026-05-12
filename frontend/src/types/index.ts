export interface Waypoint {
  lat: number
  lng: number
  name: string
}

export interface RouteSegment {
  coordinates: number[][]
  score: number
  lengthKm: number
}

export interface Instruction {
  text: string
  distanceM: number
  durationS: number
  sign: number
  streetName: string | null
  interval: [number, number]
}

export interface RouteResult {
  geometry: GeoJSON.LineString
  distanceM: number
  durationS: number
  ascentM: number
  descentM: number
  curvatureScore: number | null
  segments: RouteSegment[]
  instructions: Instruction[]
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
