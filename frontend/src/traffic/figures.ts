/** Derived figures for the traffic dashboard, computed from a stream's statistics. */

/** Buses and trucks: "heavy vehicles" in the usual traffic-count sense. */
export const HEAVY_VEHICLES = ['bus', 'truck']
/** Road users without a vehicle body around them. */
export const VULNERABLE_ROAD_USERS = ['person', 'bicycle', 'motorcycle']

export function total(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0)
}

export interface MixPart {
  label: string
  count: number
  /** 0..1 of everything counted. */
  share: number
}

/** Counted road users per class as shares, in `order` first; classes with none are left out. */
export function classMix(counted: Record<string, number>, order: string[]): MixPart[] {
  const all = total(counted)
  if (all === 0) return []
  const labels = [...new Set([...order, ...Object.keys(counted)])]
  return labels
    .filter((label) => (counted[label] ?? 0) > 0)
    .map((label) => ({ label, count: counted[label], share: counted[label] / all }))
}

/** Share of `labels` among everything counted; null while nothing has been counted. */
export function groupShare(counted: Record<string, number>, labels: string[]): number | null {
  const all = total(counted)
  if (all === 0) return null
  return labels.reduce((sum, label) => sum + (counted[label] ?? 0), 0) / all
}

export function formatShare(share: number | null): string {
  return share === null ? '–' : `${String(Math.round(share * 100))} %`
}

export interface Sparkline {
  /** SVG path of the line, in a `width` x `height` box. */
  line: string
  /** The same line closed along the bottom edge, for a filled area. */
  area: string
  max: number
}

/**
 * Geometry of a trend line. `capacity` is the number of buckets the chart has room for:
 * the newest value sits at the right edge and the line grows to the left over time.
 * Null with fewer than two values (no line to draw).
 */
export function sparkline(
  values: number[],
  capacity: number,
  width: number,
  height: number,
): Sparkline | null {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const step = width / Math.max(1, capacity - 1)
  const offset = capacity - values.length
  const points = values.map((value, index) => {
    const x = (offset + index) * step
    // Leave a little room at the top so the highest point is not cut by the edge.
    const y = height - (value / max) * height * 0.9
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = `M${points.join('L')}`
  const first = (offset * step).toFixed(1)
  return { line, area: `${line}L${width.toFixed(1)},${String(height)}L${first},${String(height)}Z`, max }
}
