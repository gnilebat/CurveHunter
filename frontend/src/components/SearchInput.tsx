import { useState, useRef, useEffect } from 'react'
import { searchPlaces } from '../api/client'
import type { SearchResult } from '../types'
import styles from './SearchInput.module.css'

interface Props {
  placeholder: string
  value: string
  onChange: (result: SearchResult) => void
}

export function SearchInput({ placeholder, value, onChange }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setQuery(value) }, [value])

  function handleInput(q: string) {
    setQuery(q)
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 2) { setResults([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      try {
        const res = await searchPlaces(q)
        setResults(res)
        setOpen(res.length > 0)
      } catch {
        setResults([])
      }
    }, 300)
  }

  function select(r: SearchResult) {
    setQuery(r.name)
    setResults([])
    setOpen(false)
    onChange(r)
  }

  return (
    <div className={styles.wrap}>
      <input
        className={styles.input}
        value={query}
        placeholder={placeholder}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <ul className={styles.dropdown}>
          {results.map((r) => (
            <li key={r.displayName} className={styles.item} onMouseDown={() => select(r)}>
              {r.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
