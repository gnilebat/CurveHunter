import type { RouteResult, Waypoint } from '../types'

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c] as string))
}

// Produce a GPX 1.1 document containing the user-set waypoints and the full
// route geometry as a single <trk>/<trkseg>. Elevation (3rd ordinate) is
// included per trkpt when GraphHopper returned it.
export function routeToGpx(route: RouteResult, waypoints: Waypoint[], name: string): string {
  const time = new Date().toISOString()
  const wptXml = waypoints.map(w =>
    `  <wpt lat="${w.lat}" lon="${w.lng}"><name>${escapeXml(w.name)}</name></wpt>`
  ).join('\n')

  const coords = route.geometry.coordinates as number[][]
  const trkpts = coords.map(c => {
    const lng = c[0], lat = c[1], ele = c[2]
    return ele !== undefined
      ? `      <trkpt lat="${lat}" lon="${lng}"><ele>${ele}</ele></trkpt>`
      : `      <trkpt lat="${lat}" lon="${lng}"/>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Schräglage" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${time}</time>
  </metadata>
${wptXml}
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`
}

export function downloadGpx(filename: string, gpxText: string): void {
  const blob = new Blob([gpxText], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.gpx') ? filename : `${filename}.gpx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function defaultGpxFilename(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Schraeglage-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.gpx`
}
