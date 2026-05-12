export interface Waypoint {
  lat: number
  lng: number
  name: string
}

export interface RouteSegment {
  coordinates: number[][]
  score: number
  lengthKm: number
  isUrban: boolean
  isHighway: boolean
}

export interface RouteOptions {
  curviness: number          // 0..1
  avoidMotorways: number     // 0..1
  avoidTrunks: number        // 0..1
  avoidUrban: number         // 0..1
  ignoreUrbanCurves: boolean // score-only flag; doesn't change routing
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  curviness: 0.7,
  avoidMotorways: 0.8,
  avoidTrunks: 0.4,
  avoidUrban: 0.0,
  ignoreUrbanCurves: false
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
