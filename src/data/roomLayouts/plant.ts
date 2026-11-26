import type { Point3 } from '../../types/shelter'
import { unit, type RoomLayout } from './schema'

const at = (name: string, x: number, z: number, target: Point3) => ({
  name,
  position: [x, 1.65, z] as Point3,
  target,
})

const waterTank = (suffix: string, z: number) =>
  unit('TK-301' + suffix, '不锈钢净水罐 ' + suffix, 'water', [-13.55, 0, z], [3.88, 2.84, 3.84], 1140, 0, {
    redundantGroup: 'potable-water',
    notes: '每罐有效容积 25,000 L。筒体内径约 3.60 m，有效液深 2.46 m。质量为空罐估算，满水另加约 25 t。',
  })

const growBed = (suffix: string, x: number, leaves: boolean) =>
  unit(
    (leaves ? 'GR-331' : 'GR-332') + suffix,
    (leaves ? '五层叶菜架 ' : '双层块茎主食床 ') + suffix,
    'agriculture',
    [x, 0, 6.25],
    [1.72, leaves ? 2.86 : 2.59, 9.1],
    leaves ? 480 : 600,
    leaves ? 5.9 : 6.6,
    {
      notes: leaves
        ? '五层浅根托盘；灯与循环泵额定合计 5.9 kW。补光时段 20:00–次日 12:00。'
        : '两层深基质床，留出块茎根区和冠层空间；补光与灌溉合计 6.6 kW，按 16 小时光周期排班。',
    },
  )

const source = (suffix: string, x: number) => {
  const output = 75,
    efficiency = 0.3
  return unit(
    'GEN-441' + suffix,
    '屏蔽能源模块 ' + suffix,
    'power',
    [x, 0, 7.55],
    [4.65, 2.86, 5.9],
    31500,
    2.4,
    {
      generatedPowerKw: output,
      thermalEfficiency: efficiency,
      heatKw: (output * (1 - efficiency)) / efficiency,
      redundantGroup: 'primary-source',
      notes:
        '项目概念机组的独立屏蔽舱。单机满载输出 75 kWe，按 30% 热电效率算得机侧余热 175 kW；两舱一用一备。',
    },
  )
}

const filterBank = (suffix: string, x: number) =>
  unit(
    'AHU-451' + suffix,
    '快拆过滤与送风机组 ' + suffix,
    'hvac',
    [x, 0, 8.5],
    [3.25, 2.37, 3.85],
    780,
    2.2,
    {
      redundantGroup: 'supply-air',
      notes: '一体式风柜，外部抽屉依次供预滤、高效过滤和吸附段检修。两套机组分别挂牌。',
    },
  )

const battery = (suffix: string, x: number) =>
  unit('BAT-431' + suffix, '分舱储能阵 ' + suffix, 'power', [x, 0, -8.05], [2.18, 2.78, 5.95], 9100, 1.2, {
    hasRunawayVent: true,
    servicePorts: [
      {
        id: 'BAT-431' + suffix + '-vent',
        system: 'battery-exhaust',
        floor: 'B4',
        position: [x, 2.68, -11],
        connectsTo: { floor: 'B4', position: [x, 3.35, -12] },
      },
    ],
    notes: '每列设计容量 1,000 kWh，包括柜间隔断、顶部独立事故排烟集管和监控辅机。功耗为该列辅助负荷。',
  })

const switchboard = (suffix: string, x: number) =>
  unit(
    'SW-432' + suffix,
    '低压母线及馈线柜 ' + suffix,
    'power',
    [x, 0, -3.63],
    [3.55, 2.33, 1.05],
    890,
    0.18,
    {
      redundantGroup: 'essential-bus',
      notes: '四格封闭开关柜。A、B 两列分别接入双路供电。',
    },
  )

const pumpPair = (suffix: string, z: number) =>
  unit('P-411' + suffix, '备用提升排水泵 ' + suffix, 'water', [-13.6, 0, z], [3.08, 1.57, 2.04], 260, 3.0, {
    redundantGroup: 'sump-lift',
    notes: '两台潜水泵分别设检修导轨、吊点和止回阀；常态优先自流外排。',
  })

