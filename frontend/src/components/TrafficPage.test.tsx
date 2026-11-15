import { act, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { mockEventSource } from '../test/eventSource.ts'
import { streamEvent, streamList } from '../test/fixtures.ts'
import { json, mockApi, status } from '../test/server.ts'
import { TrafficPage } from './TrafficPage.tsx'

const STREAMS = 'GET /api/traffic/streams'

async function renderWithStream() {
  mockApi({ [STREAMS]: () => json(streamList) })
  const sources = mockEventSource()
  render(<TrafficPage onUnauthorized={vi.fn()} />)
  const panel = await screen.findByRole('region', { name: 'Tram junction' })
  return { panel, source: sources.instances[0], sources }
}

test('shows the stream with its video and credit, and waits for results', async () => {
  const { panel, source } = await renderWithStream()

  expect(source.url).toBe('/api/traffic/events')
  expect(panel.querySelector('video')).toHaveAttribute('src', '/api/traffic/streams/junction/video')
  expect(within(panel).getByRole('link', { name: 'Slick, Wikimedia Commons' })).toHaveAttribute(
    'href',
    'https://commons.wikimedia.org/wiki/File:Example.ogv',
  )
  expect(within(panel).getByText(/CC0 1\.0/)).toBeInTheDocument()
  expect(within(panel).getByRole('status')).toHaveTextContent('Waiting for the first results')
  expect(screen.getByText(/roadscan-traffic v1/)).toBeInTheDocument()
})

test('draws the boxes and statistics of the result for the frame on screen', async () => {
  const { panel, source } = await renderWithStream()

  act(() => {
    source.open()
    source.send(streamEvent())
  })

  const boxes = await within(panel).findAllByTestId('traffic-box')
  expect(boxes).toHaveLength(2)
  expect(boxes[0]).toHaveStyle({
    left: '25.00%',
    top: '50.00%',
    width: '25.00%',
    height: '25.00%',
  })
  expect(boxes[0]).toHaveTextContent('car')
  expect(boxes[1]).toHaveTextContent('tram / train')

  // In view, last 60 s, average per minute (sum over classes), counted.
  const figures = within(panel)
    .getAllByRole('definition')
    .flatMap((node) => node.querySelector('.value')?.textContent ?? [])
  expect(figures).toEqual(['2', '8', '7.6', '19'])
  expect(within(panel).getByText('avg 2.4 · peak 5 (1 min)')).toBeInTheDocument()
  expect(within(panel).getByText('over 2 min of analysis')).toBeInTheDocument()
  // In view, last 60 s, average per minute, counted.
  const person = within(panel).getByRole('row', { name: /person/ })
  expect(
    within(person)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['0', '2', '2.0', '5'])
  expect(
    within(panel).getByText(/5\.0 frames analysed per second, 31 ms per frame/),
  ).toBeInTheDocument()
  expect(within(panel).getByText('Congestion: Moderate')).toBeInTheDocument()
  expect(within(panel).getByText('CAM 01', { selector: '.eyebrow' })).toBeInTheDocument()
})

test('shows the trend of complete intervals and the class mix', async () => {
  const { panel, source } = await renderWithStream()

  act(() => {
    source.open()
    source.send(streamEvent())
  })

  // The fixture's last bucket (1) is still filling and is left out: latest complete is 2.
  expect(
    await within(panel).findByRole('img', {
      name: 'New road users per 15 seconds: latest 2, highest 5',
    }),
  ).toBeInTheDocument()
  expect(
    within(panel).getByRole('img', {
      name: 'Class mix: person 26 %, car 63 %, tram / train 11 %',
    }),
  ).toBeInTheDocument()
  const shares = within(panel)
    .getAllByRole('term')
    .filter((term) => /Heavy|Pedestrians/.test(term.textContent))
    .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent ?? ''}`)
  expect(shares).toEqual(['Heavy vehicles: 0 %', 'Pedestrians and two-wheelers: 26 %'])
})

test('before the first minute there are no averages and no congestion level', async () => {
  const { panel, source } = await renderWithStream()
  const early = streamEvent()
  act(() => {
    source.open()
    source.send({
      ...early,
      stats: { ...early.stats, average_per_minute: {}, congestion: null, trend: [3] },
    })
  })

  expect(await within(panel).findByText('after the first minute')).toBeInTheDocument()
  expect(within(panel).queryByText(/Congestion:/)).not.toBeInTheDocument()
  expect(within(panel).getByText(/Collecting data/)).toBeInTheDocument()
})

test('ignores results of frames the video has not reached yet', async () => {
  const { panel, source } = await renderWithStream()

  act(() => {
    source.send(streamEvent({ t: 60 })) // far ahead of the position on screen
  })
  await new Promise((resolve) => setTimeout(resolve, 250))

  expect(within(panel).queryAllByTestId('traffic-box')).toHaveLength(0)
})

test('says so while the connection is interrupted', async () => {
  const { source } = await renderWithStream()

  act(() => {
    source.fail(false) // the browser retries by itself
  })
  expect(await screen.findByText(/Reconnecting/)).toBeInTheDocument()

  act(() => {
    source.open()
  })
  await waitFor(() => {
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument()
  })
})

test('an expired session is reported to the app', async () => {
  mockApi({ [STREAMS]: status(401) })
  mockEventSource()
  const onUnauthorized = vi.fn()
  render(<TrafficPage onUnauthorized={onUnauthorized} />)

  await waitFor(() => {
    expect(onUnauthorized).toHaveBeenCalledWith('Your session has expired. Please log in again.')
  })
})

test('a stream without video (dummy models) shows a placeholder', async () => {
  const synthetic = {
    ...streamList.streams[0],
    video_url: null,
    source_url: '',
  }
  mockApi({ [STREAMS]: json({ ...streamList, streams: [synthetic] }) })
  mockEventSource()
  render(<TrafficPage onUnauthorized={vi.fn()} />)

  const panel = await screen.findByRole('region', { name: 'Tram junction' })
  expect(panel.querySelector('video')).toBeNull()
  expect(within(panel).getByText(/No video in this build/)).toBeInTheDocument()
})
