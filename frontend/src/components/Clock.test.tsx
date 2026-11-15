import { expect, test } from 'vitest'
import { formatUtc } from './Clock.tsx'

test('shows the time of day in UTC', () => {
  expect(formatUtc(new Date('2026-11-15T07:05:09.900+01:00'))).toBe('06:05:09 UTC')
})
