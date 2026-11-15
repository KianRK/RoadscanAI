import {
  classMix,
  formatShare,
  groupShare,
  HEAVY_VEHICLES,
  sparkline,
  VULNERABLE_ROAD_USERS,
} from '../traffic/figures.ts'

const WIDTH = 300
const HEIGHT = 64

interface TrendProps {
  /** Newly counted per bucket, oldest first; the last bucket is still filling. */
  trend: number[]
  bucketSeconds: number
  /** Buckets the chart has room for (the server's window). */
  capacity: number
}

/** New road users per time bucket. Only complete buckets are drawn. */
export function TrendChart({ trend, bucketSeconds, capacity }: TrendProps) {
  const complete = trend.slice(0, -1)
  const chart = sparkline(complete, capacity - 1, WIDTH, HEIGHT)
  const minutes = Math.round(((capacity - 1) * bucketSeconds) / 60)
  const latest = complete.at(-1)
  return (
    <div className="panel-block">
      <p className="eyebrow">
        Flow · new per {String(bucketSeconds)} s · last {String(minutes)} min
      </p>
      {chart && latest !== undefined ? (
        <figure className="trend">
          <svg
            viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`New road users per ${String(bucketSeconds)} seconds: latest ${String(latest)}, highest ${String(chart.max)}`}
          >
            <line x1="0" x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} className="gridline" />
            <path d={chart.area} className="area" />
            <path d={chart.line} className="line" />
          </svg>
          <figcaption>
            <span>
              latest <strong>{latest}</strong>
            </span>
            <span>
              peak <strong>{chart.max}</strong>
            </span>
          </figcaption>
        </figure>
      ) : (
        <p className="muted">Collecting data for the first intervals…</p>
      )}
    </div>
  )
}

interface MixProps {
  counted: Record<string, number>
  order: string[]
  display: (label: string) => string
}

/** Counted road users per class as one stacked bar, with two derived shares. */
export function ClassMix({ counted, order, display }: MixProps) {
  const parts = classMix(counted, order)
  const summary = parts
    .map((part) => `${display(part.label)} ${formatShare(part.share)}`)
    .join(', ')
  return (
    <div className="panel-block">
      <p className="eyebrow">Class mix · counted</p>
      {parts.length > 0 ? (
        <>
          <div className="mix" role="img" aria-label={`Class mix: ${summary}`}>
            {parts.map((part) => (
              <span
                key={part.label}
                data-label={part.label}
                style={{ width: `${(part.share * 100).toFixed(2)}%` }}
                title={`${display(part.label)}: ${formatShare(part.share)}`}
              />
            ))}
          </div>
          <dl className="shares">
            <div>
              <dt>Heavy vehicles</dt>
              <dd>{formatShare(groupShare(counted, HEAVY_VEHICLES))}</dd>
            </div>
            <div>
              <dt>Pedestrians and two-wheelers</dt>
              <dd>{formatShare(groupShare(counted, VULNERABLE_ROAD_USERS))}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="muted">Nothing counted yet.</p>
      )}
    </div>
  )
}
