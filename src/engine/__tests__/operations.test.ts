import { describe, expect, it } from 'vitest'
import { defaultBlueprint } from '../../data/defaultBlueprint'
import { stationNetwork as net } from './networkFixture'
import { evaluateFeasibility } from '../feasibility'
import { fitsFreight, hoistReachable, simulateMaintenance, transportRoute } from '../maintenance'
import { design, marginStatus, spareStock, type OperatingPoint } from '../model'
import { evaluateOperations } from '../operations'

const base: OperatingPoint = { scenario: 'normal', people: 10, hour: 10.5 }
const rooms = defaultBlueprint.rooms
const room = (id: string) => rooms.find((r) => r.id === id)!
const onlyChp = rooms.map((r) => ({
  ...r,
  equipment: r.equipment.filter((e) => e.redundantGroup !== 'primary-source'),
}))

describe('operating envelopes and conservation', () => {
  it.each([
    [109.999, 'WARN'],
    [110, 'PASS'],
    [100, 'WARN'],
    [99.999, 'FAIL'],
  ] as const)('rates %s kW available against 100 kW', (capacity, expected) => {
    expect(marginStatus(capacity, 100)).toBe(expected)
  })
  it.each([4, 15, 10.5, NaN])('rejects invalid populations %s', (people) => {
    expect(() => evaluateFeasibility({ ...base, people })).toThrow(RangeError)
  })
  it('exposes actual ten vs fourteen-person oxygen, water, calories, and metabolic heat', () => {
    const p = { ...base, scenario: 'fallout' as const }
    const ten = evaluateFeasibility(p),
      fourteen = evaluateFeasibility({ ...p, people: 14 })
    expect(ten.oxygenDemand).toBeCloseTo(8.4)
    expect(fourteen.oxygenDemand).toBeCloseTo(11.76)
    expect(fourteen.oxygenMargin - ten.oxygenMargin).toBeCloseTo(-3.36)
    expect(fourteen.oxygenDemand).toBeGreaterThan(fourteen.electroCapacity)
    expect(fourteen.grey).toBe(910)
    expect(fourteen.black).toBe(84)
    expect(fourteen.waterDays).toBeLessThan(ten.waterDays)
    expect(fourteen.kcalDemand - ten.kcalDemand).toBe(9200)
    expect(fourteen.grainDays).toBeLessThan(ten.grainDays)
    expect(ten.totalHeat - ten.belowLoad - ten.waste - ten.inverterLossKw).toBeCloseTo(1.2)
    expect(fourteen.totalHeat - fourteen.belowLoad - fourteen.waste - fourteen.inverterLossKw).toBeCloseTo(
      1.68,
    )
  })
  it.each([0.28, 0.3, 0.33])(
    'balances reactor electricity, plant waste and distributed heat at efficiency %s',
    (eta) => {
      const updated = rooms.map((r) => ({
        ...r,
        equipment: r.equipment.map((e) =>
          e.redundantGroup === 'primary-source' ? { ...e, thermalEfficiency: eta } : e,
        ),
      }))
      const v = evaluateFeasibility({ ...base, scenario: 'bio' }, updated)
      expect(v.reactorOutput).toBeGreaterThan(0)
      expect(v.waste + v.reactorOutput).toBeCloseTo(v.reactorOutput / eta)
      expect(v.totalHeat).toBeCloseTo(v.belowLoad + v.waste + v.inverterLossKw + 1.2)
      expect(v.heatMargin).toBeCloseTo(v.heatCapacity - v.totalHeat)
    },
  )
  it.each(['bio', 'fallout'] as const)(
    'interlocks combustion, outside water and roof renewables in %s',
    (scenario) => {
      const v = evaluateFeasibility({ ...base, scenario })
      expect([v.chpOutput, v.chpCapacity, v.externalWater, v.solar, v.wind]).toEqual([0, 0, 0, 0, 0])
      expect(v.nPlusOne).toBe(75)
      expect(v.electroWater).toBeCloseTo((v.electroOxygen * 18) / 16)
      expect(v.rockDays).toBe(0)
      expect(v.rows.find((row) => row.id === 'heat')?.status).toBe('FAIL')
      const inProgress = evaluateFeasibility({ ...base, scenario, sealed: false }, onlyChp)
      expect(inProgress.chpCapacity).toBe(0)
      expect(inProgress.sealed).toBe(false)
    },
  )
  it('checks CHP open combustion ports before permitting reserve dispatch', () => {
    const open = evaluateFeasibility(base, onlyChp)
    const sealed = evaluateFeasibility({ ...base, sealed: true }, onlyChp)
    expect(open.chpOutput).toBeGreaterThan(0)
    expect(open.chpWaste).toBeCloseTo((open.chpOutput * 0.68) / 0.32)
    expect(sealed.chpOutput).toBe(0)
    const broken = { ...net, edges: net.edges.filter((e) => e.to !== 'CHP-442-E-terminal') }
    expect(evaluateOperations(base, broken).feasibility.chpCapacity).toBe(0)
  })
  it('computes finite rock endurance from absorbed energy when exchange is sufficient', () => {
    const updated = rooms.map((r) => ({
      ...r,
      equipment: r.equipment.map((e) => (e.tagCode === 'MH-421' ? { ...e, heatRejectionKw: 2000 } : e)),
    }))
    const v = evaluateFeasibility({ ...base, scenario: 'bio' }, updated)
    expect(v.rockDays * v.rockRiseKDay).toBeCloseTo(design.rockDeltaK)
    expect(v.rockRiseKDay).toBeCloseTo(
      (v.totalHeat * 86400) / (design.rockVolumeM3 * design.rockDensityKgM3 * design.rockHeatKjKgK),
    )
  })
  it('parks both rooftop turbines in a blizzard and charges inverter losses to the underground heat sink', () => {
    const open = evaluateFeasibility(base)
    const blizzard = evaluateFeasibility({ ...base, scenario: 'cryo' })
    expect(open.wind).toBeCloseTo(design.windKw * design.windCapacityFactor)
    expect(blizzard.wind).toBe(0)
    expect(open.inverterLossKw).toBe(0)
    const sealed = evaluateFeasibility({ ...base, scenario: 'fallout', people: 14 })
    expect(sealed.batteryDraw).toBeGreaterThan(0)
    expect(sealed.inverterLossKw).toBeCloseTo(sealed.batteryDraw * (1 / design.inverterEfficiency - 1))
    expect(sealed.totalHeat).toBeCloseTo(
      sealed.servedBelowLoad + sealed.waste + sealed.chpWaste + sealed.inverterLossKw + 14 * 0.12,
    )
  })
  it('scales peak solar under snow and forbids night PV', () => {
    expect(evaluateFeasibility({ ...base, scenario: 'cryo' }).solar).toBeCloseTo(
      evaluateFeasibility(base).solar * 0.15,
    )
    expect(evaluateFeasibility({ ...base, hour: 23 }).solar).toBe(0)
    expect(evaluateFeasibility({ ...base, scenario: 'cryo' }).surfaceCapacity).toBeGreaterThan(
      evaluateFeasibility(base).surfaceCapacity,
    )
  })
  it('uses the fitted crop footprints, separate layer counts, and lighting schedule boundaries', () => {
    const v = evaluateFeasibility({ ...base, scenario: 'bio', hour: 19 }, rooms, design, ['OX-452'])
    const on = evaluateFeasibility({ ...base, scenario: 'bio', hour: 20 }, rooms, design, ['OX-452'])
    expect(v.leafArea / v.stapleArea).toBeCloseTo(5 / 2)
    expect(v.lightHourOxygenKg).toBe(0)
    expect(on.lightHourOxygenKg).toBeGreaterThan(0)
    expect(on.load - v.load).toBeCloseTo(2 * 5.9 + 2 * 6.6 + 1.6)
    expect(evaluateFeasibility({ ...base, hour: 12 }).lightHourOxygenKg).toBe(0)
    expect(evaluateFeasibility({ ...base, hour: 11.99 }).lightHourOxygenKg).toBeGreaterThan(0)
  })
  it('does not count passive bottles as continuous generation or unavailable adsorption as capture', () => {
    const v = evaluateFeasibility({ ...base, people: 14, scenario: 'bio' }, rooms, design, [
      'OX-452',
      'CB-453',
    ])
    expect(v.electroCapacity).toBe(0)
    expect(v.oxygenDays).toBeCloseTo(design.oxygenBottleKg / (11.76 - v.photoOxygen))
    expect(v.rows.find((row) => row.id === 'co2')?.status).toBe('FAIL')
  })
  it('charges the dark-period gas deficit to the cylinder even when average photosynthesis covers it', () => {
    const v = evaluateFeasibility({ ...base, scenario: 'bio', people: 14 })
    expect(v.oxygenMargin).toBeGreaterThan(0)
    expect(v.bottleDrawKgDay).toBeCloseTo(((11.76 - 10.4) * 8) / 24)
    expect(v.oxygenDays).toBeCloseTo(36 / v.bottleDrawKgDay)
  })
  it('balances grid load against generation, finite inverter discharge and unmet demand', () => {
    const p = { ...base, scenario: 'fallout' as const }
    const f = evaluateFeasibility(p)
    expect(f.batteryDraw).toBeGreaterThan(0)
    expect(f.reactorOutput + f.chpOutput + f.solar + f.wind + f.batteryDraw + f.unmet).toBeCloseTo(f.load)
    expect(f.deficitHours * f.batteryDraw).toBeCloseTo(f.batteryEnergy)
    const blackout = evaluateFeasibility(p, rooms, design, ['GEN-441A', 'GEN-441B', 'BAT-431A', 'BAT-431B'])
    expect(blackout.unmet).toBeCloseTo(blackout.load)
    expect([
      blackout.kcal,
      blackout.electroOxygen,
      blackout.photoOxygen,
      blackout.co2Capture,
      blackout.ach,
    ]).toEqual([0, 0, 0, 0, 0])
    expect(blackout.totalHeat).toBeCloseTo(p.people * 0.12)
  })
  it('consumes filter inventory in proportion to the scenario loading', () => {
    expect(evaluateFeasibility({ ...base, scenario: 'bio' }).hepaDays).toBeCloseTo(
      evaluateFeasibility(base).hepaDays / 3.5,
    )
    const v = evaluateFeasibility(base, rooms, design, ['AHU-451A', 'AHU-451B'])
    expect(v.ach).toBe(0)
    expect(v.rows.find((row) => row.id === 'filters')?.status).toBe('FAIL')
  })
  it('charges lost recovery, and only credits connected tank stock', () => {
    const v = evaluateFeasibility(base)
    expect(evaluateFeasibility(base, rooms, design, ['TK-301A']).waterDays).toBeCloseTo(v.waterDays / 2)
    expect(evaluateFeasibility(base, rooms, design, ['WT-302']).netWater).toBeGreaterThan(v.netWater)
  })
})
describe('maintenance and load transfer', () => {
  it('solves an independent B path to each room lost on the A feeder', () => {
    const feeder = net.edges.find((e) => e.from === 'A-board')!
    const v = simulateMaintenance(feeder.id, net)!
    expect(v.affectedRoomIds).toEqual([])
    expect(v.backupEdgeIds).toContain(net.edges.find((e) => e.from === 'B-board')!.id)
    expect(v.backupEdgeIds).not.toContain(feeder.id)
  })
  it('distinguishes a surviving generator from one able to cover the load', () => {
    const report = evaluateOperations({ ...base, scenario: 'fallout', isolatedId: 'GEN-441A' }, net)
    expect(report.maintenance?.backupEquipmentTag).toBe('GEN-441B')
    expect(report.maintenance?.status).toBe('WARN')
    expect(report.maintenance?.summary).toContain('电池需补')
    expect(report.feasibility.deficitHours).toBeLessThan(24)
  })
  it('retains stored water after losing the spring, and switches to the other air intake', () => {
    const inlet = net.edges.find((e) => e.from === 'spring')!
    const isolated = evaluateOperations({ ...base, isolatedId: inlet.id }, net)
    expect(isolated.feasibility.externalWater).toBe(0)
    expect(isolated.feasibility.leafArea).toBeGreaterThan(0)
    expect(isolated.feasibility.waterDays).toBeGreaterThan(0)
    const air = net.edges.find((e) => e.from === 'westIntake')!
    expect(evaluateOperations({ ...base, isolatedId: air.id }, net).feasibility.intake).toBe('东进风口')
  })
  it('lists downstream rooms and reduces crop yield on a single-ended water branch', () => {
    const feed = net.edges.find((e) => e.to === 'b3_hydroponics-use')!
    const v = evaluateOperations({ ...base, isolatedId: feed.id }, net)
    expect(v.maintenance?.affectedRoomIds).toContain('b3_hydroponics')
    expect(v.maintenance?.backupEdgeIds).toHaveLength(0)
    expect(v.feasibility.leafArea).toBe(0)
  })
  it('checks actual spares and selects a distinct installed redundant unit', () => {
    const v = simulateMaintenance('TK-301A', net)!
    expect(v.summary).toContain('TK-301B')
    expect(v.backupEdgeIds).toContain(net.edges.find((e) => e.from === 'TK-301B')!.id)
    expect(simulateMaintenance('TK-301A', net, rooms, { ...spareStock, consumable: 0 })?.status).toBe('FAIL')
  })
  it('uses the B1 and B4 rear landing doors and leaves the upper greenhouse unverified', () => {
    for (const id of ['b1_logistics', 'b4_geothermal'])
      expect(transportRoute(room(id), net).some(([x, , z]) => x === -4 && z === -6)).toBe(true)
    expect(transportRoute(room('l2_greenhouse'), net)).toEqual([])
    const segment = net.edges.find((e) => e.kind === 'freight' && e.to === 'freight-B3')!
    expect(transportRoute(room('b4_geothermal'), net, segment.id)).toEqual([])
  })
  it('follows the whole hoist network even if the final room track survives', () => {
    const segment = net.edges.find((e) => e.kind === 'freight' && e.to === 'freight-B3')!
    expect(hoistReachable(room('b4_geothermal'), net)).toBe(true)
    expect(hoistReachable(room('b4_geothermal'), net, segment.id)).toBe(false)
    expect(net.edges.some((e) => e.to === 'hoist-b4_geothermal')).toBe(true)
    const closed = evaluateOperations({ ...base, isolatedId: segment.id }, net)
    expect(closed.rows.find((r) => r.id === 'freight-b4_geothermal')?.value).toBe('搬运不通')
  })
  it('limits outdoor repairs to a verified indoor handover point', () => {
    const segment = net.edges.find((e) => e.from === 'spring')!
    const result = simulateMaintenance(segment.id, net)!
    expect(result.route.length).toBeGreaterThan(0)
    expect(result.summary).toContain('室外故障点')
    expect(result.status).not.toBe('PASS')
  })
  it('checks complete installation mass and all three envelope dimensions', () => {
    const base = room('b4_reactor').equipment[0]
    expect(fitsFreight(base)).toBe(false)
    expect(fitsFreight({ ...base, weightKg: 2500, moduleSizeM: [1.6, 2.1, 1.6] })).toBe(true)
    expect(fitsFreight({ ...base, weightKg: 2501, moduleSizeM: [1.6, 2.1, 1.6] })).toBe(false)
    expect(
      evaluateOperations({ scenario: 'normal', hour: 12, people: 10 }, net).rows.find(
        (r) => r.id === 'freight-b4_reactor',
      )?.status,
    ).toBe('FAIL')
  })
  it('evaluates every installed asset and every surveyed segment without inferring a nonexistent bypass', () => {
    for (const id of [
      ...rooms.flatMap((r) => r.equipment.map((e) => e.tagCode)),
      ...net.edges.map((e) => e.id),
    ]) {
      const result = simulateMaintenance(id, net)!
      expect(result.id).toBe(id)
      expect(result.backupEdgeIds).not.toContain(id)
    }
    expect(simulateMaintenance('missing', net)).toBeNull()
  })
})
