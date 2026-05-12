import type { Instruction } from '../types'
import styles from './NavOverlay.module.css'

interface Props {
  currentInstruction: Instruction | null
  distanceToNextTurnM: number
  distanceRemainingM: number
  durationRemainingS: number
  offRoute: boolean
  arrived: boolean
  onStop: () => void
  onRecalculate: () => void
}

// GraphHopper turn sign → arrow glyph
function signGlyph(sign: number): string {
  switch (sign) {
    case -98: case -8: case -7: return '↰'   // u-turn / keep left
    case -3: return '⬅'                       // sharp left
    case -2: return '↖'                       // left
    case -1: return '↰'                       // slight left
    case 0:  return '↑'                       // continue
    case 1:  return '↱'                       // slight right
    case 2:  return '↗'                       // right
    case 3:  return '➡'                       // sharp right
    case 4:  return '🏁'                      // finish
    case 5:  return '📍'                      // via reached
    case 6:  return '⟳'                       // roundabout
    case 7:  return '↱'                       // keep right
    default: return '↑'
  }
}

function fmtDistance(m: number) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}

function fmtDuration(s: number) {
  if (s < 60) return `${Math.round(s)} s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m} min`
}

export function NavOverlay({
  currentInstruction, distanceToNextTurnM, distanceRemainingM,
  durationRemainingS, offRoute, arrived, onStop, onRecalculate
}: Props) {
  if (arrived) {
    return (
      <div className={styles.wrap}>
        <div className={styles.turnCard}>
          <div className={styles.arrived}>🏁 You have arrived</div>
        </div>
        <button className={styles.stopBtn} onClick={onStop}>Exit navigation</button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.turnCard}>
        <div className={styles.arrow}>
          {currentInstruction ? signGlyph(currentInstruction.sign) : '…'}
        </div>
        <div className={styles.turnText}>
          <div className={styles.distance}>{fmtDistance(distanceToNextTurnM)}</div>
          <div className={styles.instruction}>
            {currentInstruction?.text ?? 'Locating…'}
          </div>
        </div>
      </div>

      {offRoute && (
        <div className={styles.offRoute}>
          <span>You're off the route</span>
          <button className={styles.recalcBtn} onClick={onRecalculate}>Recalculate</button>
        </div>
      )}

      <div className={styles.bottomBar}>
        <div className={styles.eta}>
          <span className={styles.etaValue}>{fmtDuration(durationRemainingS)}</span>
          <span className={styles.etaLabel}>{fmtDistance(distanceRemainingM)} remaining</span>
        </div>
        <button className={styles.stopBtn} onClick={onStop}>Stop</button>
      </div>
    </div>
  )
}
