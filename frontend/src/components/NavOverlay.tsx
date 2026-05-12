import type { Instruction } from '../types'
import { ManeuverIcon } from './ManeuverIcon'
import styles from './NavOverlay.module.css'

interface Props {
  currentInstruction: Instruction | null
  nextInstruction: Instruction | null
  distanceToNextTurnM: number
  distanceRemainingM: number
  durationRemainingS: number
  speedMs: number | null
  offRoute: boolean
  arrived: boolean
  onStop: () => void
  onRecalculate: () => void
}

function formatNavDistance(m: number) {
  if (m < 50) return 'Now'
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  if (m < 10_000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 1000)} km`
}

function formatTotalDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`
  if (m < 10_000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 1000)} km`
}

function formatDuration(s: number) {
  if (s < 60) return '< 1 min'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

function formatETA(durationS: number) {
  const arrival = new Date(Date.now() + durationS * 1000)
  return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function turnVerb(sign: number): string {
  switch (Math.abs(sign === 98 ? 8 : sign)) {
    case 0: return 'Continue'
    case 1: return sign > 0 ? 'Slight right' : 'Slight left'
    case 2: return sign > 0 ? 'Turn right' : 'Turn left'
    case 3: return sign > 0 ? 'Sharp right' : 'Sharp left'
    case 4: return 'Arrive'
    case 6: return 'Take roundabout'
    case 7: return sign > 0 ? 'Keep right' : 'Keep left'
    case 8: return 'Make a U-turn'
    default: return 'Continue'
  }
}

// Use street_name if available, otherwise derive from instruction text.
function streetFromInstruction(ins: Instruction): string | null {
  if (ins.streetName && ins.streetName.length > 0) return ins.streetName
  const m = ins.text.match(/onto (.+?)(?:$|,)/i)
  return m ? m[1] : null
}

export function NavOverlay({
  currentInstruction, nextInstruction,
  distanceToNextTurnM, distanceRemainingM, durationRemainingS, speedMs,
  offRoute, arrived, onStop, onRecalculate
}: Props) {

  if (arrived) {
    return (
      <div className={styles.wrap}>
        <div className={styles.topCard}>
          <div className={styles.primary}>
            <div className={styles.iconWrap}><ManeuverIcon sign={4} size={56} /></div>
            <div className={styles.primaryText}>
              <div className={styles.bigLine}>You've arrived</div>
              <div className={styles.smallLine}>End of route</div>
            </div>
          </div>
        </div>
        <div className={styles.bottomPanel}>
          <div className={styles.eta}>
            <span className={styles.etaTime}>—</span>
            <span className={styles.etaSub}>Destination reached</span>
          </div>
          <button className={styles.closeBtn} onClick={onStop} aria-label="Exit">✕</button>
        </div>
      </div>
    )
  }

  const street = currentInstruction ? streetFromInstruction(currentInstruction) : null
  const verb = currentInstruction ? turnVerb(currentInstruction.sign) : 'Continue'
  const speedKmh = speedMs !== null && speedMs > 0.5 ? Math.round(speedMs * 3.6) : null

  return (
    <div className={styles.wrap}>
      <div className={styles.topCard}>
        <div className={styles.primary}>
          <div className={styles.iconWrap}>
            <ManeuverIcon sign={currentInstruction?.sign ?? 0} size={56} />
          </div>
          <div className={styles.primaryText}>
            <div className={styles.bigLine}>{formatNavDistance(distanceToNextTurnM)}</div>
            <div className={styles.smallLine}>
              <span className={styles.verb}>{verb}</span>
              {street && <span className={styles.street}> onto {street}</span>}
            </div>
          </div>
        </div>

        {nextInstruction && (
          <div className={styles.thenRow}>
            <div className={styles.thenIcon}>
              <ManeuverIcon sign={nextInstruction.sign} size={22} />
            </div>
            <span className={styles.thenLabel}>Then</span>
            <span className={styles.thenText}>
              {turnVerb(nextInstruction.sign)}
              {streetFromInstruction(nextInstruction) && (
                <> onto <b>{streetFromInstruction(nextInstruction)}</b></>
              )}
            </span>
          </div>
        )}
      </div>

      {offRoute && (
        <div className={styles.offRoute}>
          <span>You're off the route</span>
          <button className={styles.recalcBtn} onClick={onRecalculate}>Recalculate</button>
        </div>
      )}

      {speedKmh !== null && (
        <div className={styles.speedBadge}>
          <span className={styles.speedNum}>{speedKmh}</span>
          <span className={styles.speedUnit}>km/h</span>
        </div>
      )}

      <div className={styles.bottomPanel}>
        <div className={styles.eta}>
          <span className={styles.etaTime}>{formatDuration(durationRemainingS)}</span>
          <span className={styles.etaSub}>
            {formatTotalDistance(distanceRemainingM)} · ETA {formatETA(durationRemainingS)}
          </span>
        </div>
        <button className={styles.closeBtn} onClick={onStop} aria-label="Exit">✕</button>
      </div>
    </div>
  )
}
