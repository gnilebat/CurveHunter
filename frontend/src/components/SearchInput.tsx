import { useState, useRef, useEffect, useCallback } from 'react'
import { searchPlaces } from '../api/client'
import type { SearchResult } from '../types'
import styles from './SearchInput.module.css'

interface Props {
  placeholder: string
  value: string
  isSelected: boolean
  onChange: (result: SearchResult) => void
  onClear: () => void
}

export function SearchInput({ placeholder, value, isSelected, onChange, onClear }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  const runSearch = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await searchPlaces(q)
      setResults(res)
      setOpen(true)
      setHighlighted(res.length > 0 ? 0 : -1)
    } catch {
      setResults([])
      setOpen(true)
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }, [])

  function handleInput(q: string) {
    setQuery(q)
    setSearched(false)
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 2) { setResults([]); setOpen(false); setLoading(false); return }
    setLoading(true)
    debounce.current = setTimeout(() => runSearch(q), 300)
  }

  function select(r: SearchResult) {
    setQuery(r.name)
    setResults([])
    setOpen(false)
    setHighlighted(-1)
    onChange(r)
    inputRef.current?.blur()
  }

  function handleClear() {
    setQuery('')
    setResults([])
    setOpen(false)
    setSearched(false)
    onClear()
    inputRef.current?.focus()
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length > 0) {
        setOpen(true)
        setHighlighted((h) => (h + 1) % results.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length > 0) {
        setHighlighted((h) => (h <= 0 ? results.length - 1 : h - 1))
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted >= 0 && results[highlighted]) {
        select(results[highlighted])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  // Keep highlighted item in view
  useEffect(() => {
    if (!listRef.current || highlighted < 0) return
    const el = listRef.current.children[highlighted] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  const showDropdown = open && (loading || results.length > 0 || (searched && query.length >= 2))

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        className={`${styles.input} ${isSelected ? styles.inputSelected : ''}`}
        value={query}
        placeholder={placeholder}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        onKeyDown={handleKey}
        autoComplete="off"
        spellCheck={false}
      />

      {loading && <span className={styles.spinner} aria-label="Searching" />}

      {!loading && query.length > 0 && (
        <button
          type="button"
          className={styles.clearBtn}
          aria-label="Clear"
          onMouseDown={(e) => { e.preventDefault(); handleClear() }}
        >×</button>
      )}

      {showDropdown && (
        <ul ref={listRef} className={styles.dropdown}>
          {results.length === 0 && !loading && (
            <li className={styles.empty}>No matches for "{query}"</li>
          )}
          {results.map((r, i) => (
            <li
              key={`${r.lat}-${r.lng}-${i}`}
              className={`${styles.item} ${i === highlighted ? styles.itemHi : ''}`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => { e.preventDefault(); select(r) }}
            >
              <span className={styles.itemName}>{r.name}</span>
              <span className={styles.itemDetail}>{r.displayName.split(',').slice(1).join(',').trim()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
