import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { searchPlaces } from '../api/client'
import { useT } from '../i18n/LocaleProvider'
import { useSavedPlaces } from '../hooks/useSavedPlaces'
import type { SearchResult } from '../types'
import styles from './SearchInput.module.css'

interface Props {
  placeholder: string
  value: string
  isSelected: boolean
  onChange: (result: SearchResult) => void
  onClear: () => void
}

interface Suggestion extends SearchResult {
  saved?: boolean
}

export function SearchInput({ placeholder, value, isSelected, onChange, onClear }: Props) {
  const t = useT()
  const { places } = useSavedPlaces()
  const [query, setQuery] = useState(value)
  const [apiResults, setApiResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  // Saved places matching the current query, marked so we can render a star.
  const savedMatches = useMemo<Suggestion[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    return places
      .filter(p => p.name.toLowerCase().includes(q))
      .map(p => ({
        lat: p.lat, lng: p.lng, name: p.name, displayName: p.name, saved: true
      }))
  }, [places, query])

  // De-duplicate API results that exactly match a saved place (same lat/lng).
  const results = useMemo<Suggestion[]>(() => {
    const seen = new Set(savedMatches.map(s => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`))
    const apiSugs: Suggestion[] = apiResults
      .filter(r => !seen.has(`${r.lat.toFixed(5)},${r.lng.toFixed(5)}`))
      .map(r => ({ ...r }))
    return [...savedMatches, ...apiSugs]
  }, [savedMatches, apiResults])

  const runSearch = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await searchPlaces(q)
      setApiResults(res)
      setOpen(true)
      setHighlighted(res.length > 0 ? 0 : -1)
    } catch {
      setApiResults([])
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
    if (q.length < 1) {
      setApiResults([]); setOpen(false); setLoading(false); return
    }
    // Show any saved-place matches immediately, even before the API responds.
    setOpen(true)
    if (q.length < 2) { setApiResults([]); setLoading(false); return }
    setLoading(true)
    debounce.current = setTimeout(() => runSearch(q), 300)
  }

  function select(r: Suggestion) {
    setQuery(r.name)
    setApiResults([])
    setOpen(false)
    setHighlighted(-1)
    onChange({ lat: r.lat, lng: r.lng, name: r.name, displayName: r.displayName })
    inputRef.current?.blur()
  }

  function handleClear() {
    setQuery('')
    setApiResults([])
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

  const showDropdown =
    open && (loading || results.length > 0 || (searched && query.length >= 2))

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

      {loading && <span className={styles.spinner} aria-label={t('search.searching')} />}

      {!loading && query.length > 0 && (
        <button
          type="button"
          className={styles.clearBtn}
          aria-label={t('search.clear')}
          onMouseDown={(e) => { e.preventDefault(); handleClear() }}
        >×</button>
      )}

      {showDropdown && (
        <ul ref={listRef} className={styles.dropdown}>
          {results.length === 0 && !loading && (
            <li className={styles.empty}>{t('search.noMatches', { query })}</li>
          )}
          {results.map((r, i) => (
            <li
              key={`${r.lat}-${r.lng}-${i}`}
              className={`${styles.item} ${i === highlighted ? styles.itemHi : ''} ${r.saved ? styles.itemSaved : ''}`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => { e.preventDefault(); select(r) }}
            >
              {r.saved && <span className={styles.itemBadge} aria-hidden>★</span>}
              <div className={styles.itemBody}>
                <span className={styles.itemName}>{r.name}</span>
                <span className={styles.itemDetail}>
                  {r.saved
                    ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`
                    : r.displayName.split(',').slice(1).join(',').trim()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
