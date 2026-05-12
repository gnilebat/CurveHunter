import type { Instruction } from '../types'
import { ManeuverIcon } from './ManeuverIcon'
import { useLocale } from '../i18n/LocaleProvider'
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
  voiceEnabled: boolean
  voiceAvailable: boolean
  onToggleVoice: () => void
}

// GraphHopper sign → translation key under `nav.verb`
function verbKey(sign: number): string {
  const abs = Math.abs(sign === 98 ? 8 : sign)
  switch (abs) {
    case 0: return 'continue'
    case 1: return sign > 0 ? 'slightRight' : 'slightLeft'
    case 2: return sign > 0 ? 'turnRight' : 'turnLeft'
    case 3: return sign > 0 ? 'sharpRight' : 'sharpLeft'
    case 4: return 'arrive'
    case 6: return 'roundabout'
    case 7: return sign > 0 ? 'keepRight' : 'keepLeft'
    case 8: return 'uTurn'
    default: return 'continue'
  }
}

function streetFromInstruction(ins: Instruction): string | null {
  if (ins.streetName && ins.streetName.length > 0) return ins.streetName
  const m = ins.text.match(/onto (.+?)(?:$|,)/i) || ins.text.match(/auf (.+?)(?:$|,)/i)
  return m ? m[1] : null
}

export function NavOverlay({
  currentInstruction, nextInstruction,
  distanceToNextTurnM, distanceRemainingM, durationRemainingS, speedMs,
  offRoute, arrived, onStop, onRecalculate,
  voiceEnabled, voiceAvailable, onToggleVoice
}: Props) {
  const { t, locale } = useLocale()
  const localeTag = locale === 'de' ? 'de-DE' : 'en-US'

  function formatNavDistance(m: number) {
    if (m < 50) return t('nav.now')
    if (m < 1000) return `${Math.round(m / 10) * 10} m`
    if (m < 10_000) return `${(m / 1000).toLocaleString(localeTag, { maximumFractionDigits: 1 })} km`
    return `${Math.round(m / 1000)} km`
  }

  function formatTotalDistance(m: number) {
    if (m < 1000) return `${Math.round(m)} m`
    if (m < 10_000) return `${(m / 1000).toLocaleString(localeTag, { maximumFractionDigits: 1 })} km`
    return `${Math.round(m / 1000)} km`
  }

  function formatDuration(s: number) {
    if (s < 60) return t('nav.lessThanMin')
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0
      ? `${h} ${t('nav.hourShort')} ${m} ${t('nav.minShort')}`
      : `${m} ${t('nav.minShort')}`
  }

  function formatETA(durationS: number) {
    const arrival = new Date(Date.now() + durationS * 1000)
    return arrival.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })
  }

  const voiceButton = voiceAvailable ? (
    <button
      className={styles.closeBtn}
      onClick={onToggleVoice}
      aria-label={voiceEnabled ? t('nav.voiceOff') : t('nav.voiceOn')}
      title={voiceEnabled ? t('nav.voiceOff') : t('nav.voiceOn')}
      aria-pressed={voiceEnabled}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
        {voiceEnabled ? (
          <>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </>
        ) : (
          <line x1="22" y1="2" x2="14" y2="22" />
        )}
      </svg>
    </button>
  ) : null

  if (arrived) {
    return (
      <div className={styles.wrap}>
        <div className={styles.topCard}>
          <div className={styles.primary}>
            <div className={styles.iconWrap}><ManeuverIcon sign={4} size={56} /></div>
            <div className={styles.primaryText}>
              <div className={styles.bigLine}>{t('nav.arrived')}</div>
              <div className={styles.smallLine}>{t('nav.destinationReached')}</div>
            </div>
          </div>
        </div>
        <div className={styles.bottomPanel}>
          <div className={styles.eta}>
            <span className={styles.etaTime}>—</span>
            <span className={styles.etaSub}>{t('nav.endOfRoute')}</span>
          </div>
          {voiceButton}
          <button className={styles.closeBtn} onClick={onStop} aria-label="Exit">✕</button>
        </div>
      </div>
    )
  }

  const street = currentInstruction ? streetFromInstruction(currentInstruction) : null
  const verb = currentInstruction
    ? t(`nav.verb.${verbKey(currentInstruction.sign)}`)
    : t('nav.verb.continue')
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
              {street && (
                <span className={styles.street}> {t('nav.onto')} {street}</span>
              )}
              {!currentInstruction && <span>{t('nav.locating')}</span>}
            </div>
          </div>
        </div>

        {nextInstruction && (
          <div className={styles.thenRow}>
            <div className={styles.thenIcon}>
              <ManeuverIcon sign={nextInstruction.sign} size={22} />
            </div>
            <span className={styles.thenLabel}>{t('nav.then')}</span>
            <span className={styles.thenText}>
              {t(`nav.verb.${verbKey(nextInstruction.sign)}`)}
              {streetFromInstruction(nextInstruction) && (
                <> {t('nav.onto')} <b>{streetFromInstruction(nextInstruction)}</b></>
              )}
            </span>
          </div>
        )}
      </div>

      {offRoute && (
        <div className={styles.offRoute}>
          <span>{t('nav.offRoute')}</span>
          <button className={styles.recalcBtn} onClick={onRecalculate}>{t('nav.recalculate')}</button>
        </div>
      )}

      {speedKmh !== null && (
        <div className={styles.speedBadge}>
          <span className={styles.speedNum}>{speedKmh}</span>
          <span className={styles.speedUnit}>{t('nav.unitKmh')}</span>
        </div>
      )}

      <div className={styles.bottomPanel}>
        <div className={styles.eta}>
          <span className={styles.etaTime}>{formatDuration(durationRemainingS)}</span>
          <span className={styles.etaSub}>
            {t('nav.remaining', { distance: formatTotalDistance(distanceRemainingM) })}
            {' · '}{t('nav.etaLabel')} {formatETA(durationRemainingS)}
          </span>
        </div>
        {voiceButton}
        <button className={styles.closeBtn} onClick={onStop} aria-label="Exit">✕</button>
      </div>
    </div>
  )
}
