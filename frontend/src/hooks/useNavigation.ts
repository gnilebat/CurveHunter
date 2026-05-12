import { useState, useEffect, useRef, useCallback } from 'react'
import type { RouteResult, Instruction } from '../types'

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
  distanceToNextTurnM: number
  distanceRemainingM: number
  durationRemainingS: number
  offRoute: boolean
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

// Returns { idx, distM } for the closest route vertex to a point.
function closestVertex(coords: number[][], pt: [number, number]) {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < coords.length; i++) {
    const d = haversineM([coords[i][0], coords[i][1]], pt)
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }
  return { idx: bestIdx, distM: bestDist }
}

const OFF_ROUTE_THRESHOLD_M = 60   // beyond this distance from the route line
const ARRIVAL_THRESHOLD_M = 30      // within this distance of the destination = arrived

export function useNavigation(route: RouteResult | null) {
  const [active, setActive] = useState(false)
  const [userPos, setUserPos] = useState<UserPosition | null>(null)
  const watchId = useRef<number | null>(null)

  const start = useCallback(() => {
    if (!route || !navigator.geolocation) return
    setActive(true)
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed
        })
      },
      (err) => console.warn('Geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    )
  }, [route])

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    setActive(false)
    setUserPos(null)
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
        distanceToNextTurnM: 0,
        distanceRemainingM: 0,
        durationRemainingS: 0,
        offRoute: false
      }
    }

    const coords = route.geometry.coordinates as number[][]
    const { idx, distM } = closestVertex(coords, [userPos.lng, userPos.lat])
    const offRoute = distM > OFF_ROUTE_THRESHOLD_M

    // Find the instruction whose interval contains the closest vertex
    let currentInstruction: Instruction | null = null
    for (const ins of route.instructions) {
      if (idx >= ins.interval[0] && idx <= ins.interval[1]) {
        currentInstruction = ins
        break
      }
    }
    if (!currentInstruction && route.instructions.length > 0) {
      // After last instruction interval — show the final "arrive" step
      currentInstruction = route.instructions[route.instructions.length - 1]
    }

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

    return {
      active,
      userPos,
      currentInstruction,
      distanceToNextTurnM,
      distanceRemainingM,
      durationRemainingS,
      offRoute
    }
  })()

  const arrived =
    active &&
    userPos !== null &&
    route !== null &&
    state.distanceRemainingM < ARRIVAL_THRESHOLD_M

  return { ...state, arrived, start, stop }
}
