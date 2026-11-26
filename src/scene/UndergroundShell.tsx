import { ADIT, FLOORS, SLAB, UNDERGROUND } from '../data/floors'
import { useShelterStore } from '../store/useShelterStore'
import { FloorSliceGroup } from './FloorSliceGroup'
import { aditCentreZ, buffer, floorSection, footprint, undergroundPlan as p } from './utils/coords'
import { ModelBuilder } from './utils/modelBuilder'
import { Model } from './utils/Model'
import { difference, outline, plate, rectangle } from './utils/planGeometry'
import { shaftFrames, slabPlan, steel } from './utils/shellGeometry'
import { groundHeight, randomSource } from './terrainGeometry'

function bufferRock() {
  const m = new ModelBuilder('granite'),
    plan = slabPlan(FLOORS.B1.bounds)
  const cap = floorSection('L1').slabBottom
  plate(m, plan, buffer.bottom, cap, '#858c89', '#69737b')
  // The upper 30 cm of the composite band includes the foundation slab beneath L1.
  const upper = difference(plan, rectangle(...stationLimits()))
  plate(m, upper, cap, buffer.top, '#909480', '#858b83')
  const random = randomSource(1249)
  for (const [axis, start, end] of [
    ['x', p.x0, p.x1],
    ['z', p.z0, p.z1],
  ] as const) {
    const point = (v: number, y: number): [number, number, number] =>
      axis === 'x' ? [v, y, p.z1 + 0.012] : [p.x0 - 0.012, y, v]
    // Fracture traces on the sawn granite face, bounded by the composite band.
    for (let i = 0; i < 20; i++) {
      let u = start + random() * (end - start),
        y = buffer.bottom + 0.3 + random() * 5.2
      const slope = (random() - 0.5) * 0.63,
        len = 0.25 + random() * 2.8
      const color = i % 4 === 0 ? '#909592' : '#5d686e'
      for (let j = 0; j < 3; j++) {
        const v = Math.min(end, u + len / 3),
          yy = Math.max(
            buffer.bottom + 0.09,
            Math.min(cap - 0.04, y + slope * (v - u) + (random() - 0.5) * 0.16),
          )
        m.line(point(u, y), point(v, yy), color)
        u = v
        y = yy
      }
    }
  }
  return m
}
function stationLimits(): [number, number, number, number] {
  const s = footprint(FLOORS.L1.bounds)
  return [s.x0, s.x1, s.z0, s.z1]
}
function bufferWire() {
  const m = new ModelBuilder(),
    plan = slabPlan(FLOORS.B1.bounds)
  for (const y of [buffer.bottom, buffer.top]) outline(m, plan, y, '#c0ccd1')
  for (const x of [p.x0, p.x1])
    for (const z of [p.z0, p.z1]) m.line([x, buffer.bottom, z], [x, buffer.top, z], '#b5c4cc')
  return m
}
function coreExtension() {
  const m = new ModelBuilder()
  shaftFrames(m, floorSection('B1').plenumTop, buffer.top)
  return m
}
function roofCap() {
  const m = new ModelBuilder()
  plate(m, slabPlan(FLOORS.B1.bounds), buffer.bottom - SLAB, buffer.bottom, '#c1c6bc', '#c4c8c1')
  return m
}
function adit(cladding = false) {
  const m = new ModelBuilder(),
    z = aditCentreZ,
    w = ADIT.width,
    h = ADIT.height
  const sill = floorSection(ADIT.floorId).floor
  let mouth = p.x0
  while (mouth > -55 && groundHeight(mouth, z) > sill + 0.05) mouth -= 0.25
  const length = p.x0 - mouth
  if (cladding) {
    m.box('#747d7e', [(mouth + p.x0) / 2, sill + h + 0.1, z + w * 0.25], [length, 0.2, w * 0.5])
    m.box('#777e7b', [(mouth + p.x0) / 2, sill + h / 2, z + w / 2 + 0.035], [length, h, 0.09])
    return m
  }
  m.box('#9a9c94', [(mouth + p.x0) / 2, sill - 0.09, z], [length, 0.18, w])
  m.box('#777e7b', [(mouth + p.x0) / 2, sill + h / 2, z - w / 2 - 0.035], [length, h, 0.09])
  m.box('#9a9e96', [(mouth + p.x0) / 2, sill + h + 0.1, z - w * 0.25], [length, 0.2, w * 0.5])
  m.box('#91968d', [mouth - 0.7, sill - 0.13, z], [1.5, 0.26, w + 0.72])
  for (const side of [-1, 1])
    m.box('#4d5b5c', [p.x0 + 0.1, sill + h * 0.48, z + side * w * 0.24], [0.14, h * 0.96, w * 0.46], 'steel')
  for (let x = mouth + 0.12; x <= p.x0; x += 2.5) {
    for (const side of [-1, 1])
      m.box('#8b938f', [x, sill + h / 2, z + side * (w / 2 + 0.07)], [0.22, h, 0.14])
    m.box('#9da19a', [x, sill + h + 0.03, z], [0.26, 0.18, w + 0.24])
    m.box('#f3d7a0', [x, sill + h - 0.16, z - w / 2 + 0.16], [0.33, 0.12, 0.14], 'lamp')
  }
  // Recessed reveal and stone lintel keep the portal legible at the natural rock face.
  for (const side of [-1, 1])
    m.box('#969b91', [mouth, sill + h / 2, z + side * (w / 2 + 0.18)], [0.62, h, 0.36])
  m.box('#bbc0b1', [mouth, sill + h + 0.12, z], [0.68, 0.33, w + 0.78])
  for (const dz of [-0.91, 0.91])
    m.box(steel, [(mouth + p.x0) / 2, sill + 0.02, z + dz], [length, 0.035, 0.06], 'steel')
  return m
}
const aditCladding = () => adit(true)

export function UndergroundShell() {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode)
  const upper = floor === 'ALL' || floor === 'L1' || floor === 'L2'
  return (
    <>
      {UNDERGROUND.map((id) => (
        <FloorSliceGroup key={id} id={id} />
      ))}
      <Model build={roofCap} opacity={upper ? (mode === 'xray' ? 0.17 : 1) : 0} />
      <Model build={bufferRock} opacity={Number(upper && mode !== 'xray')} />
      <Model build={bufferWire} opacity={upper && mode === 'xray' ? 0.12 : 0} />
      <Model build={coreExtension} opacity={Number(upper)} />
      <Model build={adit} opacity={Number(upper || floor === 'B1')} />
      <Model build={aditCladding} opacity={Number(floor === 'ALL' && mode === 'exterior')} />
    </>
  )
}
