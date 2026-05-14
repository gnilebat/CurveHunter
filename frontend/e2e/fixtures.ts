// Deterministic API fixtures so E2E tests + screenshots don't depend on a live
// GraphHopper / Photon backend. Shapes mirror backend/app/routers/*.py exactly.

// /api/search?q=... → list[SearchResult]  (camelCase, see routers/search.py)
export const SEARCH_RESULTS = [
  { lat: 48.1372, lng: 11.5756, name: 'München', displayName: 'München, Bayern, Deutschland' },
  { lat: 48.1500, lng: 11.5800, name: 'München Hbf', displayName: 'München Hauptbahnhof, München, Bayern' },
  { lat: 48.1100, lng: 11.6000, name: 'München Süd', displayName: 'München Süd, Bayern, Deutschland' }
]

export const SEARCH_RESULTS_END = [
  { lat: 47.8095, lng: 11.0089, name: 'Bad Tölz', displayName: 'Bad Tölz, Bayern, Deutschland' },
  { lat: 47.5800, lng: 11.3500, name: 'Lenggries', displayName: 'Lenggries, Bayern, Deutschland' }
]

// A small but structurally complete route: LineString with elevation as the
// 3rd ordinate (so the ElevationChart renders), two segments, a few turn
// instructions, and one alternative.
const COORDS: [number, number, number][] = [
  [11.5756, 48.1372, 520],
  [11.5400, 48.1100, 545],
  [11.4900, 48.0700, 600],
  [11.3800, 48.0100, 680],
  [11.2400, 47.9300, 720],
  [11.1000, 47.8700, 690],
  [11.0089, 47.8095, 658]
]

function altRoute(coords: [number, number, number][], curviness: number) {
  return {
    geometry: { type: 'LineString' as const, coordinates: coords },
    distance_m: 48200,
    duration_s: 3540,
    ascent_m: 410,
    descent_m: 270,
    motorway_m: 0,
    trunk_m: 1200,
    curvature_score: curviness,
    segments: [
      {
        coordinates: coords.slice(0, 4),
        score: 180,
        length_km: 22.1,
        is_urban: true,
        is_highway: false,
        is_below_speed: false
      },
      {
        coordinates: coords.slice(3),
        score: 540,
        length_km: 26.1,
        is_urban: false,
        is_highway: false,
        is_below_speed: false
      }
    ],
    instructions: [
      { text: 'Auf Lindwurmstraße fahren', distance_m: 1200, duration_s: 130, sign: 0, street_name: 'Lindwurmstraße', interval: [0, 1] as [number, number] },
      { text: 'Rechts abbiegen auf B11', distance_m: 18400, duration_s: 1400, sign: 2, street_name: 'B11', interval: [1, 3] as [number, number] },
      { text: 'Links abbiegen auf Isartalstraße', distance_m: 21600, duration_s: 1600, sign: -2, street_name: 'Isartalstraße', interval: [3, 6] as [number, number] },
      { text: 'Ziel erreicht', distance_m: 0, duration_s: 0, sign: 4, street_name: null, interval: [6, 6] as [number, number] }
    ],
    ignored_urban: true,
    max_speed_per_vertex: coords.map(() => 80)
  }
}

export const ROUTE_RESPONSE = {
  ...altRoute(COORDS, 612),
  alternatives: [
    altRoute(
      [
        [11.5756, 48.1372, 520],
        [11.5200, 48.0900, 530],
        [11.4200, 48.0200, 610],
        [11.2800, 47.9000, 700],
        [11.0089, 47.8095, 658]
      ],
      430
    )
  ]
}
