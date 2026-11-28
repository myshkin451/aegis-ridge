import { ShiftClock } from './ShiftClock'
import { memo, useEffect, useState } from 'react'
import { useLockdownTour } from '../store/useLockdownTour'
import { defaultBlueprint } from '../data/defaultBlueprint'
import { FLOOR_ORDER } from '../data/floors'
import type { MepNetwork } from '../data/mepNetwork'
import { useShelterStore } from '../store/useShelterStore'
import {
  inspectLocation,
  leaveRouteOverview,
  isolateTarget,
  requiresLockdown,
  scenarioNames,
  useOperationsStore,
  type Scenario,
} from '../store/useOperationsStore'
import '../styles/operations.css'

const rooms = new Map(defaultBlueprint.rooms.map((r) => [r.id, r]))

function LockdownTourControl() {
  const active = useLockdownTour((s) => s.run !== null)
  const toggle = useLockdownTour((s) => s.toggle)
  return (
    <button aria-label="跟拍封锁编排" aria-pressed={active} onClick={toggle}>
      {active ? '退出跟拍' : '跟拍'}
    </button>
  )
}

function enterCommand() {
  const view = useShelterStore.getState()
  useOperationsStore.getState().open(null)
  view.focusRoom('b2_command')
  view.selectAnchor(0)
  view.enterRoom()
}

