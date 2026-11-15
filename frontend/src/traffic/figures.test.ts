import { expect, test } from 'vitest'
import {
  classMix,
  formatShare,
  groupShare,
  HEAVY_VEHICLES,
  sparkline,
  total,
  VULNERABLE_ROAD_USERS,
} from './figures.ts'

const counted = { car: 12, bus: 3, person: 4, truck: 1 }

test('the class mix lists counted classes in the given order, then the rest', () => {
  expect(classMix(counted, ['person', 'bicycle', 'car', 'bus'])).toEqual([
    { label: 'person', count: 4, share: 0.2 },
    { label: 'car', count: 12, share: 0.6 },
    { label: 'bus', count: 3, share: 0.15 },
    { label: 'truck', count: 1, share: 0.05 },
  ])
  expect(classMix({}, ['car'])).toEqual([])
})

test('group shares of heavy vehicles and vulnerable road users', () => {
  expect(total(counted)).toBe(20)
  expect(groupShare(counted, HEAVY_VEHICLES)).toBeCloseTo(0.2)
  expect(groupShare(counted, VULNERABLE_ROAD_USERS)).toBeCloseTo(0.2)
  expect(groupShare({}, HEAVY_VEHICLES)).toBeNull()
  expect(formatShare(0.204)).toBe('20 %')
  expect(formatShare(null)).toBe('–')
})

test('the trend line ends at the right edge and scales to its maximum', () => {
  const chart = sparkline([0, 5, 10], 5, 100, 50)
  expect(chart?.max).toBe(10)
  // Five slots 25 apart; three values fill the last three; 10 reaches 90 % of the height.
  expect(chart?.line).toBe('M50.0,50.0L75.0,27.5L100.0,5.0')
  expect(chart?.area).toBe('M50.0,50.0L75.0,27.5L100.0,5.0L100.0,50L50.0,50Z')
})

test('no trend line before there are two values; zeros stay on the baseline', () => {
  expect(sparkline([4], 40, 100, 50)).toBeNull()
  expect(sparkline([0, 0], 2, 100, 50)?.line).toBe('M0.0,50.0L100.0,50.0')
})
