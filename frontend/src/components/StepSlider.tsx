import styles from './Slider.module.css'

interface Props {
  label: string
  hint?: string
  value: number
  steps: number[]
  formatValue: (v: number) => string
  onChange: (v: number) => void
}

export function StepSlider({ label, hint, value, steps, formatValue, onChange }: Props) {
  const idx = Math.max(0, steps.indexOf(value))
  const pct = Math.round((idx / (steps.length - 1)) * 100)
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{formatValue(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(steps[Number(e.target.value)])}
        className={styles.range}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
