/**
 * UI string catalogue. German is the source of truth — every key in `de`
 * must also exist in `en`. New languages: add a new top-level entry with
 * the same shape as `de`.
 *
 * Strings may include `{name}` placeholders, replaced at render time via
 * the second arg to `t(key, { name: 'foo' })`.
 */
export const strings = {
  de: {
    panel: {
      brand: 'CurveHunter',
      placeholderStart: 'Startpunkt',
      placeholderEnd: 'Zielort',
      useMyLocation: 'Aktueller Standort',
      swap: 'Start und Ziel tauschen',
      findRoute: 'Route berechnen',
      recalculate: 'Route neu berechnen',
      calculating: 'Berechne…',
      hint: 'Wähle Start und Ziel — oder klicke auf die Karte, um Punkte zu setzen.',
      distance: 'Strecke',
      duration: 'Dauer',
      ascent: 'Höhenmeter',
      curviness: 'Kurvigkeit',
      clearAll: 'Alles löschen',
      startNavigation: '▶ Navigation starten',
      retry: 'Erneut versuchen',
      legendStraight: 'gerade',
      legendTwisty: 'kurvig',
      legendHighwayTitle: 'Autobahn / Kraftfahrstraße',
      legendHighwayLow: 'gerade',
      legendHighwayHigh: 'kurvig',
      curvyStraight: 'gerade',
      curvyWinding: 'wellig',
      curvyCurvy: 'kurvig',
      curvyTwisty: 'sehr kurvig!',
      language: 'Sprache'
    },
    options: {
      title: 'Routenoptionen',
      curviness: 'Kurvigkeit',
      curvinessHint: 'Höhere Werte bevorzugen kurvigere, kleinere Straßen.',
      avoidMotorways: 'Autobahnen vermeiden',
      avoidTrunks: 'Kraftfahrstraßen vermeiden',
      avoidUrban: 'Innerorts vermeiden',
      avoidUrbanHint: 'Bevorzugt Landstraßen vor Wohngebieten und Tempo-50-Strecken.',
      ignoreUrbanCurves: 'Kurven Innerorts ignorieren',
      ignoreUrbanCurvesHint: 'Rechnet Kurven in Wohngebieten nicht in den Kurvigkeits-Score ein.',
      resetDefaults: 'Standardwerte'
    },
    search: {
      searching: 'Suche',
      clear: 'Löschen',
      noMatches: 'Keine Treffer für „{query}"'
    },
    nav: {
      arrived: 'Ziel erreicht',
      endOfRoute: 'Routenende',
      destinationReached: 'Du bist angekommen',
      now: 'Jetzt',
      locating: 'Position wird ermittelt…',
      then: 'DANACH',
      offRoute: 'Du bist nicht auf der Route',
      recalculate: 'Neu berechnen',
      etaLabel: 'Ankunft',
      remaining: '{distance} verbleibend',
      lessThanMin: 'unter 1 Min',
      hourShort: 'Std',
      minShort: 'Min',
      onto: 'auf',
      verb: {
        continue: 'Weiter geradeaus',
        slightRight: 'Leicht rechts',
        slightLeft: 'Leicht links',
        turnRight: 'Rechts abbiegen',
        turnLeft: 'Links abbiegen',
        sharpRight: 'Scharf rechts',
        sharpLeft: 'Scharf links',
        arrive: 'Ziel erreicht',
        roundabout: 'In den Kreisverkehr fahren',
        keepRight: 'Rechts halten',
        keepLeft: 'Links halten',
        uTurn: 'Wenden'
      },
      unitKmh: 'km/h'
    }
  },

  en: {
    panel: {
      brand: 'CurveHunter',
      placeholderStart: 'Start point',
      placeholderEnd: 'Destination',
      useMyLocation: 'Use my location',
      swap: 'Swap start and destination',
      findRoute: 'Find route',
      recalculate: 'Recalculate route',
      calculating: 'Calculating…',
      hint: 'Pick a start and destination — or click anywhere on the map to drop a pin.',
      distance: 'Distance',
      duration: 'Duration',
      ascent: 'Ascent',
      curviness: 'Curviness',
      clearAll: 'Clear all',
      startNavigation: '▶ Start navigation',
      retry: 'Retry',
      legendStraight: 'straight',
      legendTwisty: 'twisty',
      legendHighwayTitle: 'Motorway / express road',
      legendHighwayLow: 'straight',
      legendHighwayHigh: 'twisty',
      curvyStraight: 'straight',
      curvyWinding: 'winding',
      curvyCurvy: 'curvy',
      curvyTwisty: 'twisty!',
      language: 'Language'
    },
    options: {
      title: 'Route options',
      curviness: 'Curviness',
      curvinessHint: 'Higher values prefer twistier, smaller roads.',
      avoidMotorways: 'Avoid motorways',
      avoidTrunks: 'Avoid express roads',
      avoidUrban: 'Avoid urban roads',
      avoidUrbanHint: 'Prefers rural roads over residential streets and 50 km/h zones.',
      ignoreUrbanCurves: 'Ignore urban curves',
      ignoreUrbanCurvesHint: "Doesn't count curves inside built-up areas toward the curviness score.",
      resetDefaults: 'Reset to defaults'
    },
    search: {
      searching: 'Searching',
      clear: 'Clear',
      noMatches: 'No matches for "{query}"'
    },
    nav: {
      arrived: "You've arrived",
      endOfRoute: 'End of route',
      destinationReached: 'Destination reached',
      now: 'Now',
      locating: 'Locating…',
      then: 'THEN',
      offRoute: "You're off the route",
      recalculate: 'Recalculate',
      etaLabel: 'ETA',
      remaining: '{distance} remaining',
      lessThanMin: '< 1 min',
      hourShort: 'h',
      minShort: 'min',
      onto: 'onto',
      verb: {
        continue: 'Continue',
        slightRight: 'Slight right',
        slightLeft: 'Slight left',
        turnRight: 'Turn right',
        turnLeft: 'Turn left',
        sharpRight: 'Sharp right',
        sharpLeft: 'Sharp left',
        arrive: 'Arrive',
        roundabout: 'Take roundabout',
        keepRight: 'Keep right',
        keepLeft: 'Keep left',
        uTurn: 'Make a U-turn'
      },
      unitKmh: 'km/h'
    }
  }
} as const

export type Locale = keyof typeof strings
export const LOCALES: Locale[] = ['de', 'en']
