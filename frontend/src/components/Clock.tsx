import { useEffect, useState } from 'react'

/** HH:MM:SS UTC, as on an operations console. */
export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(11, 19)} UTC`
}

export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])
  return (
    <time className="clock" dateTime={now.toISOString()} aria-label="Time (UTC)">
      {formatUtc(now)}
    </time>
  )
}
