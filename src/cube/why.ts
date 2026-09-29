/**
 * Why each algorithm is here, so nobody has to memorise it.
 *
 * An algorithm on its own is a spell to copy. What makes it teachable is that
 * each one has a fixed point: doing it again from a further-along state does the
 * same thing to whatever is left. That means the repeat count is something you
 * can see rather than something you were told, which is the difference between
 * memorising and understanding.
 */

export type Why = {
  /** one line: what this algorithm actually does */
  what: string
  /** how to tell, by looking, whether another round is needed */
  howToKnow: string
}

export const WHY: Record<string, Why> = {
  sune: {
    what: '윗면 코너 4개를 한꺼번에 뒤집으면서 엣지는 원래 자리에 세워 둡니다. 3번 돌리면 제자리로 돌아오므로 몇 번을 돌리든 결과는 같습니다.',
    howToKnow: '돌리고 나서 윗면을 보세요. 흰색이 아닌 코너가 아직 남아 있으면 한 번 더 돌리면 됩니다.',
  },
  antisune: {
    what: 'Sune의 반대 방향 버전입니다. 하는 일은 같고, 왼쪽 코너를 하나씩 제자리로 보냅니다. 3번 돌리면 제자리로 돌아옵니다.',
    howToKnow: 'Sune를 돌렸는데 옆면 색이 더 어긋났다면, 그건 반대쪽부터 맞춰야 한다는 뜻입니다. 돌리고 나서 윗면을 보고, 틀린 코너가 남았으면 한 번 더 돌리세요.',
  },
  niklas: {
    what: '엣지 4개를 한꺼번에 제자리로 돌려보냅니다. 그러면서 코너들을 옆으로 빼놓았다가 되돌려 놓기 때문에, 엣지는 맞고 코너는 그대로입니다.',
    howToKnow: '옆면 4줄을 보세요. 색이 제자리에 다 돌아오면 그만입니다. 코너가 맞춰질 필요는 없습니다 — 다음 단계가 그 일을 합니다.',
  },
  uaperm: {
    what: '코너 3개를 자리를 바꾼 채, 엣지 4개는 제자리에 그대로 둡니다. 2번 돌리면 제자리로 돌아옵니다.',
    howToKnow: '윗면을 보세요. 코너가 제자리로 돌아오면 끝이고, 남아 있으면 한 번 더 돌리면 됩니다.',
  },
}

export const SETUP_WHY: Why = {
  what: '큐브를 돌려서 다음 알고리즘이 먹히는 방향으로 맞추는 준비 동작입니다. 정답을 바꾸지 않고 자리만 잡아줍니다.',
  howToKnow: '별도로 셀 필요는 없습니다. 다음 알고리즘이 알아서 자리를 잡아 줍니다.',
}

/** The explanation for a step, whether it is an algorithm or just a setup turn. */
const ALIASES: Record<string, string> = { ua: 'uaperm', ub: 'uaperm' }

export function whyOf(baseLabel: string): Why {
  const key = baseLabel.toLowerCase().replace(/[^a-z]/g, '')
  return WHY[ALIASES[key] ?? key] ?? SETUP_WHY
}
