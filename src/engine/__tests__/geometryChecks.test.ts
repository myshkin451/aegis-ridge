import { describe, expect, it } from 'vitest'
import { defaultBlueprint } from '../../data/defaultBlueprint'
import type { MepNetwork } from '../../data/mepNetworkSchema'
import { adits } from '../../data/siteFacilities'
import { doors } from '../../geometry/doors'
import { checkGeometry } from '../geometryChecks'
import { stationNetwork as net } from './networkFixture'

const { rooms } = defaultBlueprint
const row = (id: string, network: MepNetwork = net) => checkGeometry(rooms, network).find((r) => r.id === id)!

describe('Installed building services', () => {
  it('measures five core footprints, both emergency exits and actual duct continuity', () => {
    const rows = checkGeometry(rooms, net)
    expect(rows.filter((r) => r.status !== 'PASS')).toEqual([])
    expect(row('core').value).toBe('8.00 m')
    expect(row('tray-gap').value).toBe('0.500 m')
  })
  it('finds an upper wet room even with another floor in between', () => {
    const changed = rooms.map((r) => (r.id === 'b1_tactical' ? { ...r, wetDryZone: 'wet' as const } : r))
    expect(checkGeometry(changed, net).find((r) => r.id === 'dry-stack')?.status).toBe('FAIL')
  })
  it('intersects a pipe crossing the dry footprint when both endpoints are outside', () => {
    const pipe = net.edges.find((e) => e.kind === 'drain')!
    const network: MepNetwork = {
      ...net,
      edges: [
        ...net.edges,
        {
          ...pipe,
          id: 'test-cross',
          points: [
            [4, 2, -7],
            [18, 2, -7],
          ],
        },
      ],
    }
    expect(row('dry-stack', network)).toMatchObject({ status: 'FAIL', edgeId: 'test-cross' })
  })
  it.each([
    [0.3999, 'FAIL'],
    [0.4, 'PASS'],
    [0.41, 'PASS'],
  ])('measures finite skew cable runs at %s m net clearance', (gap, status) => {
    const power = net.edges.find((e) => e.system === 'power')!,
      data = net.edges.find((e) => e.system === 'data')!
    const h = Number(gap) + power.radius + data.radius
    const network: MepNetwork = {
      ...net,
      edges: [
        {
          ...power,
          points: [
            [-1, 0, 0],
            [1, 0, 0],
          ],
        },
        {
          ...data,
          points: [
            [0, h, -1],
            [0, h, 1],
          ],
        },
      ],
    }
    expect(row('tray-gap', network).status).toBe(status)
  })
  it('detects an interrupted wet stack away from the protected electrical column', () => {
    const moved = rooms.map((r) => (r.id === 'b3_water' ? { ...r, bounds: { ...r.bounds, gx0: 1 } } : r))
    expect(checkGeometry(moved, net).find((r) => r.id === 'dry-stack')).toMatchObject({
      status: 'FAIL',
      roomId: 'b3_water',
    })
  })
  it('rejects an exhaust line laid inside the sloping escape tunnel', () => {
    const pipe = net.edges.find((e) => e.kind === 'exhaust')!
    const points = adits.east.points.map(([x, y, z]): [number, number, number] => [x, y + 1, z])
    const network = { ...net, edges: [...net.edges, { ...pipe, id: 'bore-exhaust', points }] }
    expect(row('egress', network)).toMatchObject({ status: 'FAIL', edgeId: 'bore-exhaust' })
  })
  it('detects a severed incident smoke head', () => {
    const network = { ...net, edges: net.edges.filter((e) => e.to !== 'BAT-431A-vent-terminal') }
    expect(row('battery-exhaust', network)).toMatchObject({ status: 'FAIL', equipmentTag: 'BAT-431A' })
  })
  it('detects smoke tied into the occupied room return even if the independent head remains', () => {
    const returnDuct = net.edges.find((e) => e.kind === 'airReturn')!
    const network = { ...net, edges: [...net.edges, { ...returnDuct, to: 'BAT-431A-vent-socket' }] }
    expect(row('battery-exhaust', network).status).toBe('FAIL')
  })
  it('requires both the CHP outdoor intake and exhaust', () => {
    const network = { ...net, edges: net.edges.filter((e) => e.to !== 'CHP-442-E-terminal') }
    expect(row('chp-ducts', network)).toMatchObject({ status: 'FAIL', equipmentTag: 'CHP-442' })
  })
  it('does not substitute the west tunnel for a missing east lobby door or isolated stair', () => {
    expect(
      checkGeometry(
        rooms,
        net,
        doors.filter((d) => d.id !== 'lobby-north'),
      ).find((r) => r.id === 'egress')?.status,
    ).toBe('FAIL')
    expect(row('egress', { ...net, edges: net.edges.filter((e) => e.to !== 'adit-east') }).status).toBe(
      'FAIL',
    )
  })
})
