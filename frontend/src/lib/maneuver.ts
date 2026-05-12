// GraphHopper instruction sign → translation key under nav.verb.
// See https://docs.graphhopper.com/#operation/getRoute for the full enum.
export function verbKey(sign: number): string {
  const abs = Math.abs(sign === 98 ? 8 : sign)
  switch (abs) {
    case 0: return 'continue'
    case 1: return sign > 0 ? 'slightRight' : 'slightLeft'
    case 2: return sign > 0 ? 'turnRight' : 'turnLeft'
    case 3: return sign > 0 ? 'sharpRight' : 'sharpLeft'
    case 4: return 'arrive'
    case 5: return 'arrive'
    case 6: return 'roundabout'
    case 7: return sign > 0 ? 'keepRight' : 'keepLeft'
    case 8: return 'uTurn'
    default: return 'continue'
  }
}
