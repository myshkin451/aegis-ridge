import type { Point3 } from '../../types/shelter'
import { deconInstrument } from '../../geometry/deconGauge'
import { unit, type RoomLayout } from './schema'

const anchor = (name: string, x: number, z: number, target: Point3) => ({
  name,
  position: [x, 1.65, z] as Point3,
  target,
})
const bounds = (center: Point3, size: Point3) => ({ center, size })

function planter(tag: string, x: number) {
  return unit(tag, '高山植物观测床', 'agriculture', [x, 0, 2.2], [1.53, 1.56, 4.7], 860, 0.075, {
    notes: '基质、植物与蓄水在内的运行质量。支路泵额定输入 75 W。',
  })
}
function surveyVehicle(tag: string, z: number) {
  return unit(tag, '电动全地形外业车', 'storage', [-13.4, 0, z], [2.04, 1.94, 3.78], 925, 3.3, {
    notes: '停放充电时车载充电器交流输入上限 3.3 kW，整备质量 925 kg。',
    heatKw: 0.27,
  })
}
function storageRack(tag: string, x: number) {
  const provisions = tag.endsWith('A') || tag.endsWith('B')
  return unit(tag, provisions ? '密封干粮周转箱架' : '四层满载备件架', 'storage', [x, 0, 7.1], [1.8, 2.73, 7.4], 1650, 0, {
    grainKgPerBin: provisions ? 40 : undefined,
    notes: '8 列 × 4 层周转箱。质量含架体与模拟库存，空架设计质量 210 kg。',
  })
}
function agv(tag: string, x: number) {
  return unit(tag, '低台搬运 AGV 与充电位', 'storage', [x, 0, -10.35], [1.66, 1.08, 2.05], 365, 1.2, {
    heatKw: 0.14,
    notes: '设备处于停靠状态，功率为充电器的额定输入。',
  })
}

