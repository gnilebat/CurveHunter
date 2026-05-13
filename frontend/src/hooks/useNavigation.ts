import { useState, useEffect, useRef, useCallback } from 'react'
import type { RouteResult, Instruction } from '../types'

export type NavCueKind = 'far' | 'mid' | 'near' | 'arrive' | 'offRoute'

export interface NavCue {
  kind: NavCueKind
  sign?: number
  streetName?: string | null
  distanceM?: number
}

export interface UserPosition {
  lat: number
  lng: number
  heading: number | null   // degrees from north, null when stationary
  speed: number | null     // m/s
}

export interface NavigationState {
  active: boolean
  userPos: UserPosition | null
  currentInstruction: Instruction | null
  nextInstruction: Instruction | null
  distanceToNextTurnM: number
  distanceRemainingM: number
  durationRemainingS: number
  offRoute: boolean
  currentMaxSpeed: number  // 0 = unknown / untagged
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Returns { idx, distM } for the closest point on the route polyline to the
// given point — measured against segments, not just vertices, so we don't
// false-positive off-route when the user is between sparse vertices.
function closestOnRoute(coords: number[][], pt: [number, number]) {
  if (coords.length === 0) return { idx: 0, distM: Infinity }
  if (coords.length === 1) {
    return { idx: 0, distM: haversineM([coords[0][0], coords[0][1]], pt) }
  }
  // Equirectangular projection around the query latitude — accurate enough
  // for cross-track distance over short route segments (< few km).
  const latRef = pt[1]
  const cosLat = Math.cos((latRef * Math.PI) / 180)
  const R = 6_371_000
  const toRad = (x: number) => (x * Math.PI) / 180
  const proj = (lng: number, lat: number): [number, number] => [
    R * toRad(lng) * cosLat,
    R * toRad(lat)
  ]
  const [px, py] = proj(pt[0], pt[1])

  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = proj(coords[i][0], coords[i][1])
    const [bx, by] = proj(coords[i + 1][0], coords[i + 1][1])
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const fx = ax + t * dx, fy = ay + t * dy
    const d = Math.hypot(px - fx, py - fy)
    if (d < bestDist) {
      bestDist = d
      // Use the closer endpoint as the reference vertex index for downstream
      // instruction/segment lookups.
      bestIdx = t < 0.5 ? i : i + 1
    }
  }
  return { idx: bestIdx, distM: bestDist }
}

const OFF_ROUTE_THRESHOLD_M = 60   // beyond this distance from the route line
const ARRIVAL_THRESHOLD_M = 30      // within this distance of the destination = arrived

