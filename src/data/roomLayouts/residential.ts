import { atriumFootprint } from '../../geometry/atrium'
import { unit, type EquipmentUnit, type RoomLayout } from './schema'
import type { Point3 } from '../../types/shelter'

const obstacle = (center: Point3, size: Point3) => ({ center, size })
const windowBay = atriumFootprint
const cabinInteriors = [
  '地质图册',
  '原声吉他',
  '蕨类盆栽',
  '植物标本',
  '折页琴谱',
  '高山摄影',
  '旅行书架',
  '陶杯工坊',
  '羽毛球拍',
  '绘图桌',
]

export const cabinDepth = 3.45
export const cabinWidth = 2.32
function cabin(i: number): EquipmentUnit {
  const side = i < 5 ? 1 : -1
  const x = 3.67 + (i % 5) * cabinWidth
  const front = side * (cabinDepth / 2 - 0.075)
  return unit(
    'CAB-2' + String(i + 1).padStart(2, '0'),
    '独立居住舱 ' + String(i + 1).padStart(2, '0') + ' · ' + cabinInteriors[i],
    'storage',
    [x, 0, i < 5 ? 4.78 : 9.98],
    [cabinWidth, 2.55, cabinDepth],
    875,
    0.095,
    {
      notes: '含床位、独立书桌、天空窗与照明的预制内装。重量为不含私人物品的估算。',
      collisionBoxes: [
        obstacle([-1.12, 1.275, 0], [0.08, 2.55, 3.45]),
        obstacle([1.12, 1.275, 0], [0.08, 2.55, 3.45]),
        obstacle([0, 1.275, -front], [2.16, 2.55, 0.09]),
        obstacle([-0.54, 1.275, front], [1.08, 2.55, 0.09]),
        obstacle([0.54, 2.36, front], [1.08, 0.38, 0.09]),
        obstacle([-0.56, 0.29, -side * 0.44], [0.95, 0.58, 2.04]),
        obstacle([0.58, 0.43, -side * 1.24], [0.93, 0.86, 0.52]),
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
      unit('HMI-201', '弧面三席多屏控制台', 'comms', [9.3, 0, -8.45], [7.8, 2.06, 2.8], 455, 1.65, {
        notes: '曲面值班席由七块独立显示面组成，包含三套工作站。',
      }),
      ...[-9.65, -7.0].map((z, i) =>
        unit(
          'IT-20' + (i + 1),
          '双机热备机柜 ' + (i ? 'B' : 'A'),
          'comms',
          [14.65, 0, z],
          [0.85, 2.18, 1.2],
          370,
          2.4,
          { redundantGroup: 'IT-200', requiredSpareType: 'electronic' },
        ),
      ),
    ],
    cameraAnchors: [
      { name: '弧形席位与北侧机柜', position: [7.05, 1.65, -4.35], target: [10.25, 1.27, -8.7] },
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
      unit('DIN-201', '十席共餐长桌', 'storage', [-8.36, 0, 5.6], [2.62, 1.02, 4.6], 146, 0),
      unit('KIT-202', '开放厨房与双眼灶', 'thermal', [-11.3, 0, 10.86], [6.9, 1.65, 1.04], 395, 7.2, {
        notes: '额定电输入包含双眼灶、冷藏台与油烟罩照明，峰值不等于日均功耗。',
      }),
      unit('FO-201', '地表集光器光纤出光头', 'comms', [-8.36, 3.27, 5.6], [0.42, 0.29, 0.42], 3.4, 0, {
        notes: '被动光纤终端。屋顶集光，日间在餐桌中心形成光斑，入夜随太阳高度归零。',
      }),
      unit('OPT-202', '转向光学潜望镜', 'comms', [-15.22, 0, 9.43], [0.8, 3.47, 0.84], 66, 0),
    ],
    cameraAnchors: [
      { name: '从北沿俯瞰分层农场', position: [-12.6, 1.65, 1.39], target: [-12.15, 0.02, 4.55] },
      { name: '光纤下的共餐长桌', position: [-14.75, 1.65, 8.45], target: [-8.36, 1.0, 5.6] },
    ],
  },
  b2_gym: {
    equipment: [
      unit('RCK-201', '力量架与杠铃', 'storage', [-4.25, 0, 8.15], [2.25, 2.45, 1.72], 260, 0),
      unit('ROW-201', '风阻划船器', 'storage', [0.45, 0, 7.32], [0.84, 1.2, 2.55], 46, 0),
      unit('PHY-201', '光疗灯墙与康复躺椅', 'medical', [-4.57, 0, 3.28], [1.6, 2.08, 2.1], 89, 0.2),
    ],
    cameraAnchors: [{ name: '划船机与光疗墙', position: [-1.52, 1.65, 2.56], target: [-2.35, 1.1, 7.9] }],
  },
  b2_quarters: {
    equipment: Array.from({ length: 10 }, (_, i) => cabin(i)),
    cameraAnchors: [
      { name: '两列寝舱之间', position: [14.88, 1.65, 7.42], target: [5.8, 1.38, 7.42] },
      { name: '地质图册的主人', position: [4.28, 1.65, 5.5], target: [3.3, 1.05, 3.43] },
    ],
  },
}
