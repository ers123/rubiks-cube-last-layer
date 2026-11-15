/** Short explanations of the move and which stickers to check after it. */
export type Why = {
  /** one line: what this algorithm actually does */
  what: string
  /** what to check by looking at the cube */
  howToKnow: string
}

export const WHY: Record<string, Why> = {
  윗면십자: {
    what: '윗면 엣지의 방향을 바꾸는 공식입니다.',
    howToKnow: '윗면의 가운데 색이 위를 향하는 엣지를 확인하세요.',
  },
  tperm: {
    what: '윗면의 코너 두 개와 엣지 두 개를 서로 바꾸는 공식입니다.',
    howToKnow: '공식 전후에 위치가 바뀐 조각을 옆면에서 확인하세요.',
  },
  sune: {
    what: '윗면 코너의 방향을 바꾸는 공식입니다.',
    howToKnow: '윗면 중심색과 다른 코너가 어느 위치에 남았는지 확인하세요.',
  },
  antisune: {
    what: 'Sune와 반대 방향으로 윗면 코너를 돌리는 공식입니다.',
    howToKnow: '윗면 중심색이 위를 향하는 코너를 확인하세요.',
  },
  niklas: {
    what: '윗면 코너 세 개의 자리를 순환시키는 공식입니다.',
    howToKnow: '코너의 옆 스티커가 양쪽 옆면의 중심색과 맞는지 확인하세요.',
  },
  uaperm: {
    what: '윗면 엣지 세 개의 자리를 순환시키는 공식입니다.',
    howToKnow: '옆면 맨 윗줄의 가운데 스티커가 각 면의 중심색과 맞는지 확인하세요.',
  },
}

export const SETUP_WHY: Why = {
  what: '윗층을 돌려 조각을 정렬하는 준비 동작입니다.',
  howToKnow: '윗면을 위에서 보며 U는 시계 방향, U′는 반시계 방향, U2는 반 바퀴 돌리세요.',
}

/** The explanation for a step, whether it is an algorithm or just a setup turn. */
const ALIASES: Record<string, string> = { ua: 'uaperm', ub: 'uaperm' }

export function whyOf(baseLabel: string): Why {
  const key = baseLabel.toLowerCase().replace(/[^a-z가-힣]/g, '')
  return WHY[ALIASES[key] ?? key] ?? SETUP_WHY
}
