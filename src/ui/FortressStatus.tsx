import { useEffect } from 'react'
import { fortressSupply } from '../data/fortressSupply'
import { useShelterStore } from '../store/useShelterStore'
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
  const { scenario, lockdownSeconds: t, people, setScenario, setPeople } = useOperationsStore()
  const time = useShelterStore(s => s.time)
  const supply = fortressSupply(scenario, people, Number(time.slice(0, 2)), t === 30)
  const closing = scenario !== 'normal' && t < 30
  const security = scenario === 'normal' ? '日常值守' : closing ? '防护设施就位中'
    : scenario === 'cryo' ? '暴雪防护就位' : '全面封锁就位'
  const sequence = t < 5 ? '场坪与入口' : t < 10 ? '车库门与气闸' : t < 15 ? '外墙百叶'
    : t < 20 ? '温室隔热板' : t < 25 ? '外部防护就位' : '应急照明与正压建立'
  const rows = [
    ['主能源与储能', supply.batteryMode ? '电池独立供电' : '柴油机组轮值',
      `负荷 ${supply.demandKw.toFixed(1)} kW · 当前可供 ${supply.availableKw.toFixed(1)} kW`],
    ['备用时长', supply.batteryMode ? `满电约 ${supply.batteryHours.toFixed(1)} 小时` : `满油约 ${Math.floor(supply.fuelDays)} 天`,
      supply.batteryMode ? `机组进排气关闭 · ${supply.batteryKwh} kWh 储能留底 20%`
        : `${supply.fuelLitres.toLocaleString()} L 油库 · 电池可接替 ${supply.batteryHours.toFixed(1)} 小时`],
    ['地热与空气', supply.batteryMode ? '地热供暖 · 空气内循环' : '地热供暖 · 过滤新风',
      `热泵用电 ${supply.geothermalInput.toFixed(1)} kW，已计入负荷`],
    ['净水与农场', supply.batteryMode ? '罐储净水' : '净水循环',
      `双罐满储 ${supply.waterLitres / 1000} m³ · 农场分时补光`],
    ['战略主粮', `满库约 ${supply.grainYears.toFixed(1)} 年`,
      `B1 干粮架与 B3 冷库共 ${(supply.grainKg / 1000).toFixed(2)} 吨 · 每人每日 0.6 kg`],
    ['安防与封锁', security, closing ? sequence + ' · ' + t + ' / 30 秒'
      : t === 30 ? '车库门、百叶已闭合 · 应急照明已启用' : '车库门开启 · 外墙百叶收起'],
  ]
  return <section className="drawer fortress-status" aria-label="堡垒状态">
    <header className="sheet-head"><h2>堡垒状态</h2><button onClick={close} aria-label="关闭堡垒状态">×</button></header>
    <label className="fortress-residents">常住人数 <select aria-label="常住人数" value={people}
      onChange={event => setPeople(Number(event.target.value))}>{[6, 7, 8].map(n => <option key={n} value={n}>{n} 人</option>)}</select></label>
    <dl>{rows.map(([name, value, detail]) => <div key={name}><dt>{name}</dt>
      <dd><b>{value}</b><small>{detail}</small></dd></div>)}</dl>
    <button className="seal-action" onClick={() => setScenario(scenario === 'fallout' || scenario === 'bio' ? 'normal' : 'fallout')}>
      {scenario === 'fallout' || scenario === 'bio' ? '解除封锁' : '一键全面封锁'}
    </button>
  </section>
}
