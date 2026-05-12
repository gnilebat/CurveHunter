interface Props {
  sign: number
  size?: number
}

// GraphHopper turn signs:
//   -98 / -8 = u-turn, -7 = keep left, -3 = sharp left, -2 = left,
//   -1 = slight left, 0 = continue, 1 = slight right, 2 = right,
//   3 = sharp right, 4 = finish, 5 = via, 6 = roundabout, 7 = keep right,
//   8 = u-turn right
export function ManeuverIcon({ sign, size = 44 }: Props) {
  const abs = Math.abs(sign)
  const isLeft = sign < 0
  const mirror = (isLeft && [1, 2, 3, 7].includes(abs)) ? 'scaleX(-1)' : undefined

  let body: React.ReactNode
  switch (abs === 98 ? 8 : abs) {
    case 0:  // continue
      body = (<>
        <path d="M24 42 V10" />
        <path d="M14 20 L24 8 L34 20" />
      </>)
      break
    case 1:  // slight right
      body = (<>
        <path d="M20 42 V28 C20 18 28 12 36 12" />
        <path d="M30 6 L36 12 L34 20" />
      </>)
      break
    case 2:  // right
      body = (<>
        <path d="M14 42 V18 H38" />
        <path d="M32 12 L38 18 L32 24" />
      </>)
      break
    case 3:  // sharp right
      body = (<>
        <path d="M14 42 V20 C14 12 20 10 24 14 L34 26" />
        <path d="M28 30 L34 26 L34 20" />
      </>)
      break
    case 7:  // keep right (fork)
      body = (<>
        <path d="M24 42 V28" />
        <path d="M24 28 L34 14" />
        <path d="M24 28 L18 18" opacity="0.35" />
        <path d="M28 10 L34 14 L34 20" />
      </>)
      break
    case 4:  // finish — pin
      body = (<>
        <path d="M24 8 C16 8 10 14 10 22 C10 32 24 42 24 42 C24 42 38 32 38 22 C38 14 32 8 24 8 Z" />
        <circle cx="24" cy="22" r="4" />
      </>)
      break
    case 6:  // roundabout
      body = (<>
        <circle cx="24" cy="24" r="10" />
        <path d="M24 42 V36" />
        <path d="M30 18 L34 24 L24 14" opacity="0" />
        <path d="M34 14 L34 22 L26 22" />
      </>)
      break
    case 8:  // u-turn
      body = (<>
        <path d="M16 42 V24 C16 14 24 10 30 14 C36 18 36 26 30 28 L20 28" />
        <path d="M24 22 L20 28 L24 34" />
      </>)
      break
    default:
      body = (<>
        <path d="M24 42 V10" />
        <path d="M14 20 L24 8 L34 20" />
      </>)
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      stroke="currentColor"
      strokeWidth="4.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: mirror, transformOrigin: 'center' }}
    >
      {body}
    </svg>
  )
}
