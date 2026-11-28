import { useEffect } from 'react'
import { useOperationsStore, type Scenario } from '../store/useOperationsStore'

const scenarios = { normal: '日常晴天', cryo: '极寒暴雪', fallout: '全面封锁' } as const

export function ScenarioField() {
  const scenario = useOperationsStore(s => s.scenario)
  const started = useOperationsStore(s => s.lockdownStartedAt)
  useEffect(() => {
    if (started === null) return
    const sync = () => useOperationsStore.getState().advance(performance.now())
    const timer = window.setInterval(sync, 160)
    document.addEventListener('visibilitychange', sync)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync) }
  }, [started])
  return <select aria-label="情景" value={scenario === 'bio' ? 'fallout' : scenario}
    onChange={e => useOperationsStore.getState().setScenario(e.target.value as Scenario)}>
    {Object.entries(scenarios).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>
}

export function FortressStatus({ close }: { close: () => void }) {
  const { report: { feasibility: f }, scenario, lockdownSeconds: t, people, setScenario } = useOperationsStore()
  const closing = scenario !== 'normal' && t < 30
  const security = scenario === 'normal' ? '日常值守' : closing ? '防护设施就位中'
    : scenario === 'cryo' ? '暴雪防护就位' : '全面封锁就位'
  const sequence = t < 5 ? '场坪与入口' : t < 10 ? '车库门与气闸' : t < 15 ? '外墙百叶'
    : t < 20 ? '温室隔热板' : t < 25 ? '外部防护就位' : '应急照明与正压建立'
  const rows = [
    ['主能源与储能', f.unmet > 0.01 ? '供电受限' : f.batteryDraw > 0 ? '储能补电' : '主电源供电',
      '主机 ' + Math.round(f.reactorOutput) + ' kW · 可用储能 ' + Math.round(f.batteryEnergy) + ' kWh'],
    ['净水与农场自给', f.externalWater > 0 ? '山泉补水' : '储水供给',
      '农场供给每日所需热量的 ' + Math.round(100 * f.kcal / f.kcalDemand) + '%'],
    ['三防正压空气', f.ach <= 0 ? '送风暂停' : f.sealed ? '密闭内循环' : '过滤送风',
      '居住层换气 ' + f.ach.toFixed(1) + ' 次/小时'],
    ['战略物资储备', '主粮约 ' + (f.grainOnlyDays / 365.25).toFixed(1) + ' 年',
      '按满库、' + people + ' 人消耗估算，未计农场产出'],
    ['安防与封锁', security, closing ? sequence + ' · ' + t + ' / 30 秒'
      : t === 30 ? '车库门、百叶已闭合 · 应急照明已启用' : '车库门开启 · 外墙百叶收起'],
  ]
  return <section className="drawer fortress-status" aria-label="堡垒状态">
    <header className="sheet-head"><h2>堡垒状态</h2><button onClick={close} aria-label="关闭堡垒状态">×</button></header>
    <dl>{rows.map(([name, value, detail]) => <div key={name}><dt>{name}</dt>
      <dd><b>{value}</b><small>{detail}</small></dd></div>)}</dl>
    <button className="seal-action" onClick={() => setScenario(scenario === 'fallout' || scenario === 'bio' ? 'normal' : 'fallout')}>
      {scenario === 'fallout' || scenario === 'bio' ? '解除封锁' : '一键全面封锁'}
    </button>
  </section>
}
