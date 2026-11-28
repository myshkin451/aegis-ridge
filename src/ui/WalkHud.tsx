import { roomsOn } from '../data/defaultBlueprint'
import { footprint } from '../geometry/coords'
import { useShelterStore } from '../store/useShelterStore'
import { elevatorSpecs } from '../geometry/elevators'
import { useElevatorRide, selectElevatorFloor } from '../store/useElevatorRide'

function CarPanel() {
  const ride = useElevatorRide(s => s.ride)
  if (!ride) return null
  const { id, phase, stop, target } = ride
  const travelling = phase === 'moving' || phase === 'closing'
  return <section className="drawer car-panel" aria-label="电梯楼层按键板" data-elevator={id} data-phase={phase} data-stop={stop}>
    <h2>{id === 'passenger' ? '人员客梯' : '3 t 重载货梯'}</h2>
    <output aria-live="polite">{travelling ? '前往 ' + target : stop + ' 层'} · {{
      closed: '门已关闭', opening: '开门中', open: '已开门', closing: '关门中', moving: '运行中',
    }[phase]}</output>
    <div className="floor-keys">{elevatorSpecs[id].stops.map(floor => (
      <button key={floor} aria-pressed={floor === (travelling ? target : stop)}
        disabled={phase !== 'open' || floor === stop}
        onClick={() => selectElevatorFloor(floor)}>{floor}</button>
    ))}</div>
  </section>
}

export function WalkHud() {
  const floor = useShelterStore((s) => s.lastFloor)
  const send = (detail: object) => window.dispatchEvent(new CustomEvent('ars-walk', { detail }))
  return (
    <>
      <span className="crosshair" /><CarPanel /><output id="elevator-call" aria-live="polite" />
      <output id="equipment-sight" className="equipment-sight" />
      <div className="walk-map">
        <svg viewBox="-18 -14 36 28" aria-label="当前层平面与朝向">
          {roomsOn(floor).map((room) => {
            const r = footprint(room.bounds)
            return <rect key={room.id} x={r.x0} y={r.z0} width={r.w} height={r.d} />
          })}
          <g id="map-heading">
            <path d="M0 0 -1.7 3.6 1.7 3.6Z" />
            <circle r=".6" />
          </g>
        </svg>
        <span>
          {floor}　<span id="walk-altitude" />
        </span>
      </div>
      <button
        id="pressure-control"
        hidden
        className="pressure-control"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          send({ hold: true })
        }}
        onLostPointerCapture={() => send({ hold: false })}
      >
        <svg viewBox="0 0 36 24" width="36">
          <path d="M3 19a15 15 0 0 1 30 0" fill="none" stroke="currentColor" />
          <g id="pressure-hand">
            <path d="M18 18v-12" stroke="currentColor" />
          </g>
        </svg>
        <span id="pressure-text" />
      </button>
      <button
        className="joystick"
        aria-label="触屏移动摇杆"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          const r = e.currentTarget.getBoundingClientRect()
          send({
            x: Math.max(-1, Math.min(1, (2 * (e.clientX - r.left)) / r.width - 1)),
            y: Math.max(-1, Math.min(1, (2 * (e.clientY - r.top)) / r.height - 1)),
          })
        }}
        onLostPointerCapture={() => send({ x: 0, y: 0 })}
      >
        移动
      </button>
    </>
  )
}
