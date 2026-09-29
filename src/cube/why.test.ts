import { describe, it, expect } from 'vitest'
import { whyOf } from './why'
import { ALG_NAMES } from './solver'

describe('why each algorithm is here', () => {
  it('explains every algorithm the solver is allowed to emit', () => {
    const labels: Record<string, string> = {
      sune: 'Sune',
      antiSune: 'Anti-Sune',
      niklas: 'Niklas',
      uaPerm: 'Ua',
    }
    for (const name of ALG_NAMES) {
      const why = whyOf(labels[name])
      expect(why, `${name} needs a reason`).not.toBe(SETUP_FALLBACK())
      expect(why.what.length, `${name} explanation is too short`).toBeGreaterThan(30)
      expect(why.howToKnow.length, `${name} needs a way to tell when to stop`).toBeGreaterThan(20)
    }
  })

  it('falls back to a setup explanation for plain turns', () => {
    expect(whyOf('U').what).toMatch(/준비/)
    expect(whyOf("U'").what).toMatch(/준비/)
  })

  it('never silently returns nothing for an unknown label', () => {
    expect(whyOf('something else').what.length).toBeGreaterThan(10)
  })

  it('tells the reader to judge repeats by looking, not by counting', () => {
    for (const name of ALG_NAMES) {
      expect(whyOf(name).howToKnow).toMatch(/보|확인|남/)
    }
  })
})

function SETUP_FALLBACK() {
  return whyOf('ZZZ')
}
