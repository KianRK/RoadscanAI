import { useEffect, useRef, useState } from 'react'
import type { Congestion, StreamEvent, StreamInfo } from '../api/types.ts'
import { total } from '../traffic/figures.ts'
import { drift, livePosition, type Timeline } from '../traffic/timeline.ts'
import { ClassMix, TrendChart } from './TrafficCharts.tsx'

interface Props {
  stream: StreamInfo
  /** performance.now() when the stream list arrived: the reference for the clock. */
  receivedAt: number
  delaySeconds: number
  timeline: Timeline
  classes: string[]
  /** Position on the page, for the camera label (CAM 01, CAM 02, ...). */
  index: number
}

/** The video is moved back onto the server's clock when it is further off than this. */
const MAX_DRIFT_SECONDS = 0.5
const TICK_MS = 100

const LABELS: Record<string, string> = { train: 'tram / train' }

function display(label: string): string {
  return LABELS[label] ?? label
}

/** Room in the trend chart: the server's default window (40 buckets of 15 s). */
const TREND_CAPACITY = 40

const CONGESTION: Record<Congestion, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
}

function oneDecimal(value: number): string {
  return value.toFixed(1)
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`
}

/**
 * One "camera": the video, kept on the server's clock, with the boxes of the analysis
 * result that belongs to the frame on screen, and that result's statistics beside it.
 */
export function StreamPanel({
  stream,
  receivedAt,
  delaySeconds,
  timeline,
  classes,
  index,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [current, setCurrent] = useState<StreamEvent | null>(null)
  const [stats, setStats] = useState<StreamEvent['stats'] | null>(null)

  useEffect(() => {
    const tick = () => {
      const expected = livePosition(stream, receivedAt, performance.now(), delaySeconds)
      const video = videoRef.current
      let shown = expected
      if (video && video.readyState >= 1) {
        if (Math.abs(drift(expected, video.currentTime, stream.duration)) > MAX_DRIFT_SECONDS) {
          video.currentTime = expected
        }
        if (video.paused) void video.play().catch(() => undefined)
        shown = video.currentTime
      }
      const event = timeline.at(shown)
      setCurrent((previous) => (previous?.seq === event?.seq ? previous : event))
      // The numbers stay on screen when a result is missing for a moment.
      if (event) setStats((previous) => (previous === event.stats ? previous : event.stats))
    }
    tick()
    const timer = window.setInterval(tick, TICK_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [stream, receivedAt, delaySeconds, timeline])

  const known = [...new Set([...classes, ...Object.keys(stats?.counted ?? {})])]
  const camera = `CAM ${String(index + 1).padStart(2, '0')}`
  const averages = stats?.average_per_minute ?? {}
  const hasAverages = Object.keys(averages).length > 0

  return (
    <section className="card stream-panel" aria-label={stream.title}>
      <header className="stream-head">
        <div>
          <p className="eyebrow">{camera}</p>
          <h2>{stream.title}</h2>
          <p className="muted">{stream.location}</p>
        </div>
        {stats?.congestion ? (
          <span className={`congestion ${stats.congestion}`}>
            Congestion: {CONGESTION[stats.congestion]}
          </span>
        ) : null}
      </header>
      <div className="stream">
        <div>
          <div className="stream-view" style={{ aspectRatio: String(stream.aspect_ratio) }}>
            {stream.video_url ? (
              <video ref={videoRef} src={stream.video_url} muted loop playsInline preload="auto" />
            ) : (
              <p className="placeholder muted">No video in this build (dummy models)</p>
            )}
            <span className="live">Live analysis</span>
            <span className="camera-id" aria-hidden="true">
              {camera}
            </span>
            {current?.objects.map((object) => {
              const [xMin, yMin, xMax, yMax] = object.box
              return (
                <div
                  key={object.id}
                  className="tbox"
                  data-label={object.label}
                  data-testid="traffic-box"
                  style={{
                    left: percent(xMin),
                    top: percent(yMin),
                    width: percent(xMax - xMin),
                    height: percent(yMax - yMin),
                  }}
                >
                  <span className={`tag${yMin < 0.08 ? ' inside' : ''}`}>
                    {display(object.label)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="muted credit">
            {stream.source_url ? (
              <>
                Video:{' '}
                <a href={stream.source_url} target="_blank" rel="noreferrer">
                  {stream.attribution}
                </a>
                , {stream.licence}. Replayed in a loop as a stand-in for a camera feed.
              </>
            ) : (
              'Synthetic objects, no camera.'
            )}
          </p>
          {stats ? (
            <div className="charts">
              <TrendChart
                trend={stats.trend}
                bucketSeconds={stats.trend_bucket_seconds}
                capacity={Math.max(TREND_CAPACITY, stats.trend.length)}
              />
              <ClassMix counted={stats.counted} order={known} display={display} />
            </div>
          ) : null}
        </div>
        <div className="stream-stats">
          {stats ? (
            <>
              <dl className="figures">
                <div>
                  <dt>In view</dt>
                  <dd>
                    <span className="value">{total(stats.in_view)}</span>
                    <span className="figure-note">
                    avg {oneDecimal(stats.occupancy_mean)} · peak {stats.occupancy_peak} (1 min)
                  </span>
                  </dd>
                </div>
                <div>
                  <dt>Last 60 s</dt>
                  <dd>
                    <span className="value">{stats.per_minute}</span>
                    <span className="figure-note">new road users</span>
                  </dd>
                </div>
                <div>
                  <dt>Average per minute</dt>
                  <dd>
                    <span className="value">{hasAverages ? oneDecimal(total(averages)) : '–'}</span>
                    <span className="figure-note">
                    {hasAverages
                      ? `over ${String(Math.floor(stats.analysis_seconds / 60))} min of analysis`
                      : 'after the first minute'}
                  </span>
                  </dd>
                </div>
                <div>
                  <dt>Counted</dt>
                  <dd>
                    <span className="value">{total(stats.counted)}</span>
                    <span className="figure-note">since the analysis started</span>
                  </dd>
                </div>
              </dl>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Road user</th>
                    <th scope="col">In view</th>
                    <th scope="col">Last 60 s</th>
                    <th scope="col">Avg / min</th>
                    <th scope="col">Counted</th>
                  </tr>
                </thead>
                <tbody>
                  {known.map((label) => (
                    <tr key={label}>
                      <th scope="row">
                        <span className="swatch" data-label={label} />
                        {display(label)}
                      </th>
                      <td>{stats.in_view[label] ?? 0}</td>
                      <td>{stats.per_minute_by_class[label] ?? 0}</td>
                      <td>{hasAverages ? oneDecimal(averages[label] ?? 0) : '–'}</td>
                      <td>{stats.counted[label] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                {stats.analysis_fps.toFixed(1)} frames analysed per second,{' '}
                {Math.round(stats.inference_ms)} ms per frame
                {stats.dropped_frames > 0
                  ? `, ${String(stats.dropped_frames)} frames skipped`
                  : ''}
                . Counts are estimates: an object that is hidden for a while is counted again, and
                road users already in view when the analysis starts are not counted.
                {stats.congestion
                  ? ' Congestion compares the last minute with this camera’s own average.'
                  : ''}
              </p>
            </>
          ) : (
            <p role="status" className="loading">
              Waiting for the first results…
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
