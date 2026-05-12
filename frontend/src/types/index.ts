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
  isBelowSpeed: boolean
}

export interface RouteOptions {
  curviness: number             // 0..1
  avoidMotorways: number        // 0..1
  avoidTrunks: number           // 0..1
  avoidUrban: number            // 0..1
  ignoreUrbanCurves: boolean    // score-only filter
  minCurveSpeed: number         // km/h threshold; 0 = off
  avoidUnpaved: boolean
}

export const MIN_CURVE_SPEED_STEPS = [0, 30, 50, 70, 80, 90, 100, 120] as const

export type PresetId = 'fastest' | 'curvy' | 'curvyPlus' | 'curvyMax'

export const ROUTE_PRESETS: Record<PresetId, RouteOptions> = {
  fastest: {
    curviness: 0,
    avoidMotorways: 0,
    avoidTrunks: 0,
    avoidUrban: 0,
    ignoreUrbanCurves: false,
    minCurveSpeed: 0,
    avoidUnpaved: true
  },
  curvy: {
    curviness: 0.7,
    avoidMotorways: 0.8,
    avoidTrunks: 0.4,
    avoidUrban: 0.3,
    ignoreUrbanCurves: true,
    minCurveSpeed: 0,
    avoidUnpaved: true
  },
  curvyPlus: {
    curviness: 1.2,
    avoidMotorways: 1.0,
    avoidTrunks: 0.8,
    avoidUrban: 0.6,
    ignoreUrbanCurves: true,
    minCurveSpeed: 50,
    avoidUnpaved: true
  },
  curvyMax: {
    curviness: 2.0,
    avoidMotorways: 1.0,
    avoidTrunks: 1.0,
    avoidUrban: 0.9,
    ignoreUrbanCurves: true,
    minCurveSpeed: 70,
    avoidUnpaved: true
  }
}

export const PRESET_ORDER: PresetId[] = ['fastest', 'curvy', 'curvyPlus', 'curvyMax']

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = ROUTE_PRESETS.curvy

export function matchPreset(opts: RouteOptions): PresetId | null {
  for (const id of PRESET_ORDER) {
    const p = ROUTE_PRESETS[id]
    if (
      p.curviness === opts.curviness &&
      p.avoidMotorways === opts.avoidMotorways &&
      p.avoidTrunks === opts.avoidTrunks &&
      p.avoidUrban === opts.avoidUrban &&
      p.ignoreUrbanCurves === opts.ignoreUrbanCurves &&
      p.minCurveSpeed === opts.minCurveSpeed &&
      p.avoidUnpaved === opts.avoidUnpaved
    ) return id
  }
  return null
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
  motorwayM: number
  trunkM: number
  curvatureScore: number | null
  segments: RouteSegment[]
  instructions: Instruction[]
  maxSpeedPerVertex: number[]
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
