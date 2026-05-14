import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/LocaleProvider'
import { LOCALES } from '../i18n/strings'
import { useTheme, THEMES, type Theme } from '../theme/ThemeProvider'
import { ConfirmDialog } from './ConfirmDialog'
import { PromptDialog } from './PromptDialog'
import type { SavedRoute } from '../hooks/useSavedRoutes'
import type { CustomPreset } from '../hooks/useCustomPresets'
import type { SavedPlace } from '../hooks/useSavedPlaces'
import styles from './SaveMenu.module.css'

type Tab = 'routes' | 'presets' | 'places'

interface Props {
  open: boolean
  onClose: () => void

  routes: SavedRoute[]
  presets: CustomPreset[]
  places: SavedPlace[]

  onApplyRoute: (r: SavedRoute) => void
  onApplyPreset: (p: CustomPreset) => void
  onApplyPlace: (p: SavedPlace) => void

  onRenameRoute: (id: string, name: string) => void
  onRenamePreset: (id: string, name: string) => void
  onRenamePlace: (id: string, name: string) => void

  onDeleteRoute: (id: string) => void
  onDeletePreset: (id: string) => void
  onDeletePlace: (id: string) => void
}

interface Pending {
  kind: 'rename' | 'delete'
  entity: 'route' | 'preset' | 'place'
  id: string
  name: string
}

