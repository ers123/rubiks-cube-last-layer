const reviewKey = 'rubiks-quiz-review-v1'
type Reviews = Partial<Record<string, string>>

function localDay(offset = 0): string {
  const now = new Date()
  now.setDate(now.getDate() + offset)
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0')).join('-')
}

function readReviews(): Reviews {
  try {
    const value = JSON.parse(localStorage.getItem(reviewKey) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function dueQuestions(): string[] {
  const today = localDay()
  return Object.entries(readReviews()).flatMap(([key, date]) => typeof date === 'string' && date <= today ? [key] : [])
}

export function recordAnswer(key: string, correct: boolean): string {
  const reviews = readReviews()
  const due = reviews[key]
  if (correct && (!due || due > localDay())) return ''
  if (correct) delete reviews[key]
  else reviews[key] = localDay(1)
  try {
    localStorage.setItem(reviewKey, JSON.stringify(reviews))
    return correct ? '' : '내일 복습에 추가했어요.'
  } catch {
    return '이 브라우저에 복습 기록을 저장할 수 없어요.'
  }
}
