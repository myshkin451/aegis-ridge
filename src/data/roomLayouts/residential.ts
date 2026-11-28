import { commonsCameras, diningOrigin, diningSeats, kitchenPosition, islandPosition, sofaPositions, coffeePosition } from './commons'
import { bedrooms } from '../../geometry/residentialPlan'
import { atriumFootprint } from '../../geometry/atrium'
import { unit, type EquipmentUnit, type RoomLayout } from './schema'
import type { Point3 } from '../../types/shelter'

const obstacle = (center: Point3, size: Point3) => ({ center, size })
const windowBay = atriumFootprint
type Bedroom = (typeof bedrooms)[number]

/** Optical centres in B2 floor-local metres, shared by the light pool and its visible fittings. */
export const pilotFixtures = {
  bedside: [-0.51, 1.21, 10.98] as Point3,
  mirror: [-2.29, 1.9, 8.57] as Point3,
  publicMirror: [-2.17, 1.85, 1.75] as Point3,
  skyPanel: [-0.56, 1.9, 11.73] as Point3,
  skyPanelSize: [1.48, 0.82] as const,
}

export const pilotSolids = {
  // Stored in CAB-201 coordinates, including the lee side of the sliding door track.
  wardrobe: obstacle([-1.12, 1.49, -1.48], [0.52, 2.98, 1.3]),
  nightstand: obstacle([-0.01, 0.24, 1.48], [0.44, 0.48, 0.43]),
}

/** Furniture in bedroom-local coordinates, shared by instance placement and capsule solids. */
export function bedroomFurniture(b: Bedroom) {
  const beds = b.onCall
    ? [-1.11, 1.11].map((z) => ({ x: 1.18, z, tiers: 2 }))
    : b.beds === 2
      ? [-0.96, 0.96].map((x) => ({ x, z: -0.71, tiers: 1 }))
      : [{ x: -0.78, z: 0.63, tiers: 1 }]
  const desk = b.onCall ? { x: -0.85, z: -1.83 } : b.beds === 2 ? { x: 0, z: -1.97 } : { x: 0.63, z: 1.82 }
  return { beds, desk }
}

