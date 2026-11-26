import { useLayoutEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { FLOORS, FLOOR_ORDER, GRID, UNDERGROUND } from '../data/floors'
import { roomsOn } from '../data/defaultBlueprint'
import { footprint, gridToWorld, undergroundPlan } from '../geometry/coords'
import { useShelterStore } from '../store/useShelterStore'
import { Inscription } from './rooms/Inscription'

function Rules({ points, color }: { points: number[]; color: string }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(points, 3))
    return g
  }, [points])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} toneMapped={false} />
    </lineSegments>
  )
}
const compactRoom: Record<string, string> = {
  l1_garage: '重载车库',
  l1_vestibule: '互锁气闸',
  l1_lobby: '公众门厅',
  l2_observatory: '气象观测',
  l2_greenhouse: '生态温室',
  b1_decon: '洗消',
  b1_logistics: '物流分拣',
  b1_tactical: '外勤装备',
  b1_warehouse: '备件仓库',
  b1_workshop: '维修工坊',
  b2_medical: '综合医务',
  b2_library: '工程档案',
  b2_command: '中央智控',
  b2_commons: '公共餐厅',
  b2_gym: '健身光疗',
  b2_quarters: '独立居住舱',
  b3_water: '净水再生',
  b3_foodproc: '食品加工',
  b3_coldvault: '战略冷库',
  b3_hydroponics: '分层水培',
  b3_aquaponics: '鱼菜共生',
  b4_drainage: '集水外排',
  b4_geothermal: '地热分配',
  b4_switchgear: '双母线配电',
  b4_reactor: '主能源机房',
  b4_cbrn_hvac: '三防新风',
}
function Marks({ floor, plan }: { floor: keyof typeof FLOORS; plan: boolean }) {
  const h = useShelterStore((s) => s.cutHeight),
    z = useShelterStore((s) => s.sectionZ)
  const y = FLOORS[floor].elevation + h + 0.04
  const pts = useMemo(() => {
    const v: number[] = []
    if (plan) {
      const r = footprint(FLOORS[floor].bounds)
      for (let i = 0; i <= GRID.columns; i++) {
        const [x] = gridToWorld(i - 0.5, 0, floor)
        v.push(x, y, r.z0 - 1.15, x, y, r.z0 - 0.12, x, y, r.z1 + 0.12, x, y, r.z1 + 1.15)
      }
      for (let i = 0; i <= GRID.rows; i++) {
        const [, , zz] = gridToWorld(0, i - 0.5, floor)
        v.push(r.x0 - 1.15, y, zz, r.x0 - 0.12, y, zz, r.x1 + 0.12, y, zz, r.x1 + 1.15, y, zz)
      }
    } else
      for (const id of UNDERGROUND) {
        const fy = FLOORS[id].elevation
        v.push(undergroundPlan.x1, fy, z + 0.14, undergroundPlan.x1 + 2.1, fy, z + 0.14)
      }
    return v
  }, [plan, floor, y, z])
  return (
    <>
      <Rules points={pts} color="#484e4c" />
      {plan
        ? roomsOn(floor).map((r, i) => {
            const p = footprint(r.bounds)
            return (
              <Inscription
                key={r.id}
                text={floor + '-' + String(i + 1).padStart(2, '0') + '　' + compactRoom[r.id]}
                width={Math.min(p.w - 0.75, 7.2)}
                height={0.87}
                position={[p.x, y, p.z]}
                flat
                color="#21292a"
                background="#e9eae1"
              />
            )
          })
        : UNDERGROUND.map((id) => (
            <Inscription
              key={id}
              text={id + '　' + FLOORS[id].elevation.toFixed(3)}
              width={5.8}
              height={1.02}
              position={[undergroundPlan.x1 + 4.9, FLOORS[id].elevation + 0.22, z + 0.15]}
              color="#252c2c"
              background="#d9dbd1"
            />
          ))}
    </>
  )
}

export function DrawingMarks() {
  const view = useShelterStore((s) => s.cameraState),
    level = useShelterStore((s) => s.lastFloor)
  return (
    <>
      <group visible={view === 'section'}>
        <Marks floor="B2" plan={false} />
      </group>
      {FLOOR_ORDER.map((floor) => (
        <group key={floor} visible={view === 'plan' && level === floor}>
          <Marks floor={floor} plan />
        </group>
      ))}
    </>
  )
}
