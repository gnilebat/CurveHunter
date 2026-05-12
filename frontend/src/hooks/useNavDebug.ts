import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RouteResult } from '../types'
import type { UserPosition } from './useNavigation'

function haversineM(a: number[], b: number[]): number {
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

function bearingDeg(a: number[], b: number[]): number {
  const toRad = (x: number) => (x * Math.PI) / 180
  const toDeg = (x: number) => (x * 180) / Math.PI
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]))
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export interface NavDebugApi {
  pos: UserPosition | null
  traveledM: number
  totalM: number
  playing: boolean
  speedKmh: number
  setTraveledM: (m: number) => void
  setSpeedKmh: (kmh: number) => void
  setPlaying: (p: boolean) => void
  step: (m?: number) => void
  jumpToNextTurn: () => void
  reset: () => void
}

const DEFAULT_SPEED_KMH = 50

// Drives a fake user position smoothly along the route geometry. Position is
// tracked as "metres travelled from the start" so we can interpolate between
// vertices instead of snapping to them, and we tick via requestAnimationFrame
// for ~60 fps motion.
export function useNavDebug(route: RouteResult | null, enabled: boolean): NavDebugApi {
  const coords = (route?.geometry.coordinates as number[][] | undefined) ?? []

  // Cumulative distance from start to vertex i. cum[0] = 0.
  const cum = useMemo(() => {
    if (coords.length === 0) return [0]
    const arr = new Array<number>(coords.length)
    arr[0] = 0
    for (let i = 1; i < coords.length; i++) {
      arr[i] = arr[i - 1] + haversineM(coords[i - 1], coords[i])
    }
    return arr
  }, [coords])
  const totalM = cum[cum.length - 1] ?? 0

  const [traveledM, setTraveledM] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedKmh, setSpeedKmh] = useState(DEFAULT_SPEED_KMH)

  // Refs so the rAF loop doesn't re-subscribe when speed changes.
  const speedRef = useRef(speedKmh)
  speedRef.current = speedKmh
  const totalRef = useRef(totalM)
  totalRef.current = totalM

  useEffect(() => { setTraveledM(0); setPlaying(false) }, [route])
  useEffect(() => { if (!enabled) setPlaying(false) }, [enabled])

  // requestAnimationFrame loop while playing — smooth, frame-rate-adaptive.
  useEffect(() => {
    if (!enabled || !playing || coords.length < 2) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)  // clamp big gaps (tab switch)
      last = now
      const speedMs = speedRef.current / 3.6
      setTraveledM(prev => {
        const next = prev + speedMs * dt
        if (next >= totalRef.current) {
          setPlaying(false)
          return totalRef.current
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, playing, coords])

  // Binary search: which segment contains the given travelled distance?
  function locate(d: number): { lo: number; f: number } {
    if (cum.length < 2) return { lo: 0, f: 0 }
    const clamped = Math.max(0, Math.min(d, totalM))
    let lo = 0
    let hi = cum.length - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] <= clamped) lo = mid
      else hi = mid
    }
    const segLen = cum[lo + 1] - cum[lo] || 1
    const f = Math.min(1, Math.max(0, (clamped - cum[lo]) / segLen))
    return { lo, f }
  }

  const pos = useMemo<UserPosition | null>(() => {
    if (!enabled || coords.length < 2) return null
    const { lo, f } = locate(traveledM)
    const a = coords[lo]
    const b = coords[Math.min(lo + 1, coords.length - 1)]
    const lng = a[0] + (b[0] - a[0]) * f
    const lat = a[1] + (b[1] - a[1]) * f
    const heading = a[0] !== b[0] || a[1] !== b[1] ? bearingDeg(a, b) : null
    return { lat, lng, heading, speed: speedKmh / 3.6 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, coords, traveledM, speedKmh])

  const step = useCallback((m: number = 100) => {
    setTraveledM(d => Math.min(totalM, d + m))
  }, [totalM])

  // Jump to ~150 m before the next turn-type instruction so the cue triggers fire.
  const jumpToNextTurn = useCallback(() => {
    if (!route || coords.length === 0) return
    const { lo } = locate(traveledM)
    for (const ins of route.instructions) {
      if (ins.interval[0] <= lo) continue
      if (ins.sign === 0) continue
      const turnM = cum[ins.interval[0]] ?? 0
      const target = Math.max(traveledM + 1, turnM - 200)
      setTraveledM(target)
      return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, coords, cum, traveledM])

  const reset = useCallback(() => { setTraveledM(0); setPlaying(false) }, [])

  return {
    pos, traveledM, totalM, playing, speedKmh,
    setTraveledM, setSpeedKmh, setPlaying, step, jumpToNextTurn, reset
  }
}
