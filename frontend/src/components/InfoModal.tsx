import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { useLocale } from '../i18n/LocaleProvider'
import styles from './InfoModal.module.css'

// Help / feature overview. Content is kept inline (not in the i18n catalogue)
// because it's long, formatted, and changes infrequently — putting it in a
// translation dict with 30+ keys would be more friction than it's worth.

interface Section { title: string; items: ReactNode[] }

const SECTIONS_DE: Section[] = [
  {
    title: 'Routenplanung',
    items: [
      <>Start und Ziel über die Suche wählen, auf die Karte klicken, oder den <b>📍-Knopf</b> für den aktuellen Standort.</>,
      <>Vier Voreinstellungen: <b>Schnellste Route</b>, <b>Kurven</b>, <b>Kurven Plus</b> (Standard), <b>Kurven Max</b>. Eigene Presets mit <b>+★</b> speichern.</>,
      <>Im Bereich <b>Routenoptionen</b> feinjustieren: Kurvigkeit, Autobahnen / Innerorts meiden, Mindestkurventempo.</>
    ]
  },
  {
    title: 'Zwischenziele & Reihenfolge',
    items: [
      <>Auf das <b>+</b> zwischen zwei Wegpunkten tippen, um ein Zwischenziel einzufügen.</>,
      <>Die <b>Routenlinie selbst antippen und ziehen</b> — am Drop-Punkt entsteht ein neues Zwischenziel.</>,
      <>Bei 3+ Stopps erscheint rechts der <b>⠿-Griff</b>: hoch/runter ziehen, um die Reihenfolge zu ändern.</>,
      <>Wegpunkt-Pins kann man direkt auf der Karte verschieben.</>
    ]
  },
  {
    title: 'Rundkurs',
    items: [
      <>Modus oben umschalten („<b>Rundkurs</b>"). Distanz wählen (10–300 km) und der Algorithmus generiert eine geschlossene Schleife zurück zum Start.</>,
      <>Mit dem <b>Würfel-Knopf</b> einen anderen zufälligen Rundkurs erzeugen.</>
    ]
  },
  {
    title: 'Karte',
    items: [
      <>Top-rechts: <b>Karte auf Route zentrieren</b> (sobald eine Route existiert).</>,
      <>In der Navigation: Plus/Minus zoomen, <b>Recentre</b> auf eigene Position, <b>Auto-Zoom</b> passt die Kamera dem Straßentyp an.</>,
      <>Letzter Kartenausschnitt wird gemerkt — beim nächsten Öffnen siehst du wieder dieselbe Stelle.</>
    ]
  },
  {
    title: 'Gespeichertes',
    items: [
      <>Über das <b>☰-Menü</b> oben rechts: Routen, Presets, Orte verwalten.</>,
      <>Oben im Menü: <b>Sprache</b> (DE/EN) und <b>Design</b> (hell/dunkel) umschalten.</>,
      <>Aktuell ausgewähltes Preset und alle Routenoptionen bleiben über Reloads erhalten.</>
    ]
  },
  {
    title: 'Navigation',
    items: [
      <>Mit <b>▶ Los</b> Navigation starten. Sprachausgabe, ETA, automatische Off-Route-Erkennung.</>,
      <>Bei mehreren Stopps läuft die Navigation <b>kontinuierlich durch</b> — kein Bestätigen pro Etappe nötig (anders als Google Maps). Beim Erreichen eines Zwischenziels nur eine kurze Sprachnotiz.</>,
      <>Der <b>Roboter-Knopf</b> neben dem Mute-Knopf öffnet die <b>Routenvorschau</b>: Position entlang der Route simulieren und Abbiegungen vorab durchspielen.</>
    ]
  },
  {
    title: 'Import, Export & Teilen',
    items: [
      <><b>GPX-Datei importieren</b> über das ⬆-Symbol oben rechts neben den Modus-Tabs.</>,
      <><b>GPX-Export</b> und <b>Teilen-Link</b> über die Knöpfe unter den Route-Statistiken.</>,
      <>Geteilte Links öffnen die Route direkt bei einem anderen Nutzer.</>
    ]
  },
  {
    title: 'Mobil',
    items: [
      <><b>Bottom-Sheet</b>: mit dem Griff oben hochziehen für mehr Inhalt, runter für mehr Karte.</>,
      <>Über <b>App installieren</b> / <b>Zum Startbildschirm hinzufügen</b> als PWA installieren — startet ohne Browser-Leiste.</>,
      <><b>Pinch-Zoom</b>: zwei Finger zum Rein-/Rauszoomen. Funktioniert auch direkt über der Routenlinie.</>
    ]
  }
]

const SECTIONS_EN: Section[] = [
  {
    title: 'Routing',
    items: [
      <>Pick start + end via the search, click the map to set points, or use the <b>📍 button</b> for your current location.</>,
      <>Four presets: <b>Fastest</b>, <b>Curvy</b>, <b>Curvy Plus</b> (default), <b>Curvy Max</b>. Save your own presets with <b>+★</b>.</>,
      <>Fine-tune in <b>Route options</b>: curviness, avoid motorways / urban, minimum corner speed.</>
    ]
  },
  {
    title: 'Via points & order',
    items: [
      <>Tap the <b>+</b> between two waypoints to insert a via.</>,
      <><b>Drag the route line itself</b> — a new via appears at the drop point.</>,
      <>With 3+ stops a <b>⠿ grip</b> appears on the right; drag up/down to reorder.</>,
      <>Waypoint pins can be dragged directly on the map.</>
    ]
  },
  {
    title: 'Round trip',
    items: [
      <>Switch the mode tab to <b>Loop</b>, pick a distance (10–300 km), and the algorithm builds a closed loop back to the start.</>,
      <>The <b>shuffle button</b> generates a different random loop.</>
    ]
  },
  {
    title: 'Map',
    items: [
      <>Top-right: <b>fit map to route</b> (visible once a route exists).</>,
      <>During navigation: zoom +/−, <b>recentre on me</b>, <b>auto-zoom</b> adapts the camera to the road type.</>,
      <>The last map view is remembered — reload and you're back where you were.</>
    ]
  },
  {
    title: 'Saved items',
    items: [
      <>The <b>☰ menu</b> at the top-right manages routes, presets, places.</>,
      <>At the top of that drawer: toggle <b>language</b> (DE/EN) and <b>theme</b> (light/dark).</>,
      <>The currently-selected preset and all route options persist across reloads.</>
    ]
  },
  {
    title: 'Navigation',
    items: [
      <>Tap <b>▶ Los</b> to start navigation. Voice cues, ETA, automatic off-route detection.</>,
      <>With multiple stops it <b>keeps navigating</b> — no per-leg confirmation tap, unlike Google Maps. Reaching a waypoint just plays a brief voice note.</>,
      <>The <b>robot button</b> next to mute opens the <b>route preview</b>: simulate your position along the route to rehearse the turns.</>
    ]
  },
  {
    title: 'Import, export & share',
    items: [
      <><b>Import a GPX file</b> via the ⬆ icon next to the mode tabs.</>,
      <><b>Export GPX</b> and <b>share link</b> are below the route stats (once a route exists).</>,
      <>Shared links open the same route directly for another user.</>
    ]
  },
  {
    title: 'Mobile',
    items: [
      <><b>Bottom sheet</b>: drag the handle up for more content, down for more map.</>,
      <>Use <b>Install app</b> / <b>Add to Home Screen</b> to install as a PWA — runs without the browser chrome.</>,
      <><b>Pinch-to-zoom</b>: two fingers, works even when both land on the route line.</>
    ]
  }
]

export function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale, t } = useLocale()
  const sections = locale === 'de' ? SECTIONS_DE : SECTIONS_EN
  return (
    <Modal open={open} onClose={onClose} title={t('info.title')} width={560}>
      <div className={styles.body}>
        {sections.map((s, i) => (
          <section key={i} className={styles.section}>
            <h3>{s.title}</h3>
            <ul>{s.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