export function ConditionField() {
  const scenario = useOperationsStore((s) => s.scenario)
  const seconds = useOperationsStore((s) => s.lockdownSeconds)
  const started = useOperationsStore((s) => s.lockdownStartedAt)
  const time = useShelterStore((s) => s.time)
  useEffect(() => {
    if (started === null) return
    const sync = () => useOperationsStore.getState().advance(performance.now())
    const timer = window.setInterval(sync, 160)
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [started])
  return (
    <div className="condition">
      <button aria-label="站内时钟" title="24 小时时间轴与声景" popoverTarget="station-clock" className="clock-trigger">
        {seconds === 30 ? '封锁 · 第 1 天' : started !== null ? '封锁 ' + seconds + ' s' : time} ▾
      </button>
      <div popover="auto" id="station-clock"><ShiftClock /></div>
      <select
        value={scenario}
        aria-label="工况"
        onChange={(e) => useOperationsStore.getState().setScenario(e.target.value as Scenario)}
      >
        {Object.entries(scenarioNames).map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}

const TargetOptions = memo(function TargetOptions({ network }: { network: MepNetwork | null }) {
  return (
    <>
      {FLOOR_ORDER.map((floor) => (
        <optgroup label={floor + ' · 设备'} key={floor}>
          {defaultBlueprint.rooms
            .filter((r) => r.floorId === floor)
            .flatMap((r) =>
              r.equipment.map((unit) => (
                <option key={unit.tagCode} value={unit.tagCode}>
                  {unit.tagCode}　{unit.name}
                </option>
              )),
            )}
        </optgroup>
      ))}
      {FLOOR_ORDER.map((floor) => (
        <optgroup label={floor + ' · 管段'} key={floor}>
          {network?.edges
            .filter((e) => e.floor === floor)
            .map((e) => (
              <option value={e.id} key={e.id}>
                {e.id}　{e.medium}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  )
})

export function OperationsSheet() {
  const state = useOperationsStore()
  const { rows, maintenance } = state.report
  const routeOverview = useShelterStore((s) => s.routeOverview)
  const selectedEquipment = useShelterStore((s) => s.equipmentTag)
  const selectedEdge = useShelterStore((s) => s.waterTrace)
  const network = useShelterStore((s) => s.mepNetwork)
  const [choice, setChoice] = useState('')
  const [detail, setDetail] = useState<string | null>(null)
  const target =
    choice ||
    state.isolatedId ||
    selectedEdge ||
    selectedEquipment ||
    defaultBlueprint.rooms[0].equipment[0].tagCode
  const diagnostic = rows.find((r) => r.id === detail)
  const maintenanceMode = state.panel === 'maintenance'
  useEffect(() => {
    if (state.isolatedId) setChoice(state.isolatedId)
  }, [state.isolatedId])
  return (
    <section
      className="drawer room-sheet operations-sheet"
      data-testid="operations-sheet"
      aria-label={maintenanceMode ? '隔离检修数据表' : '工程体检数据表'}
    >
      <header className="sheet-head">
        <div>
          <span className="sheet-code">{maintenanceMode ? 'M–402' : 'M–401'}</span>
          <h2>{maintenanceMode ? '模拟隔离检修' : '工程体检'}</h2>
        </div>
        <button aria-label="关闭工程面板" onClick={() => state.open(null)}>
          ×
        </button>
      </header>
      <label className="people-control">
        <span>
          入住人数 <span className="people-value">{state.people} 人</span>
        </span>
        <input
          type="range"
          min="5"
          max="14"
          step="1"
          value={state.people}
          aria-label="入住人数"
          onChange={(e) => state.setPeople(+e.target.value)}
        />
        <span className="scale-labels">
          <small>5</small>
          <small>常住 10</small>
          <small>扩员 14</small>
        </span>
      </label>
      {requiresLockdown(state.scenario) && (
        <div className="lock-controls">
          <span>
            {state.lockdownSeconds === 30 ? '封锁就位' : '封锁编排'}　{state.lockdownSeconds} / 30 s
          </span>
          {state.lockdownSeconds < 30 ? (
            <button aria-label="快进封锁" onClick={state.skip}>
              快进
            </button>
          ) : (
            <button aria-label="重播封锁" onClick={() => state.setScenario(state.scenario)}>
              重播
            </button>
          )}
          <LockdownTourControl />
          <button aria-label="重置封锁" onClick={() => state.setScenario('normal')}>
            重置
          </button>
        </div>
      )}
      {maintenanceMode ? (
        <>
          <label>
            设备位号 / 管段编号
            <select aria-label="检修目标" value={target} onChange={(e) => setChoice(e.target.value)}>
              <TargetOptions network={network} />
            </select>
          </label>
          <div className="sheet-actions">
            <button aria-label="隔离所选目标" onClick={() => isolateTarget(target)}>
              隔离所选目标
            </button>
            {state.isolatedId && (
              <button aria-label="结束隔离检修" onClick={() => state.isolate(null)}>
                结束隔离检修
              </button>
            )}
          </div>
          {maintenance && (
            <article aria-live="polite" className="maintenance-result">
              <h3>
                <i data-status={maintenance.status}>{maintenance.status}</i> {maintenance.label}
              </h3>
              <p>{maintenance.summary}</p>
              <dl>
                {[
                  [
                    '受影响房间',
                    maintenance.affectedRoomIds.map((id) => rooms.get(id)?.name ?? id).join('、') || '无',
                  ],
                  ['隔离管段', maintenance.isolatedEdgeIds.join('、') || '无'],
                  ['备用管段', maintenance.backupEdgeIds.join('、') || '无'],
                  ['库内备件', maintenance.spare],
                  ['主修 / 副修', maintenance.crew],
                  [
                    '搬运路径',
                    maintenance.route.length
                      ? 'B1 仓库 → ' + (rooms.get(maintenance.roomId)?.name ?? maintenance.roomId)
                      : '无可用搬运路径',
                  ],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {maintenance.route.length > 1 && (
                <div className="sheet-actions">
                  <button
                    onClick={() =>
                      routeOverview
                        ? leaveRouteOverview()
                        : useShelterStore.getState().frameRoute(maintenance.route)
                    }
                  >
                    {routeOverview ? '返回检修位置' : '查看全程搬运'}
                  </button>
                </div>
              )}
              <div className="maintenance-key">
                <span>━ 隔离</span>
                <span>━ 接管</span>
                <span>┄ 搬运</span>
              </div>
            </article>
          )}
        </>
      ) : (
        <>
          <div className="result-summary">
            {(['FAIL', 'WARN', 'PASS'] as const).map((status) => (
              <span key={status} data-status={status}>
                {status}　{rows.filter((r) => r.status === status).length}
              </span>
            ))}
          </div>
          <div className="diagnostic-rows" role="group" aria-label="工程校核结果">
            {rows.map((row) => (
              <div key={row.id}>
                <button
                  data-diagnostic={row.id}
                  aria-pressed={detail === row.id}
                  onClick={() => {
                    setDetail(row.id)
                    inspectLocation(row)
                  }}
                >
                  <i data-status={row.status}>{row.status}</i>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </button>
                {detail === row.id && diagnostic && (
                  <p className="diagnostic-detail">
                    {diagnostic.detail}
                    <br />
                    {rooms.get(row.roomId)?.name}　{row.equipmentTag ?? row.edgeId}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <footer className="sheet-actions">
        <button aria-label="进入 B2 中控室" onClick={enterCommand}>
          进入 B2 中控室 ↗
        </button>
      </footer>
    </section>
  )
}

export function openMaintenance(id: string) {
  const state = useOperationsStore.getState()
  state.open('maintenance')
  isolateTarget(id)
}