export function useNavigation(
  route: RouteResult | null,
  onCue?: (cue: NavCue) => void,
  simulatedPos?: UserPosition | null
) {
  const [active, setActive] = useState(false)
  const [gpsPos, setGpsPos] = useState<UserPosition | null>(null)
  const userPos: UserPosition | null = simulatedPos ?? gpsPos
  const watchId = useRef<number | null>(null)
  const simulatedFlag = simulatedPos !== undefined && simulatedPos !== null
  const announcedRef = useRef<Set<string>>(new Set())
  // Keep a ref so the effect doesn't re-fire when the caller changes the callback identity.
  const onCueRef = useRef(onCue)
  useEffect(() => { onCueRef.current = onCue }, [onCue])

  const start = useCallback(() => {
    if (!route) return
    setActive(true)
    // In simulator mode we get our position from the caller via simulatedPos
    // and skip the real GPS watcher entirely.
    if (simulatedFlag || !navigator.geolocation) return
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed
        })
      },
      (err) => console.warn('Geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    )
  }, [route, simulatedFlag])

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    setActive(false)
    setGpsPos(null)
  }, [])

  useEffect(() => () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  // Derive state from the user position + route
  const state: NavigationState = (() => {
    if (!active || !route || !userPos) {
      return {
        active,
        userPos,
        currentInstruction: null,
        nextInstruction: null,
        distanceToNextTurnM: 0,
        distanceRemainingM: 0,
        durationRemainingS: 0,
        offRoute: false,
        currentMaxSpeed: 0
      }
    }

    const coords = route.geometry.coordinates as number[][]
    const { idx, distM } = closestOnRoute(coords, [userPos.lng, userPos.lat])
    const offRoute = distM > OFF_ROUTE_THRESHOLD_M

    // Find the instruction whose interval contains the closest vertex
    let currentIdx = -1
    for (let i = 0; i < route.instructions.length; i++) {
      const ins = route.instructions[i]
      if (idx >= ins.interval[0] && idx <= ins.interval[1]) {
        currentIdx = i
        break
      }
    }
    if (currentIdx === -1 && route.instructions.length > 0) {
      currentIdx = route.instructions.length - 1
    }
    const currentInstruction = currentIdx >= 0 ? route.instructions[currentIdx] : null
    const nextInstruction = currentIdx >= 0 && currentIdx + 1 < route.instructions.length
      ? route.instructions[currentIdx + 1]
      : null

    // Distance to the start of the NEXT instruction's geometry
    let distanceToNextTurnM = 0
    if (currentInstruction) {
      const turnIdx = currentInstruction.interval[1]
      const segmentEnd = coords[Math.min(turnIdx, coords.length - 1)]
      distanceToNextTurnM = haversineM(
        [userPos.lng, userPos.lat],
        [segmentEnd[0], segmentEnd[1]]
      )
    }

    // Distance/duration remaining: sum from current vertex to end
    let distanceRemainingM = haversineM(
      [userPos.lng, userPos.lat],
      [coords[idx][0], coords[idx][1]]
    )
    for (let i = idx; i < coords.length - 1; i++) {
      distanceRemainingM += haversineM(
        [coords[i][0], coords[i][1]],
        [coords[i + 1][0], coords[i + 1][1]]
      )
    }
    const fractionRemaining = distanceRemainingM / Math.max(route.distanceM, 1)
    const durationRemainingS = route.durationS * fractionRemaining

    const currentMaxSpeed = route.maxSpeedPerVertex?.[idx] ?? 0

    return {
      active,
      userPos,
      currentInstruction,
      nextInstruction,
      distanceToNextTurnM,
      distanceRemainingM,
      durationRemainingS,
      offRoute,
      currentMaxSpeed
    }
  })()

  const arrived =
    active &&
    userPos !== null &&
    route !== null &&
    state.distanceRemainingM < ARRIVAL_THRESHOLD_M

  // Reset announcement memory whenever the route changes.
  useEffect(() => { announcedRef.current.clear() }, [route])

  // Emit cues at distance bands per upcoming turn, plus arrival / off-route.
  const upcoming = state.nextInstruction
  const upcomingKey = upcoming ? `i${upcoming.interval[0]}-${upcoming.interval[1]}` : null
  useEffect(() => {
    const fire = onCueRef.current
    if (!fire || !state.active) return
    const seen = announcedRef.current

    if (arrived) {
      if (!seen.has('arrive')) { seen.add('arrive'); fire({ kind: 'arrive' }) }
      return
    }

    if (state.offRoute) {
      if (!seen.has('offRoute')) { seen.add('offRoute'); fire({ kind: 'offRoute' }) }
      return
    } else {
      seen.delete('offRoute')
    }

    if (!upcoming || !upcomingKey) return
    const d = state.distanceToNextTurnM
    let band: 'far' | 'mid' | 'near' | null = null
    if (d <= 50) band = 'near'
    else if (d <= 200) band = 'mid'
    else if (d <= 500) band = 'far'
    if (!band) return

    const key = `${upcomingKey}-${band}`
    if (seen.has(key)) return
    seen.add(key)
    fire({
      kind: band,
      sign: upcoming.sign,
      streetName: upcoming.streetName,
      distanceM: d
    })
  }, [state.active, state.offRoute, state.distanceToNextTurnM, upcomingKey, arrived, upcoming])

  return { ...state, arrived, start, stop }
}