function sleepFitout(b: Bedroom, i: number): EquipmentUnit {
  const { beds, desk } = bedroomFurniture(b)
  return unit(
    'CAB-' + (201 + i),
    b.onCall ? '备勤宿舍 · 两组双层床' : (b.beds === 2 ? '双人卧室' : '单人卧室') + ' ' + (i + 1),
    'storage',
    [(b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2],
    [b.x1 - b.x0 - 0.2, i === 0 ? 3 : 2.55, b.z1 - b.z0 - 0.2],
    115 + b.beds * 85,
    b.beds * 0.095,
    {
      sleepingRoomId: b.id,
      notes: '按床位计个人照明与插座概念额定输入。板底隔声墙属于建筑结构。',
      collisionBoxes: [
        ...beds.map(({ x, z, tiers }) =>
          obstacle([x, tiers === 2 ? 1.0 : 0.33, z], [0.94, tiers === 2 ? 2 : 0.66, 2.02]),
        ),
        obstacle([desk.x, 0.43, desk.z], [0.91, 0.86, 0.55]),
        ...(i === 0 ? [pilotSolids.wardrobe, pilotSolids.nightstand] : []),
      ],
    },
  )
}

export const residentialLayouts: Record<string, RoomLayout> = {
  b2_medical: {
    equipment: [
      unit(
        'ISO-201',
        '隔离观察床与压差观察隔间',
        'medical',
        [-13.7, 0, -9.1],
        [3.25, 2.55, 4.25],
        648,
        0.43,
        {
          notes: '含隔离送排风末端与监护仪的额定电负荷。压差以现场调试为准。',
          collisionBoxes: [
            obstacle([-1.57, 1.25, 0], [0.09, 2.5, 4.24]),
            obstacle([1.57, 1.25, 0], [0.09, 2.5, 4.24]),
            obstacle([0, 1.25, -2.06], [3.18, 2.5, 0.1]),
            obstacle([-0.72, 1.25, 2.06], [1.75, 2.5, 0.1]),
            obstacle([-0.44, 0.48, -0.23], [1.02, 0.96, 2.2]),
            obstacle([-1.25, 0.83, -0.95], [0.47, 1.66, 0.62]),
          ],
        },
      ),
      unit('LAB-202', '水质分析台与影像阅片屏', 'medical', [-9.35, 0, -9.2], [1.6, 1.85, 3.6], 245, 0.85),
      unit('REF-203', '医用冷藏柜', 'medical', [-14.65, 0, -4.25], [0.95, 1.95, 0.85], 122, 0.28),
    ],
    cameraAnchors: [
      { name: '隔离观察窗与诊疗台', position: [-11.1, 1.65, -4.6], target: [-13.7, 1.15, -9.1] },
    ],
  },
  b2_library: {
    equipment: [
      unit(
        'LIB-201',
        '工程档案书墙与吸音木格栅',
        'storage',
        [-2.0, 0, -11.22],
        [10.5, 3.28, 0.76],
        1460,
        0.08,
        { notes: '质量含书刊的设计装载量。书脊和吸音木片共用实例批次。' },
      ),
      ...[-5.95, -3.25, 0.05, 2.35].map((x, i) =>
        unit(
          'DES-20' + (i + 1),
          '研读工位 ' + (i + 1),
          'storage',
          [x, 0, -9.12],
          [1.36, 1.16, 1.55],
          42,
          0.012,
        ),
      ),
      unit('CRT-201', '双层还书车', 'storage', [-6.6, 0, -7.28], [0.85, 1.05, 0.62], 36, 0),
    ],
    cameraAnchors: [{ name: '工程维修全集', position: [-2.0, 1.65, -7.08], target: [-5.7, 1.72, -11.22] }],
  },
  b2_command: {
    equipment: [
      unit('HMI-201', '弧面三席多屏控制台', 'comms', [10.37, 0, -8.45], [6.5, 2.06, 2.8], 455, 1.65, {
        notes: '曲面值班席由七块独立显示面组成，包含三套工作站。',
      }),
      ...[-9.65, -7.0].map((z, i) =>
        unit(
          'IT-20' + (i + 1),
          '双机热备机柜 ' + (i ? 'B' : 'A'),
          'comms',
          [15.0, 0, z],
          [0.85, 2.18, 1.2],
          370,
          2.4,
          { redundantGroup: 'IT-200' },
        ),
      ),
    ],
    cameraAnchors: [
      { name: '弧形席位与北侧机柜', position: [8.25, 1.65, -4.35], target: [10.7, 1.27, -8.7] },
    ],
  },
  b2_commons: {
    equipment: [
      unit(
        'GL-201',
        '4 × 6 m 防火玻璃生态中庭',
        'storage',
        [windowBay.x, 0, windowBay.z],
        [windowBay.w, 0.065, windowBay.d],
        2690,
        0,
        { notes: '夹层玻璃分格承托，可步行俯瞰下一层。质量为含框架概算，耐火等级与人群荷载须另行认证。' },
      ),
      unit('DIN-201', '八席核桃木餐桌', 'storage', diningOrigin, [2.3, 1.04, 3.32], 146, 0, {
        collisionBoxes: [
          obstacle([0, 0.41, 0], [1.12, 0.82, 3.32]),
          ...diningSeats.map(({ position: [x, , z] }) => obstacle([x - diningOrigin[0], 0.50, z - diningOrigin[2]], [0.59, 1, 0.46])),
        ],
      }),
      unit('KIT-202', '开放厨房、咖啡台与双门冰箱', 'thermal', kitchenPosition, [4.72, 2.90, 1.04], 490, 7.2),
      unit('RET-208', '转角备餐台与咖啡杯架', 'storage', [-10.49, 0, 1.85], [.92, 2.87, 1.16], 116, 0, {
        collisionBoxes: [
          obstacle([0,.42,-.22],[.80,.84,.70]),
          obstacle([0,.92,0],[.87,.11,1.14]),
          obstacle([-.39,1.77,0],[.10,1.79,1.14]),
        ],
      }),
      unit('ISL-202', '玄武岩中岛与三张吧凳', 'storage', islandPosition, [3.18, 3.56, 2.04], 282, 0, {
        collisionBoxes: [
          obstacle([0, 0.51, 0], [3.18, 1.02, 1.17]),
          ...[-1.04, 0, 1.04].map(z => obstacle([z, 0.42, 0.77], [0.42, 0.84, 0.42])),
        ],
      }),
      unit('FO-201', '绿庭日光导管', 'comms', [-12.05, 3.27, 6.61], [0.42, 0.29, 0.42], 3.4, 0),
      unit('SOF-203', '两张软包沙发', 'storage', [-13.25, 0, 10.02], [4.70, 1.15, 3.53], 136, 0, {
        collisionBoxes: sofaPositions.map(({ position: [x, , z], size: [w, h, d] }, i) =>
          obstacle([x + 13.25, h / 2 + 0.04, z - 10.02], i === 0 ? [d, h, w] : [w, h, d])),
      }),
      unit('CT-205', '木茶几与读到一半的书', 'storage', coffeePosition, [1.42, 0.60, 0.76], 24, 0, {
        visualKind: 'coffee-table', collisionBoxes: [obstacle([0, 0.22, 0], [1.42, 0.44, 0.76])],
      }),
      unit('FIR-206', '嵌墙壁炉与壁龛', 'thermal', [-14.35, 0.075, 7.12], [2.52, 3.51, 0.51], 380, 0.08),
      unit('GRN-207', '玻璃绿庭与种植池', 'storage', [-12.04, 0.075, 6.65], [1.98, 3.49, 2.76], 240, 0.08, {
        collisionBoxes: [obstacle([0, .15, 0], [1.98, .30, 2.76]), ...[-.955,.955].map(x => obstacle([x,1.74,0],[.05,3.48,2.76])), ...[-1.31,1.31].map(z=>obstacle([0,1.74,z],[1.95,3.48,.05]))],
      }),
    ],
    cameraAnchors: commonsCameras,
  },
  b1_gym: {
    equipment: [
      unit('GYM-151', '力量架与杠铃', 'storage', [-14.25, 0, 8.15], [2.25, 2.45, 1.72], 260, 0),
      unit('ROW-152', '风阻划船器', 'storage', [-9.55, 0, 7.32], [0.84, 1.2, 2.55], 46, 0),
      unit('PHY-153', '光疗灯墙与康复躺椅', 'medical', [-14.57, 0, 3.28], [1.6, 2.08, 2.1], 89, 0.2),
    ],
    cameraAnchors: [{ name: '划船机与光疗墙', position: [-11.52, 1.65, 2.56], target: [-12.35, 1.1, 7.9] }],
  },
  b2_bath_laundry: {
    equipment: [
      unit('WC-211', '船用真空坐便器', 'water', [-5.43, 0, 1.95], [0.68, 0.98, 0.91], 29, 0.18, {
        flushLitres: 1,
        notes: '设计定额每次冲洗 1 L；汇流支管在 B3 夹层接入湿井。',
      }),
      unit('BAS-212', '公卫洗手盆与镜柜', 'water', [-2.52, 0, 1.75], [0.72, 1.92, 0.9], 23, 0),
      ...[4.2, 7.35].map((z, i) =>
        unit('SH-' + (213 + i), '独立淋浴间 ' + (i + 1), 'water', [-5.11, 0, z], [1.45, 2.22, 1.78], 87, 0, {
          collisionBoxes: [
            obstacle([-0.69, 1.1, 0], [0.06, 2.2, 1.76]),
            ...[-0.86, 0.86].map((side) => obstacle([0, 1.1, side], [1.43, 2.2, 0.055])),
          ],
        }),
      ),
      unit('WM-215', '叠放洗衣机与热泵干衣机', 'water', [-4.04, 0, 10.9], [2.3, 2.04, 1.13], 170, 2.6, {
        notes: '淋浴、盥洗和洗衣灰水在北侧共用水墙汇入 B3 夹层。',
      }),
      unit('VNY-216', '干区橡木整理台与灯镜', 'storage', [-2.44, 0, 8.57], [0.58, 2.02, 1.52], 44, 0.012, {
        visualKind: 'laundry-vanity',
      }),
    ],
    cameraAnchors: [
      { name: '公卫盥洗与真空坐便器', position: [-4, 1.65, 1.48], target: [-5.43, 0.55, 1.95] },
      { name: '独立淋浴间与洗烘区', position: [-3.35, 1.65, 8.62], target: [-4.95, 0.94, 9.55] },
    ],
  },
  b2_quarters: {
    equipment: bedrooms.map(sleepFitout),
    cameraAnchors: [
      { name: '卧室之间的静谧内廊', position: [8, 1.65, 6], target: [1.1, 1.4, 6] },
      { name: '独立单人卧室', position: [-0.45, 1.65, 8.1], target: [-1.28, 0.74, 10.13] },
    ],
  },
}
