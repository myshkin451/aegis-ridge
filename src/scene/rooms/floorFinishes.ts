import { roomsOn } from '../../data/defaultBlueprint'
import { FLOORS } from '../../data/floors'
import { footprint, undergroundPlan } from '../../geometry/coords'
import { openingsAlong, type WallAxis } from '../../geometry/doors'
import { ModelBuilder } from '../utils/modelBuilder'

// The perimeter wall extends 200 mm inward. Internal door frames stand 105 mm
// proud of the partition centreline. Measure the cavity from the back of the panel.
export function liningCentre(axis: WallAxis, fixed: number, inward: number, thickness: number) {
  const perimeter = axis === 'x'
    ? fixed === undergroundPlan.z0 || fixed === undergroundPlan.z1
    : fixed === undergroundPlan.x0 || fixed === undergroundPlan.x1
  return fixed + inward * ((perimeter ? 0.2 : 0.105) + 0.016 + thickness / 2)
}

export function gymFloor() {
  const m = new ModelBuilder()
  const gym = roomsOn('B1').find((r) => r.id === 'b1_gym')!
  const r = footprint(gym.bounds)
  // Loose-laid 1 m impact tiles. The perimeter cut course leaves the structural drain clear.
  const margins = 0.21
  const tones = ['#474c48', '#434845', '#474a47', '#454b46']
  for (let x = r.x0 + margins, col = 0; x < r.x1 - margins; x++, col++) {
    const width = Math.min(1, r.x1 - margins - x)
    for (let z = r.z0 + margins, row = 0; z < r.z1 - margins; z++, row++) {
      const depth = Math.min(1, r.z1 - margins - z)
      m.box(
        tones[(row * 3 + col * 7) % tones.length],
        [x + width / 2, 0.011, z + depth / 2],
        [width - 0.004, 0.022, depth - 0.004],
        'rubber_gym',
      )
    }
  }
  const therapy = gym.equipment.find((e) => e.tagCode === 'PHY-153')!
  const backingX = liningCentre('z', r.x0, 1, 0.025),
    centerZ = therapy.position[2],
    width = 3.8
  // A wipeable oak lining behind the existing therapy light; the accessible side and aisle stay clear.
  for (let i = 0; i < 20; i++)
    m.box(
      i % 3 === 0 ? '#b79672' : '#c3a17b',
      [backingX, 1.27, centerZ + ((i - 9.5) * width) / 20],
      [0.025, 2.34, width / 20 - 0.004],
      'oak_int',
    )
  return m
}

export function cleanRoomPanels() {
  const m = new ModelBuilder()
  const height = FLOORS.B3.clearHeight
  function line(axis: WallAxis, fixed: number, begin: number, end: number, inward: number, glazed: boolean) {
    const at = liningCentre(axis, fixed, inward, 0.012)
    function course(a: number, b: number, bottom: number, top: number) {
      if (top <= bottom || b <= a) return
      // Food-safe panels butt against each other with a narrow flush, sealed seam.
      for (let from = a; from < b; from += 1.2) {
        const to = Math.min(from + 1.2, b)
        if (to - from < 0.006) continue
        const mid = (from + to) / 2,
          w = to - from - 0.003,
          h = top - bottom,
          y = (bottom + top) / 2
        m.box(
          '#d9d9cf',
          axis === 'x' ? [mid, y, at] : [at, y, mid],
          axis === 'x' ? [w, h, 0.012] : [0.012, h, w],
          'pvc_clean',
        )
      }
    }
    function wall(a: number, b: number) {
      if (glazed && b - a > 1) {
        course(a, b, 0.028, 1.045)
        course(a, b, 2.61, height)
      } else course(a, b, 0.028, height)
    }
    let cursor = begin
    for (const door of openingsAlong('B3', axis, fixed, begin, end)) {
      const middle = door.base[axis === 'x' ? 0 : 2]
      const left = middle - door.width / 2,
        right = middle + door.width / 2
      wall(cursor, left)
      course(left, right, door.height + 0.06, height)
      cursor = right
    }
    wall(cursor, end)
  }
  for (const room of roomsOn('B3')) {
    const r = footprint(room.bounds)
    const north = room.bounds.gz0 === 0
    line('x', r.z0, r.x0, r.x1, 1, !north && room.corridorGlazing)
    line('x', r.z1, r.x0, r.x1, -1, north && room.corridorGlazing)
    line('z', r.x0, r.z0, r.z1, 1, false)
    line('z', r.x1, r.z0, r.z1, -1, false)
  }
  return m
}
