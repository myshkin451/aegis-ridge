import { it, expect } from 'vitest'
import { crew, crewById, responsibilityEdges } from '../src/data/crew'
import { defaultBlueprint } from '../src/data/defaultBlueprint'
import { bedrooms } from '../src/geometry/residentialPlan'
import { siteFacilities } from '../src/data/siteFacilities'
import { buildMepNetwork } from '../src/data/mepNetwork'
import { decodeTile, type AtlasInfo, type TileInfo } from '../src/geometry/siteElevations'
import { readFileSync } from 'node:fs'

const terrain = new URL('../public/terrain/', import.meta.url)
const manifest: AtlasInfo = JSON.parse(readFileSync(new URL('atlas.json', terrain), 'utf8'))
const tile = (t: TileInfo) => decodeTile(t, readFileSync(new URL(t.file, terrain)))
const graph = buildMepNetwork({ tiles: manifest.tiles.map(tile), insets: manifest.insets.map(tile), road: manifest.road })
it('assigns ten distinct people to all permanent beds, leaving the on-call cabin empty', () => {
  expect(crew).toHaveLength(10)
  expect(crewById.size).toBe(10)
  expect(new Set(crew.map(c => c.name)).size).toBe(10)
  const allBeds = bedrooms.filter(b => !b.onCall).flatMap(b => Array.from({ length: b.beds }, (_, i) => b.id + '/' + i))
  expect(crew.map(c => c.bedroomId + '/' + c.bedIndex).sort()).toEqual(allBeds.sort())
})
it.each(crew)('resolves $name’s support partners, rooms, installed circuits and morning camera anchors', member => {
  expect(member.primary.length).toBeGreaterThan(0)
  expect(new Set(member.support).size).toBe(2)
  expect(new Set(member.partners).size).toBe(2)
  for (const id of member.partners) {
    expect(crewById.has(id)).toBe(true)
    expect(id).not.toBe(member.id)
  }
  expect(member.roomIds.every(id => defaultBlueprint.rooms.some(r => r.id === id))).toBe(true)
  expect(member.sites.every(id => siteFacilities.some(s => s.kind === id))).toBe(true)
  expect(responsibilityEdges(member, graph).length).toBeGreaterThan(0)
  expect(member.route.length).toBeGreaterThanOrEqual(2)
  for (const stop of member.route) {
    expect(member.roomIds).toContain(stop.roomId)
    expect(defaultBlueprint.rooms.find(r => r.id === stop.roomId)?.cameraAnchors[stop.anchor ?? 0]).toBeDefined()
    expect(stop.caption.length).toBeGreaterThan(0)
  }
})

it('releases an interrupted tour without continuing its demonstration lockdown or changing the station clock', async () => {
  const { startTour, stopTour } = await import('../src/store/useCrewTour')
  const { useShelterStore } = await import('../src/store/useShelterStore')
  const { useOperationsStore } = await import('../src/store/useOperationsStore')
  const { useShiftClock } = await import('../src/store/useShiftClock')
  const view = useShelterStore.getState()
  const ops = useOperationsStore.getState()
  const clock = useShiftClock.getState()
  try {
    useShelterStore.setState({ time: '17:35' })
    ops.setScenario('cryo')
    useShiftClock.setState({ playing: true })
    startTour('opening')
    expect(useShiftClock.getState().playing).toBe(false)
    useShelterStore.setState({ time: '06:15' })
    ops.setScenario('fallout')
    stopTour(true)
    expect(useOperationsStore.getState()).toMatchObject({ scenario: 'cryo', lockdownStartedAt: null, lockdownSeconds: 0 })
    expect(useShelterStore.getState()).toMatchObject({ time: '17:35', cold: true })
    expect(useShiftClock.getState().playing).toBe(true)
  } finally {
    useShelterStore.setState(view)
    useOperationsStore.setState(ops)
    useShiftClock.setState(clock)
  }
})
