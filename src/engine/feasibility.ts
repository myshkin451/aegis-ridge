import { defaultBlueprint } from '../data/defaultBlueprint'
import { FLOORS } from '../data/floors'
import { footprint } from '../geometry/coords'
import type { EquipmentUnit, RoomInstance } from '../types/shelter'
import {
  design,
  display as f,
  duration,
  isSealed,
  marginStatus,
  type Diagnostic,
  type OperatingPoint,
} from './model'

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const essentialRooms = new Set([
  'b4_cbrn_hvac',
  'b3_water',
  'b4_drainage',
  'b4_switchgear',
  'b2_command',
  'b2_medical',
  'b3_coldvault',
])
const area = (e: EquipmentUnit) => e.moduleSizeM[0] * e.moduleSizeM[2]

export function evaluateFeasibility(
  point: OperatingPoint,
  rooms: RoomInstance[] = defaultBlueprint.rooms,
  a = design,
  unavailable: string[] = [],
) {
  if (
    !Number.isInteger(point.people) ||
    point.people < 5 ||
    point.people > 14 ||
    !Number.isFinite(point.hour)
  )
    throw new RangeError('入住人数须为 5–14 的整数，时刻须为有限数')
  const offline = new Set([...unavailable, point.isolatedId])
  const installed = rooms.flatMap((room) =>
    room.equipment.filter((e) => !offline.has(e.tagCode)).map((e) => ({ room, e })),
  )
  const units = installed.map((x) => x.e)
  const by = (prefix: string) => units.filter((e) => e.tagCode.startsWith(prefix))
  const sealed = isSealed(point),
    cryo = point.scenario === 'cryo',
    people = point.people
  const hour = ((point.hour % 24) + 24) % 24
  const lit = hour >= 20 || hour < 12
  const leaf = by('GR-331'),
    staple = units.filter(e => e.cropKind === 'staple' || e.tagCode.startsWith('GR-332'))
  const leafArea = sum(leaf.map(area)) * a.trayUseFraction * a.leafLayers
  const stapleArea = sum(staple.map(area)) * a.trayUseFraction * a.stapleLayers
  const proteinArea = sum([...by('AQ-341'), ...by('MC-342'), ...by('PB-343')].map(area))
  const ratedKcal =
    leafArea * a.leafKcalM2Day + stapleArea * a.stapleKcalM2Day + proteinArea * a.proteinKcalM2Day
  const kcalDemand = people * 2300
  const grainEnergyKcal = by('CS-321').length * a.grainStockKg * a.grainKcalKg
  const oxygenDemand = people * 0.84
  const grossPhoto =
    (leafArea + stapleArea) * a.netOxygenKgM2LightHour + by('PB-343').length * a.algaeOxygenKgLightHour
  const oxygenNameplate = by('TK-301').length ? sum(units.map((e) => e.o2RateKgPerDay)) : 0
  // With no installed cylinder compressor, daytime surplus cannot refill the reserve.
  const litElectroRate = Math.min(oxygenNameplate, Math.max(0, oxygenDemand - grossPhoto * 24))
  const darkElectroRate = Math.min(oxygenNameplate, oxygenDemand)
  const requestedElectroRate = sealed ? (lit ? litElectroRate : darkElectroRate) : 0
  const bottleStock = by('OX-454').length * a.oxygenBottleKg
  const co2Load = oxygenDemand * (44 / 32) * a.respiratoryQuotient
  // A dedicated combustion path and an open atmosphere are both required.
  const chpInterlocked = sealed || point.scenario === 'bio' || point.scenario === 'fallout'
  const availableChp = chpInterlocked
    ? []
    : by('CHP-').filter(
        (e) =>
          e.requiresExternalExhaust &&
          ['combustion-air', 'combustion-exhaust'].every((kind) =>
            e.servicePorts?.some((p) => p.system === kind && p.connectsTo),
          ),
      )
  const sources = units.filter((e) => e.redundantGroup === 'primary-source')
  const solar = sealed ? 0 : a.pvKwp * Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12)) * (cryo ? 0.15 : 1)
  const wind = sealed || cryo ? 0 : a.windKw * a.windCapacityFactor
  const chpCapacity = sum(availableChp.map((e) => e.generatedPowerKw))
  const singleDuty = new Set(['supply-air', 'cold-room', 'sump-lift'])
  const seen = new Set<string>()
  let load = 0,
    belowLoad = 0,
    essential = 0,
    onlineCriticalLoad = 0
  for (const { room, e } of installed) {
    let ratio = 1
    if (e.redundantGroup && singleDuty.has(e.redundantGroup)) {
      if (seen.has(e.redundantGroup)) ratio = 0
      seen.add(e.redundantGroup)
    }
    if (e.cropKind || e.tagCode.startsWith('GR-33')) ratio = Number(lit)
    if (e.tagCode === 'PB-343') ratio = Number(lit)
    if (e.o2RateKgPerDay > 0) ratio = oxygenNameplate ? requestedElectroRate / oxygenNameplate : 0
    if (e.tagCode.startsWith('CHP-')) ratio = 0 // Auxiliary input is charged only during dispatch below.
    const input = ratio * e.inputPowerKw
    load += input
    if (room.floorId.startsWith('B')) belowLoad += input
    if (essentialRooms.has(room.id)) {
      essential += Math.max(input, e.o2RateKgPerDay > 0 ? e.inputPowerKw : 0)
      onlineCriticalLoad += input
    }
  }
  const reactorCapacity = sum(sources.map((e) => e.generatedPowerKw))
  const peakUnit = Math.max(0, ...sources.map((e) => e.generatedPowerKw))
  const chpAux = sum(availableChp.map((e) => e.inputPowerKw))
  const runChp = load > solar + wind + reactorCapacity && chpCapacity > 0
  if (runChp) {
    load += chpAux
    belowLoad += chpAux
  }
  const nPlusOne = reactorCapacity - peakUnit + solar + wind + chpCapacity - (runChp ? 0 : chpAux)
  let needed = Math.max(0, load - solar - wind),
    waste = 0,
    reactorOutput = 0,
    chpOutput = 0,
    chpWaste = 0
  for (const e of [...sources, ...availableChp]) {
    const output = Math.min(needed, e.generatedPowerKw)
    needed -= output
    const eff = e.thermalEfficiency ?? 0
    const rejection = output === 0 ? 0 : eff > 0 && eff <= 1 ? (output * (1 - eff)) / eff : Infinity
    if (e.redundantGroup === 'primary-source') {
      reactorOutput += output
      waste += rejection
    } else {
      chpOutput += output
      chpWaste += rejection
    }
  }
  const batteryEnergy = sum(units.map(e => e.storageKwh ?? (e.tagCode.startsWith('BAT-431') ? a.batteryKwh : 0))) * a.batteryUsable * a.inverterEfficiency
  const batteryHours = duration(batteryEnergy, essential)
  const inverterKw = sum(units.map(e => e.inverterKw ?? (e.tagCode.startsWith('BAT-431') ? a.batteryInverterKw : 0)))
  const batteryDraw = batteryEnergy > 0 ? Math.min(needed, inverterKw) : 0
  const inverterLossKw = batteryDraw > 0 ? batteryDraw / a.inverterEfficiency - batteryDraw : 0
  const deficitHours = duration(batteryEnergy, batteryDraw)
  const unmet = needed - batteryDraw
  // Under insufficient supply, reserve power first for the life-support circuits.
  // The remaining loads share the available duty cycle. Report average delivered
  // service, not the plant nameplate. Every priority room is underground.
  const delivered = load - unmet
  const criticalFraction = onlineCriticalLoad > 0 ? Math.min(1, delivered / onlineCriticalLoad) : 1
  const otherLoad = load - onlineCriticalLoad
  const otherFraction =
    otherLoad > 0 ? Math.min(1, Math.max(0, delivered - onlineCriticalLoad) / otherLoad) : 1
  const servedBelowLoad =
    onlineCriticalLoad * criticalFraction + (belowLoad - onlineCriticalLoad) * otherFraction
  const kcal = ratedKcal * otherFraction
  const grainDays = duration(grainEnergyKcal, kcalDemand - kcal)
  const grainOnlyDays = duration(grainEnergyKcal, kcalDemand)
  const photoOxygen = grossPhoto * 16 * otherFraction
  const electroCapacity = oxygenNameplate * criticalFraction
  const electroOxygen = sealed ? ((litElectroRate * 16 + darkElectroRate * 8) / 24) * criticalFraction : 0
  const oxygenMargin = electroCapacity + photoOxygen - oxygenDemand
  const darkDeficit = (Math.max(0, oxygenDemand - darkElectroRate * criticalFraction) * 8) / 24
  const lightDeficit =
    (Math.max(0, oxygenDemand - grossPhoto * 24 * otherFraction - litElectroRate * criticalFraction) * 16) /
    24
  const bottleDrawKgDay = darkDeficit + lightDeficit
  const oxygenDays = duration(bottleStock, bottleDrawKgDay)
  const co2Capture = by('CB-453').length * a.co2RemovalKgDay * criticalFraction
  const totalHeat = servedBelowLoad + inverterLossKw + waste + chpWaste + people * 0.12
  const heatCapacity = sum(units.map((e) => e.heatRejectionKw)) * otherFraction
  const outdoor = cryo ? -60 : -3
  const snowDemand = ((cryo ? a.stormSnowKgHour : a.snowKgHour) * a.snowFusionKjKg) / 3600
  const greenhouseDemand = Math.max(0, a.greenhouseSetpointC - outdoor) * a.greenhouseUaKwK
  const surfaceCapacity = sealed
    ? 0
    : Math.min(
        heatCapacity,
        (offline.has('greenhouse-loop') ? 0 : greenhouseDemand) + (offline.has('snow-loop') ? 0 : snowDemand),
      )
  const sink = sealed ? (offline.has('borefield') ? 0 : heatCapacity) : surfaceCapacity
  const heatMargin = sink - totalHeat
  const rockRiseKDay = sealed
    ? (Math.min(totalHeat, sink) * 86400) / (a.rockVolumeM3 * a.rockDensityKgM3 * a.rockHeatKjKgK)
    : 0
  const rockDays = !sealed ? Infinity : heatMargin < 0 ? 0 : duration(a.rockDeltaK, rockRiseKDay)
  const bath = rooms.find((r) => r.id === 'b2_bath_laundry')?.dailyWaterBudget
  const grey = bath ? (bath.greyLitres * people) / bath.people : 0,
    black = bath ? (bath.blackLitres * people) / bath.people : 0
  const domesticOther = people * a.householdOtherLitres
  const cropWater = (leafArea + stapleArea) * a.cropWaterLitresM2Day
  // Electrolysis removes water from the liquid loop. No credit for downstream H₂ recombination.
  const electroWater = (electroOxygen * 18) / 16
  const works = by('WT-302').length > 0 && criticalFraction > 0
  const recovers = works && !offline.has('recovery')
  const netWater =
    (grey + domesticOther) * (1 - (recovers ? a.greyRecovery * criticalFraction : 0)) +
    black * (1 - (recovers ? a.blackRecovery * criticalFraction : 0)) +
    cropWater * (1 - (recovers ? a.condensateRecovery * criticalFraction : 0)) +
    electroWater
  const externalWater = !sealed && works && !offline.has('spring') ? a.springLitresDay : 0
  const storedWater = by('TK-301').length * a.waterTankLitres
  const waterDays = duration(storedWater, netWater)
  const volume = footprint(FLOORS.B2.bounds).area * FLOORS.B2.clearHeight
  const intakes = a.windFromWest ? ['westIntake', 'eastIntake'] : ['eastIntake', 'westIntake']
  const intake = sealed
    ? '站内循环'
    : ({ westIntake: '西进风口', eastIntake: '东进风口' }[
        intakes.find((id) => !offline.has(id)) as 'westIntake' | 'eastIntake'
      ] ?? '无可用进风口')
  const activeBank = by('AHU-451').length > 0 && !offline.has('b2-circulation') && intake !== '无可用进风口'
  const airFlow = activeBank ? a.filterFlowM3Hour * criticalFraction : 0
  const ach = airFlow / volume
  const pollution = { normal: 1, cryo: 1.4, bio: 3.5, fallout: 4 }[point.scenario]
  const exposure = pollution * airFlow * 24
  const hepaDays = activeBank
    ? duration((1 + a.hepaReplacements) * a.hepaHoldingGrams, exposure * a.filterDustGramsM3)
    : 0
  const carbonDays = activeBank
    ? duration((1 + a.carbonReplacements) * a.carbonHoldingGrams, exposure * a.carbonLoadGramsM3)
    : 0
  const kitRate = sum(
    units
      .filter((e) => e.inputPowerKw > 0 && e.serviceIntervalDays > 0)
      .map((e) => 1 / e.serviceIntervalDays),
  )
  const spareDays = duration(a.workshopKits, kitRate)
  const rows: Diagnostic[] = []
  function row(
    id: string,
    label: string,
    status: Diagnostic['status'],
    value: string,
    detail: string,
    roomId: string,
    equipmentTag?: string,
  ) {
    rows.push({ id, label, status, value, detail, roomId, equipmentTag })
  }
  row(
    'power',
    '电力 · N+1',
    marginStatus(nPlusOne, load),
    f(nPlusOne - load) + ' kW',
    '设备负荷 ' +
      f(load) +
      ' kW，停最大主机后可供 ' +
      f(nPlusOne) +
      ' kW。电池补缺 ' +
      f(batteryDraw) +
      ' kW，未供 ' +
      f(unmet) +
      ' kW。',
    'b4_reactor',
    'GEN-441A',
  )
  row(
    'battery',
    '储能 · 基本负荷',
    inverterKw < essential ? 'FAIL' : marginStatus(batteryHours, 48),
    f(batteryHours) + ' h',
    '维生母线 ' +
      f(essential) +
      ' kW，目标 48 h。可用 ' +
      f(batteryEnergy, 0) +
      ' kWh。' +
      (batteryDraw > 0
        ? '当前补缺 ' + f(batteryDraw) + ' kW，可持续 ' + f(deficitHours) + ' h。'
        : '当前无需放电。'),
    'b4_switchgear',
    'BAT-431A',
  )
  row(
    'heat',
    '排热余量',
    marginStatus(sink, totalHeat),
    f(heatMargin) + ' kWth',
    '地下获供 ' +
      f(servedBelowLoad) +
      '，堆侧 ' +
      f(waste) +
      '，CHP ' +
      f(chpWaste) +
      '，储能逆变 ' +
      f(inverterLossKw, 2) +
      '，代谢 ' +
      f(people * 0.12) +
      ' kW。可用热汇 ' +
      f(sink) +
      ' kW。',
    'b4_geothermal',
    'MH-421',
  )
  if (sealed)
    row(
      'rock',
      '岩体温升期限',
      marginStatus(rockDays, a.designDays),
      f(rockDays) + ' d',
      '等效岩体热容估算，每日升温 ' + f(rockRiseKDay, 3) + ' K；瞬时换热不足时可持续时间取 0。',
      'b4_geothermal',
      'MH-421',
    )
  row(
    'water',
    '断外源净水续航',
    bath && recovers && !offline.has('bath-supply') ? marginStatus(waterDays, a.designDays) : 'FAIL',
    f(waterDays) + ' d',
    '灰 / 黑水 ' +
      f(grey, 0) +
      ' / ' +
      f(black, 0) +
      ' L/d。净补给 ' +
      f(netWater) +
      '，山泉 ' +
      f(externalWater, 0) +
      ' L/d。',
    'b3_water',
    'WT-302',
  )
  row(
    'calories',
    '鲜食与主粮',
    marginStatus(kcal, kcalDemand),
    f((100 * kcal) / kcalDemand, 1) + '%',
    '自产 ' +
      f(kcal, 0) +
      ' / 需求 ' +
      f(kcalDemand, 0) +
      ' kcal/d。无鲜食时主粮可供 ' +
      f(grainOnlyDays / 365.25) +
      ' 年；' +
      (kcal >= kcalDemand ? '热量平衡无需动库。' : '每日缺口 ' + f(kcalDemand - kcal, 0) + ' kcal。'),
    'b3_hydroponics',
    'GR-332A',
  )
  row(
    'oxygen',
    '密闭供氧余量',
    bottleDrawKgDay > 0 && !bottleStock ? 'FAIL' : marginStatus(electroCapacity + photoOxygen, oxygenDemand),
    f(oxygenMargin, 2) + ' kg/d',
    '耗氧 ' +
      f(oxygenDemand, 2) +
      '，光合日净估算 ' +
      f(photoOxygen, 2) +
      '，电解额定 ' +
      f(electroCapacity, 2) +
      ' kg/d。' +
      (bottleDrawKgDay > 0
        ? '按光暗周期，氧瓶补 ' + f(bottleDrawKgDay, 2) + ' kg/d，可用 ' + f(oxygenDays) + ' d。'
        : '光暗周期均无需动用氧瓶。'),
    'b4_cbrn_hvac',
    'OX-452',
  )
  row(
    'co2',
    'CO₂ 捕集',
    marginStatus(co2Capture, co2Load),
    f(co2Capture - co2Load, 2) + ' kg/d',
    '人员呼吸产生 ' + f(co2Load, 2) + ' kg/d；未抵扣日间作物吸收。',
    'b4_cbrn_hvac',
    'CB-453',
  )
  const filterDays = Math.min(carbonDays, hepaDays)
  row(
    'filters',
    '循环风与滤芯',
    marginStatus(Math.min(ach / a.minAch, filterDays / a.designDays), 1),
    f(filterDays) + ' d',
    intake +
      '。居住层等效循环 ' +
      f(ach, 2) +
      ' ACH，高效滤芯 ' +
      f(hepaDays) +
      ' d，炭盒 ' +
      f(carbonDays) +
      ' d。',
    'b4_cbrn_hvac',
    'AHU-451A',
  )
  row(
    'spares',
    '工坊保养耗材',
    marginStatus(spareDays, a.designDays),
    f(spareDays) + ' d',
    '按设备保养间隔、每次一套通用耗材估算，备库 ' + a.workshopKits + ' 套。',
    'b1_warehouse',
  )
  return {
    rows,
    sealed,
    chpInterlocked,
    load,
    nPlusOne,
    solar,
    wind,
    chpCapacity,
    chpOutput,
    reactorOutput,
    batteryHours,
    belowLoad,
    servedBelowLoad,
    batteryDraw,
    inverterLossKw,
    deficitHours,
    batteryEnergy,
    unmet,
    waste,
    chpWaste,
    totalHeat,
    heatCapacity,
    surfaceCapacity,
    heatMargin,
    rockRiseKDay,
    rockDays,
    grey,
    black,
    electroWater,
    externalWater,
    netWater,
    waterDays,
    leafArea,
    stapleArea,
    kcal,
    kcalDemand,
    grainDays,
    grainOnlyDays,
    oxygenDemand,
    photoOxygen,
    lightHourOxygenKg: lit ? grossPhoto * otherFraction : 0,
    electroCapacity,
    electroOxygen,
    oxygenMargin,
    oxygenDays,
    bottleDrawKgDay,
    co2Load,
    co2Capture,
    ach,
    intake,
    hepaDays,
    carbonDays,
    spareDays,
  }
}