export const plantLayouts: Record<string, RoomLayout> = {
  b3_water: {
    equipment: [
      waterTank('A', -9.7),
      waterTank('B', -5.72),
      unit('WT-302', '砂滤、反渗透与紫外净水撬', 'water', [-9.03, 0, -8.3], [1.32, 2.42, 5.65], 940, 3.3, {
        notes: '纵向检修撬集成砂滤立罐、膜壳和回水取样点。',
      }),
    ],
    cameraAnchors: [at('视镜与双罐', -10.95, -3.5, [-13.5, 1.35, -7.6])],
  },
  b3_foodproc: {
    equipment: [
      unit('FD-311', '磨面与榨油工作站', 'manufacturing', [-5.4, 0, -9.6], [3.35, 1.94, 2.15], 430, 3.7),
      unit('FD-312', '冻干与真空封装台', 'manufacturing', [-0.25, 0, -10.25], [2.9, 1.89, 2.02], 390, 3.2),
      unit('FV-313', '食品发酵罐', 'agriculture', [1.8, 0, -8.15], [1.53, 2.27, 1.54], 160, 0.44),
    ],
    cameraAnchors: [at('食品加工操作面', -2.15, -7.05, [-2.0, 1.08, -9.9])],
  },
  b3_coldvault: {
    equipment: [
      unit('CS-321', '密封主粮低温架', 'storage', [9, 0, -7.5], [3.22, 2.55, 5.3], 620, 0),
      unit('CS-322', '低温种子抽屉柜', 'storage', [14, 0, -6.5], [2.85, 1.98, 4.26], 480, 0.7),
      ...[10.1, 13.6].map((x, i) =>
        unit(
          'RF-323' + (i ? 'B' : 'A'),
          '冗余制冷机组 ' + (i ? 'B' : 'A'),
          'thermal',
          [x, 0, -10.85],
          [2.48, 1.88, 1.25],
          390,
          4.6,
          { redundantGroup: 'cold-room', notes: '独立压缩机、风机和换热器；按一用一备布置。' },
        ),
      ),
    ],
    cameraAnchors: [at('主粮与种子分区', 11.45, -3.9, [9.0, 1.35, -8.4])],
  },
  b3_hydroponics: {
    equipment: [
      growBed('A', -13.45, false),
      growBed('A', -9.43, true),
      growBed('B', -4.62, true),
      growBed('B', -0.56, false),
      unit('AG-333', '采收称量与样品登记台', 'agriculture', [-6.66, 0, 10.62], [2.3, 1.46, 1.26], 46, 0.025),
    ],
    cameraAnchors: [
      at('育苗架中轴', -7.0, 1.15, [-6.58, 1.35, 8.75]),
      at('玻璃中庭下的主食床', -11.38, 7.5, [-13.45, 1.25, 4.6]),
    ],
  },
  b3_aquaponics: {
    equipment: [
      ...[3.12, 8.0].map((z, i) =>
        unit(
          'AQ-341' + (i ? 'B' : 'A'),
          '循环养殖池 ' + (i ? 'B' : 'A'),
          'agriculture',
          [5.03, 0, z],
          [4.18, 1.55, 4.16],
          420,
          0.62,
          {
            vibrationIsolation: '循环泵弹性隔振基座及柔性接头',
            notes: '质量为空池估算。增氧和循环泵计入池组负荷，水泵采用弹性隔振基座及柔性接头。',
          },
        ),
      ),
      unit('MC-342', '独立控湿菌菇舱', 'agriculture', [9.63, 0, 8.8], [3.25, 2.69, 3.62], 560, 1.2),
      unit('PB-343', '螺旋藻管式光生物反应器', 'agriculture', [13.64, 0, 7.95], [2.7, 2.38, 4.44], 380, 1.6, {
        notes: '额定负荷包含循环与补光。产氧随生物量和光周期变化，未计入保障供氧能力。',
      }),
      unit('DG-344', '有机残料消化罐', 'agriculture', [13.68, 0, 2.8], [2.18, 2.55, 2.18], 260, 0.45),
    ],
    cameraAnchors: [
      at('循环水面', 8.8, 2.0, [4.9, 0.92, 5.8]),
      at('菌棚与藻管', 11.65, 4.75, [12.4, 1.44, 8.75]),
    ],
  },
  b4_drainage: {
    equipment: [
      pumpPair('A', -9.7),
      pumpPair('B', -6.08),
      unit('WP-412', '固废压实与封存机', 'manufacturing', [-9.65, 0, -9.88], [2.24, 2.57, 3.75], 1260, 5.5),
    ],
    cameraAnchors: [at('集水盖板与检修导轨', -11.67, -3.45, [-13.4, 0.9, -7.6])],
  },
  b4_geothermal: {
    equipment: [
      unit('MH-421', '地源回路供回水分集水器', 'thermal', [-4.55, 0, -10.35], [5.44, 2.28, 1.74], 480, 0.06, {
        heatRejectionKw: 167.2,
        servicePorts: [
          {
            id: 'MH-421-S',
            system: 'borefield-supply',
            floor: 'B4',
            position: [-6.95, 1.53, -10.1],
            connectsTo: { floor: 'B4', shaft: 'wet', position: [-7.55, 3.4, -5.6] },
          },
          {
            id: 'MH-421-R',
            system: 'borefield-return',
            floor: 'B4',
            position: [-6.65, 1.53, -10.1],
            connectsTo: { floor: 'B4', shaft: 'wet', position: [-7.25, 3.4, -5.6] },
          },
          {
            id: 'MH-421-H',
            system: 'surface-heating',
            floor: 'B4',
            position: [-2.25, 1.53, -10.1],
            connectsTo: { floor: 'B4', shaft: 'wet', position: [-6.65, 3.4, -5.6] },
          },
        ],
        notes:
          '设计分流总量 8 kg/s，供回水温差 5 K，按水比热 4.18 kJ/(kg·K) 可转移 167.2 kW。实际排热受井场及外部热汇限制。',
      }),
      unit('HP-422', '地源水水热泵撬', 'thermal', [1.36, 0, -9.22], [3.36, 1.98, 2.95], 1280, 23, {
        notes: '设计供热 92 kW，取电 23 kW，对应设计供热 COP 4.0；实际值取决于水温和部分负荷。',
      }),
    ],
    cameraAnchors: [at('分水器阀组', -2.23, -7.1, [-4.7, 1.29, -10.45])],
  },
  b4_switchgear: {
    equipment: [
      battery('A', 7.7),
      battery('B', 14.15),
      switchboard('A', 8.04),
      switchboard('B', 13.7),
      unit('ATS-433', '双电源自动转换柜', 'power', [11.0, 0, -10.73], [2.16, 2.24, 1.16], 510, 0.12),
    ],
    cameraAnchors: [
      at('双母线分列', 11.1, -4.6, [7.7, 1.72, -8.12]),
      at('事故排烟集管', 11.0, -8.3, [14.15, 2.29, -9.0]),
    ],
  },
  b4_reactor: {
    equipment: [
      source('A', -12.75),
      source('B', -5.95),
      unit('CHP-442', '独立进排气备用热电联产机', 'power', [-0.63, 0, 4.35], [3.46, 2.77, 5.6], 2600, 1.1, {
        generatedPowerKw: 60,
        thermalEfficiency: 0.32,
        heatKw: 127.5,
        requiresExternalExhaust: true,
        servicePorts: [
          {
            id: 'CHP-442-A',
            system: 'combustion-air',
            floor: 'B4',
            position: [-1.2, 2.6, 6.9],
            connectsTo: { floor: 'B4', position: [-1.2, 3.25, 12] },
          },
          {
            id: 'CHP-442-E',
            system: 'combustion-exhaust',
            floor: 'B4',
            position: [0.15, 2.6, 6.9],
            connectsTo: { floor: 'B4', position: [0.15, 3.55, 12] },
          },
        ],
        notes: '概念额定电出力 60 kWe，电效率 32%。127.5 kW 为回收前的非电功率；密闭工况禁用。',
      }),
    ],
    cameraAnchors: [
      at('双舱与联产机组', -7.1, 1.65, [-9.1, 1.25, 7.75]),
      at('独立进排气机罩', -3.05, 8.2, [-0.55, 1.67, 4.78]),
    ],
  },
  b4_cbrn_hvac: {
    equipment: [
      filterBank('A', 5.45),
      filterBank('B', 9.95),
      unit('OX-452', '闭环水电解制氧撬', 'hvac', [13.76, 0, 6.7], [2.48, 2.32, 3.74], 450, 3.0, {
        o2RateKgPerDay: 10.4,
        servicePorts: [
          {
            id: 'OX-452-H2',
            system: 'hydrogen-recovery',
            floor: 'B4',
            position: [14.85, 2.15, 7.75],
            connectsTo: { floor: 'B4', position: [16, 3.48, 7.75] },
          },
        ],
        heatKw: 0.85,
        notes:
          '连续满负荷估算。按 55 kWh/kg H₂、氧氢质量比约 7.94 计算，3 kW 对应约 10.4 kg O₂/d。液态水、高位热值基准下，设备废热约 0.85 kW；干燥、压缩与储气损失另计。',
      }),
      unit('CB-453', '二氧化碳吸附塔', 'hvac', [5.28, 0, 2.65], [2.54, 2.59, 2.37], 490, 1.5, {
        servicePorts: [
          { id: 'CB-453-RA', system: 'return-air-co2', floor: 'B4', position: [5.28, 2.41, 2.65] },
        ],
      }),
      unit('OX-454', '应急氧瓶汇流排', 'hvac', [13.94, 0, 2.3], [2.51, 2.05, 1.65], 530, 0, {
        notes: '钢瓶质量为空瓶组估计。汇流排用于供氧缓冲，持续制氧量为零。',
      }),
    ],
    cameraAnchors: [
      at('滤箱抽屉及旁路检修面', 8.77, 2.2, [7.27, 1.33, 8.6]),
      at('水电解与氧瓶组', 11.25, 4.05, [13.75, 1.35, 5.1]),
    ],
  },
}
