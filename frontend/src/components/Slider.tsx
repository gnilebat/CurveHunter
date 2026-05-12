import styles from './Slider.module.css'

interface Props {
  label: string
  hint?: string
  value: number       // 0..1
  onChange: (v: number) => void
  step?: number       // 0..1 fraction
}

export function Slider({ label, hint, value, onChange, step = 0.05 }: Props) {
  const pct = Math.round(value * 100)
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