export const upperLayouts: Record<string, RoomLayout> = {
  l2_observatory: {
    equipment: [
      unit('TEL-201', '光学观测台与赤道仪', 'comms', [-7.7, 0, 3.15], [2.4, 2.75, 2.3], 175, 0.12),
      unit('MET-202', '气象与地震监测台', 'comms', [-6.5, 0, -8.55], [5.5, 1.7, 1.16], 210, 0.78),
      unit('MAP-203', '测绘图与样本查阅台', 'comms', [-3.3, 0, 3.43], [2.7, 1.2, 1.26], 100, 0.012),
    ],
    cameraAnchors: [
      anchor('向南观察光学台', -5.25, 0.25, [-7.7, 1.55, 3.15]),
      anchor('气象值班席', -7.3, -5.65, [-6.5, 1.12, -8.55]),
    ],
  },
  l2_greenhouse: {
    equipment: [
      planter('BOT-211A', 4.2),
      planter('BOT-211B', 9.8),
      unit('SOL-212', '屋顶太阳光采集与光纤耦合器', 'comms', [9.5, 3.13, 4], [0.62, 0.46, 0.62], 42, 0.025, {
        notes: '净高内为耦合箱，屋脊上方为同轴安装的透镜阵列，电力仅供跟踪机构。',
      }),
      unit('POT-213', '植物标本记录台', 'agriculture', [8.5, 0, -8.35], [3.05, 1.25, 1.25], 72, 0.018),
    ],
    cameraAnchors: [anchor('种植池与屋脊采光', 7.5, 0.1, [9.5, 1.45, 3.8])],
  },
  l1_garage: {
    equipment: [
      surveyVehicle('ATV-101A', 3.55),
      surveyVehicle('ATV-101B', -2.35),
      unit('HOI-102', '3 t 桥式龙门行车', 'manufacturing', [-7.1, 0, -4.05], [9.5, 3.59, 6.9], 2100, 5.5, {
        notes: '3,000 kg 为起重量。支柱立于吊装区四角，横跨货梯井口的桥架下保留净空。',
        collisionBoxes: [
          ...[-4.54, 4.54].flatMap((x) => [-3.22, 3.22].map((z) => bounds([x, 1.63, z], [0.32, 3.26, 0.32]))),
          bounds([0, 3.31, 0], [9.45, 0.52, 0.83]),
          bounds([2.96, 2.89, 0], [0.64, 0.64, 0.62]),
        ],
      }),
      unit('PLW-103', '快换式除雪铲', 'manufacturing', [-14, 0, -7.55], [2.6, 0.87, 1.55], 240, 0),
    ],
    cameraAnchors: [anchor('两列车位与吊装桥', -8.1, 5.95, [-10.65, 1.22, -1.15])],
  },
  l1_vestibule: {
    equipment: [
      unit('AIR-111', '双门互锁压差与状态盘', 'hvac', [3.35, 0, 6.45], [0.75, 2.1, 1.1], 73, 0.16),
      unit('PPE-112', '外勤备勤更衣柜组', 'storage', [0.65, 0, -8.73], [4.2, 2.18, 0.86], 175, 0.08),
      unit('DRY-113', '工靴烘干与换鞋凳', 'thermal', [2.7, 0, 1.22], [1.42, 1.18, 1.05], 38, 0.48),
    ],
    cameraAnchors: [anchor('互锁双门之间', 0.35, 5.85, [3.35, 1.48, 6.45])],
  },
  l1_lobby: {
    equipment: [
      unit('GEO-121', '山脊岩性与地质剖面展台', 'comms', [9.1, 0, -7.65], [6, 2.38, 1.55], 315, 0.065),
      unit('WTH-122', '气象观测仪器互动展台', 'comms', [10.7, 0, 2.05], [3.25, 1.95, 1.48], 140, 0.095),
      unit('VIS-123', '访客登记与图册台', 'comms', [6, 0, 5.45], [2.35, 1.3, 1.18], 88, 0.06),
    ],
    cameraAnchors: [
      anchor('地质展墙', 7.5, -3.45, [9.1, 1.28, -7.65]),
      anchor('风速仪与访客席', 8, 4.8, [10.7, 1.3, 2.05]),
    ],
  },
  b1_decon: {
    equipment: [
      unit('DEC-101', '三级清洗喷淋拱门', 'water', [-12.05, 0, -8.55], [2.55, 2.68, 4.65], 590, 3.6, {
        collisionBoxes: [-1.11, 1.11].map((x) => bounds([x, 1.34, 0], [0.3, 2.68, 4.61])),
        notes: '拱门中央的通行宽度为 1.92 m。集液踏板与地面齐平。',
      }),
      unit('SUM-102', '回收液封闭缓冲槽', 'water', [-9.25, 0, -10.15], [1.5, 1.65, 2.18], 450, 0.75),
    ],
    cameraAnchors: [
      anchor('沿拱门纵轴', -12.05, -4.3, [-12.05, 1.42, -9.7]),
      anchor('门旁压差表', deconInstrument.centre[0] - 0.11, deconInstrument.centre[2] - 1.02, deconInstrument.centre),
    ],
  },
  b1_logistics: {
    equipment: [
      agv('AGV-111A', -6.3),
      agv('AGV-111B', -3.65),
      agv('AGV-111C', -1.05),
      unit('SCL-112', '称重与条码扫描台', 'manufacturing', [2.18, 0, -8.8], [1.72, 2.18, 2.1], 170, 0.19),
    ],
    cameraAnchors: [anchor('充电位列阵', -1.9, -7.5, [-4.15, 0.58, -10.6])],
  },
  b1_tactical: {
    equipment: [
      unit('UAV-121', '外业测绘无人机坞', 'comms', [11.35, 0, -10.1], [6, 1.71, 2.2], 255, 1.8, {
        notes: '民用测绘机和停靠充电台，功率对应同时充电。',
        heatKw: 0.21,
      }),
      unit('INS-122', '野外地震仪与气象仪保管架', 'comms', [8.1, 0, -7.55], [2.2, 2.35, 1.16], 170, 0.09),
      unit('KIT-123', '防寒外套与样本箱保养柜', 'storage', [14.15, 0, -5], [2.55, 2.18, 0.86], 125, 0.08),
    ],
    cameraAnchors: [anchor('测绘无人机交接', 11.15, -5.1, [11.35, 1.12, -10.1])],
  },
  b1_warehouse: {
    equipment: [
      storageRack('RCK-131A', 2.4),
      storageRack('RCK-131B', 5.35),
      storageRack('RCK-131C', 10.55),
      storageRack('RCK-131D', 13.65),
      unit('PAL-132', '低位周转手车', 'storage', [13, 0, 1.6], [1.7, 1.13, 1.25], 67, 0),
    ],
    cameraAnchors: [anchor('备件库中巷道', 8, 2.05, [6.75, 1.48, 8.2])],
  },
  b1_workshop: {
    equipment: [
      unit('REC-141', '废料回收与分选机', 'manufacturing', [-5.75, 0, 2.15], [2.85, 2.34, 2.65], 890, 7.5, {
        vibrationIsolation: '惯性基座与弹簧减振器',
        notes: '惯性基座下设弹簧减振器，进出料连接留柔性余量。吊轨西侧卸料后，经南侧空位转运至料斗。',
      }),
      unit('CNC-142', '五轴数控加工中心', 'manufacturing', [-5.65, 0, 6.45], [3.18, 2.58, 2.82], 2630, 15, {
        vibrationIsolation: '惯性基座与弹簧减振器',
        notes: '惯性基座下设弹簧减振器，管线柔性连接。操作面朝北，吊轨在机门前交接工件。',
      }),
      unit(
        'AMF-143',
        '增材制造与封闭打印柜',
        'manufacturing',
        [-5.89, 0, 10.06],
        [2.85, 2.32, 2.48],
        620,
        5.2,
      ),
      unit('PCB-144', '电子检修与焊接工作台', 'manufacturing', [-2.24, 0, 10.06], [3.1, 1.9, 1.75], 150, 0.8),
      unit('RAI-145', '2 t 检修吊轨', 'manufacturing', [-4, 2.56, 4.55], [6.6, 0.41, 0.32], 480, 3, {
        notes: '额定起重量 2,000 kg。工件从主廊门沿东侧通道运至轨下，再横移至西侧两机之间的交接区。整机重 2,630 kg 的 CNC 不由此轨起吊。',
      }),
    ],
    cameraAnchors: [
      anchor('工序贯通全景', -2.25, 3.35, [-5.65, 1.12, 6.45]),
      anchor('检修工作台', -2.15, 7.65, [-2.24, 1.19, 10.06]),
    ],
  },
}
