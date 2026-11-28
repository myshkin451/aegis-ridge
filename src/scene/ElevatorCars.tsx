import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, InstancedMesh, Matrix4 } from 'three'
import { FLOORS } from '../data/floors'
import { cabinPanel, cabinPanelCount, cabinWall, elevatorIds, elevatorSpecs, type ElevatorId } from '../geometry/elevators'
import { elevatorBank } from '../store/useElevatorRide'
import { useShelterStore } from '../store/useShelterStore'
import { Model } from './utils/Model'
import { ModelBuilder } from './utils/modelBuilder'

function cabin(id: ElevatorId) {
  const m = new ModelBuilder()
  const { width, depth, height } = elevatorSpecs[id]
  const wood = id === 'passenger'
  m.box(wood ? '#aa8b6b' : '#7b8785', [0, -0.08, 0], [width, 0.16, depth], wood ? 'wood' : 'grate')
  m.box(wood ? '#d8d4c4' : '#a0aaa7', [0, height + 0.05, 0], [width, 0.1, depth], 'steel')
  for (const side of [-1, 1]) {
    const x = side * (width - cabinWall) / 2
    m.box('#8b9694', [x, height / 2, 0], [cabinWall, height, depth], 'steel')
    m.box(wood ? '#ad8460' : '#626f70', [x - side * 0.055, 1.24, 0], [0.016, 1.72, depth - 0.14], wood ? 'wood' : 'steel')
    m.box('#a5afad', [x - side * 0.098, 0.94, -0.06], [0.048, 0.045, depth - 0.32], 'steel')
    m.box(wood ? '#ffdfaf' : '#e3efe7', [side * width * 0.34, height - 0.022, 0], [0.055, 0.04, depth - 0.25], 'lamp')
  }
  const faces = wood ? [1] : [-1, 1]
  const jambWidth = (width - 2 * cabinWall - elevatorSpecs[id].cabinOpening) / 2
  for (const face of faces) for (const side of [-1, 1])
    m.box('#7a8584', [side * (elevatorSpecs[id].cabinOpening + jambWidth) / 2, height / 2, face * (depth / 2 - 0.16)],
      [jambWidth, height, 0.024], 'steel')
  if (wood) {
    const z = -(depth - cabinWall) / 2
    m.box('#ad8965', [0, height / 2, z], [width - 2 * cabinWall, height, cabinWall], 'wood')
    m.box('#aeb6ae', [0, 0.94, z + 0.09], [width - 0.29, 0.045, 0.05], 'steel')
  }
  // Brushed control strip and inset physical buttons stay visible beside the entry.
  const stripX = width / 2 - 0.12
  m.box('#4e5958', [stripX, 1.27, depth * 0.29], [0.029, 0.49, 0.17], 'steel')
  for (let i = 0; i < elevatorSpecs[id].stops.length; i++)
    m.box('#dcdcc8', [stripX - 0.025, 1.44 - i * 0.063, depth * 0.29], [0.016, 0.036, 0.044], 'lamp')
  return m
}
function gatePanels(id: ElevatorId) {
  const spec = elevatorSpecs[id]
  const model = new ModelBuilder()
  const tracks = []
  for (const face of id === 'freight' ? [-1, 1] : [1]) {
    for (const side of [-1, 1]) {
      for (let index = 0; index < cabinPanelCount; index++) {
        const { x, width } = cabinPanel(id, side, index, 0)
        const z = face * (spec.depth / 2 - 0.025 - index * 0.032)
        model.box(index % 2 ? '#aab3ae' : '#909e9c', [x, spec.height / 2, z], [width, spec.height, 0.026], 'steel')
        tracks.push({ face, side, index, z, width })
      }
    }
  }
  return { build: () => model, tracks }
}

function ElevatorCarMesh({ id }: { id: ElevatorId }) {
  const body = useRef<Group>(null)
  const gates = useRef<Group>(null)
  const panels = useRef<InstancedMesh | null>(null)
  const pose = useRef({ front: -1, rear: -1 })
  const s = elevatorSpecs[id]
  const build = useMemo(() => () => cabin(id), [id])
  const gate = useMemo(() => gatePanels(id), [id])
  const matrix = useMemo(() => new Matrix4(), [])
  useFrame(() => {
    if (!body.current || !gates.current) return
    const car = elevatorBank.cars[id], view = useShelterStore.getState()
    body.current.position.y = car.elevation
    body.current.visible = view.cameraState === 'walkthrough' || (
      (view.mode !== 'exterior' || car.elevation > -0.1) &&
      (view.floor === 'ALL' || car.elevation <= FLOORS[view.floor].elevation + 0.01)
    )
    const mesh = panels.current ??= gates.current.getObjectByProperty('isInstancedMesh', true) as InstancedMesh | null
    if (!mesh) return
    const front = car.opening, rear = s.rearStops.includes(car.stop) ? front : 0
    if (front === pose.current.front && rear === pose.current.rear) return
    pose.current.front = front
    pose.current.rear = rear
    gate.tracks.forEach(({ face, side, index, z, width }, i) => {
      const { x } = cabinPanel(id, side, index, face > 0 ? front : rear)
      matrix.makeScale(width, s.height, 0.026).setPosition(x, s.height / 2, z)
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  })
  return (
    <group ref={body} name={id === 'freight' ? '3t 贯通货梯轿厢' : '人员客梯轿厢'}
      position={[s.x, FLOORS[s.initial].elevation, s.z]} userData={{ skipWalk: true }}>
      <Model build={build} interior />
      <group ref={gates}>
        <Model build={gate.build} interior />
      </group>
    </group>
  )
}

export function ElevatorCars() {
  return elevatorIds.map(id => <ElevatorCarMesh key={id} id={id} />)
}