export function SaveMenu({
  open, onClose,
  routes, presets, places,
  onApplyRoute, onApplyPreset, onApplyPlace,
  onRenameRoute, onRenamePreset, onRenamePlace,
  onDeleteRoute, onDeletePreset, onDeletePlace
}: Props) {
  const { t, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('routes')
  const [pending, setPending] = useState<Pending | null>(null)

  // Escape closes the drawer — but only when no rename/delete dialog is open
  // on top of it (those own Escape while they're up).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending, onClose])

  const handleConfirm = (newName?: string) => {
    if (!pending) return
    if (pending.kind === 'rename' && newName) {
      if (pending.entity === 'route') onRenameRoute(pending.id, newName)
      if (pending.entity === 'preset') onRenamePreset(pending.id, newName)
      if (pending.entity === 'place') onRenamePlace(pending.id, newName)
    }
    if (pending.kind === 'delete') {
      if (pending.entity === 'route') onDeleteRoute(pending.id)
      if (pending.entity === 'preset') onDeletePreset(pending.id)
      if (pending.entity === 'place') onDeletePlace(pending.id)
    }
    setPending(null)
  }

  if (!open) return null

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-label={t('save.menuTitle')}>
        <header className={styles.head}>
          <span className={styles.title}>{t('save.menuTitle')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('save.close')}>×</button>
        </header>

        <section className={styles.settings}>
          <div className={styles.settingsGroup}>
            <span className={styles.settingsLabel}>{t('panel.language')}</span>
            <div className={styles.toggle} role="group">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  className={`${styles.toggleBtn} ${locale === l ? styles.toggleBtnActive : ''}`}
                  onClick={() => setLocale(l)}
                  aria-pressed={locale === l}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingsGroup}>
            <span className={styles.settingsLabel}>{t('panel.theme')}</span>
            <div className={styles.toggle} role="group">
              {THEMES.map((th: Theme) => (
                <button
                  key={th}
                  className={`${styles.toggleBtn} ${theme === th ? styles.toggleBtnActive : ''}`}
                  onClick={() => setTheme(th)}
                  aria-pressed={theme === th}
                  aria-label={t(th === 'light' ? 'panel.themeLight' : 'panel.themeDark')}
                >
                  {th === 'light' ? '☀' : '☾'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className={styles.tabs} role="tablist">
          <button
            className={`${styles.tab} ${tab === 'routes' ? styles.tabActive : ''}`}
            onClick={() => setTab('routes')}
            role="tab"
            aria-selected={tab === 'routes'}
          >{t('save.tabRoutes')} ({routes.length})</button>
          <button
            className={`${styles.tab} ${tab === 'presets' ? styles.tabActive : ''}`}
            onClick={() => setTab('presets')}
            role="tab"
            aria-selected={tab === 'presets'}
          >{t('save.tabPresets')} ({presets.length})</button>
          <button
            className={`${styles.tab} ${tab === 'places' ? styles.tabActive : ''}`}
            onClick={() => setTab('places')}
            role="tab"
            aria-selected={tab === 'places'}
          >{t('save.tabPlaces')} ({places.length})</button>
        </div>

        <div className={styles.list}>
          {tab === 'routes' && (
            routes.length === 0
              ? <p className={styles.empty}>{t('save.emptyRoutes')}</p>
              : routes.map(r => (
                <Row
                  key={r.id}
                  name={r.name}
                  subtitle={t('save.routeSubtitle', { n: r.waypoints.length })}
                  onApply={() => { onApplyRoute(r); onClose() }}
                  onRename={() => setPending({ kind: 'rename', entity: 'route', id: r.id, name: r.name })}
                  onDelete={() => setPending({ kind: 'delete', entity: 'route', id: r.id, name: r.name })}
                  applyLabel={t('save.load')}
                  renameLabel={t('save.rename')}
                  deleteLabel={t('save.delete')}
                />
              ))
          )}

          {tab === 'presets' && (
            presets.length === 0
              ? <p className={styles.empty}>{t('save.emptyPresets')}</p>
              : presets.map(p => (
                <Row
                  key={p.id}
                  name={p.name}
                  subtitle={t('save.presetSubtitle', { c: Math.round(p.options.curviness * 100) })}
                  onApply={() => { onApplyPreset(p); onClose() }}
                  onRename={() => setPending({ kind: 'rename', entity: 'preset', id: p.id, name: p.name })}
                  onDelete={() => setPending({ kind: 'delete', entity: 'preset', id: p.id, name: p.name })}
                  applyLabel={t('save.apply')}
                  renameLabel={t('save.rename')}
                  deleteLabel={t('save.delete')}
                />
              ))
          )}

          {tab === 'places' && (
            places.length === 0
              ? <p className={styles.empty}>{t('save.emptyPlaces')}</p>
              : places.map(p => (
                <Row
                  key={p.id}
                  name={p.name}
                  subtitle={`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
                  onApply={() => { onApplyPlace(p); onClose() }}
                  onRename={() => setPending({ kind: 'rename', entity: 'place', id: p.id, name: p.name })}
                  onDelete={() => setPending({ kind: 'delete', entity: 'place', id: p.id, name: p.name })}
                  applyLabel={t('save.use')}
                  renameLabel={t('save.rename')}
                  deleteLabel={t('save.delete')}
                />
              ))
          )}
        </div>
      </aside>

      <PromptDialog
        open={pending?.kind === 'rename'}
        title={t('save.renameTitle')}
        label={t('save.nameLabel')}
        initialValue={pending?.name ?? ''}
        onCancel={() => setPending(null)}
        onConfirm={(name) => handleConfirm(name)}
      />

      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={t('save.deleteTitle')}
        message={t('save.deleteConfirm', { name: pending?.name ?? '' })}
        destructive
        confirmLabel={t('save.delete')}
        onCancel={() => setPending(null)}
        onConfirm={() => handleConfirm()}
      />
    </>
  )
}

interface RowProps {
  name: string
  subtitle: string
  onApply: () => void
  onRename: () => void
  onDelete: () => void
  applyLabel: string
  renameLabel: string
  deleteLabel: string
}

function Row({ name, subtitle, onApply, onRename, onDelete, applyLabel, renameLabel, deleteLabel }: RowProps) {
  return (
    <div className={styles.row}>
      <button className={styles.rowMain} onClick={onApply} title={applyLabel}>
        <span className={styles.rowName}>{name}</span>
        <span className={styles.rowSub}>{subtitle}</span>
      </button>
      <button className={styles.rowAction} onClick={onRename} title={renameLabel} aria-label={renameLabel}>✎</button>
      <button className={`${styles.rowAction} ${styles.rowDanger}`} onClick={onDelete} title={deleteLabel} aria-label={deleteLabel}>🗑</button>
    </div>
  )
}
