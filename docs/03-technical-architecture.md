# 03. 前端技术架构与数据模型（Technical Architecture）

> **架构目标**：清晰分层、数据驱动、零隐式耦合。既保证 Codex 在 Phase 1 各个里程碑能够低心智负担、高稳定度地并行/递进编码，也为未来 Phase 2 引入“实时运行模拟、人员 AI 行为或自由砌墙建造”留下平滑演进接口。

---

## 1. 技术栈选型

| 层级 | 选型 | 理由 |
| --- | --- | --- |
| 构建与开发服务 | **Vite 6 + TypeScript 5 (strict)** | 毫秒级热更新，强类型锁死坐标、管网拓扑与工程单位 |
| UI 框架 | **React 19 + Tailwind CSS v4** | 工程控制台 HUD 开发极快，状态与 3D 视口解耦 |
| 3D 渲染引擎 | **Three.js + `@react-three/fiber` + `@react-three/drei`** | 声明式组织楼层、房间、管网与相机控制，Codex 生成代码稳定度最高 |
| 后处理（可选轻量化） | `@react-three/postprocessing`（仅按需开轻度 Bloom/ToneMapping） | 增强管网微光与建筑层次，同时提供一键画质降级保障流畅 |
| 状态管理 | **Zustand** | 轻量、无 boilerplate，非常适合在 React HUD 与 R3F `useFrame` 循环间共享状态而不触发无谓重渲染 |
| 单元测试 | **Vitest** | 专门验证 `src/engine/` 中的热/电/水/粮/检修可达性与合规算法 |
| 图标库 | `lucide-react` | 线条干净锐利，天然契合工程数字孪生审美 |

---

## 2. 推荐目录结构

```text
/
├── AGENTS.md
├── README.md
├── docs/
│   ├── 01-shelter-engineering-spec.md
│   ├── 02-visual-and-ux-spec.md
│   ├── 03-technical-architecture.md
│   └── 04-codex-execution-roadmap.md
├── public/
│   └── assets/
│       └── crew/                  # 可选 AI 生图专家立绘（缺失时自动矢量降级）
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/
│   │   └── shelter.ts             # 全项目唯一权威 TypeScript 类型定义
│   ├── data/
│   │   ├── floors.ts              # L2..B4 标高、层高、夹层与骨干竖井常量
│   │   ├── defaultBlueprint.ts    # 标杆预设完整避难所 JSON 蓝图
│   │   ├── roomTemplates.ts       # 可替换/扩展房间模块模板库
│   │   ├── mepNetwork.ts          # 6 大管网与物流拓扑生成/定义数据
│   │   ├── scenarios.ts           # 4 种外部情景工况参数
│   │   └── crew.ts                # 10 位专家主副职与责任区映射
│   ├── engine/                    # 纯 TypeScript，零 React / Three 依赖
│   │   ├── feasibility.ts         # 电/热/水/粮/新风 5 大定量自持力计算
│   │   ├── compliance.ts          # 通道可达性、强弱电隔离、N+1 冗余、双逃生校验
│   │   ├── maintenance.ts         # 单节点隔离检修、备用回路接管与维修路径求解
│   │   └── __tests__/             # Vitest 工程规则单元测试
│   ├── store/
│   │   └── useShelterStore.ts     # 视图模式、选中楼层、MEP 图层、检修隔离态、蓝图编辑态
│   ├── scene/
│   │   ├── ShelterCanvas.tsx      # Canvas、光照、阴影、环境与相机控制器
│   │   ├── TerrainMountain.tsx    # 半山腰等高线阶梯地形 + 剖切/X光支持
│   │   ├── SurfaceStation.tsx     # L1/L2 科研观测站外观、光伏翼与装甲封锁动画
│   │   ├── UndergroundShell.tsx   # B1-B4 岩层缓冲带、结构柱网、外围防渗沟、核心竖井
│   │   ├── FloorSliceGroup.tsx    # 单层楼板、隔墙、走廊、夹层显隐控制
│   │   ├── rooms/                 # 按功能拆分的精致程序化 3D 房间与设备组件
│   │   │   ├── RoomRenderer.tsx   # 根据 room.kind 分发渲染 + 悬停/选中/报错高亮
│   │   │   ├── PowerRooms.tsx     # B4 微核堆、储能配电、地热、三防新风、排水
│   │   │   ├── BioWaterRooms.tsx  # B3 水培、鱼菜菌菇、冷库、食品加工、净水站
│   │   │   ├── LivingRooms.tsx    # B2 居住舱、餐厅、图书、健身、医务、中控
│   │   │   └── LogisticsRooms.tsx # B1 洗消、物流 AGV、装备库、立体仓库、CNC 工坊
│   │   ├── mep/
│   │   │   ├── MepOverlay.tsx     # 6 大管网 3D 渲染、法兰/桥架与微流光动画
│   │   │   └── MaintenancePath.tsx# 隔离检修高亮 + B1 仓库至故障点搬运路径可视化
│   │   ├── ambiance/
│   │   │   ├── WeatherEffects.tsx # 暴雪、生化孢子、核沉降尘粒与天光过渡
│   │   │   └── CrewPawns.tsx      # 10 位专家极简比例尺小人与慢速巡视动画
│   │   └── utils/
│   │       └── coords.ts          # 网格 (gx, gz, floorId) <-> Three.js (x, y, z) 唯一换算源
│   └── ui/
│       ├── TopBar.tsx             # 情景切换、人数调节、视图/相机预设、编辑模式
│       ├── FloorSlicer.tsx        # 左侧楼层剥离条 + 夹层开关
│       ├── MepLayerDock.tsx       # 左下 6 大工程图层开关
│       ├── InspectorDrawer.tsx    # 右侧 3 标签抽屉（体检 / 详情检修 / 专家团）
│       └── BlueprintModal.tsx     # 蓝图 JSON 导出、导入与恢复默认预设
└── package.json
```

---

## 3. 核心数据模型（`src/types/shelter.ts` 概要）

为确保 Phase 1 展示与 Phase 2 模拟无缝衔接，所有状态与蓝图均基于可序列化的纯数据接口：

```ts
export type FloorId = 'L2' | 'L1' | 'B1' | 'B2' | 'B3' | 'B4';

export type MepLayerId =
  | 'power_hv'
  | 'comms_lv'
  | 'water'
  | 'hvac'
  | 'logistics'
  | 'structure';

export type ScenarioId = 'normal' | 'cryo' | 'bio' | 'fallout';

export type ViewMode = 'exterior' | 'cutaway' | 'xray';

export interface GridBounds {
  gx0: number;
  gz0: number;
  gx1: number;
  gz1: number;
}

export interface EquipmentUnit {
  id: string;
  name: string;
  category: 'power' | 'thermal' | 'water' | 'hvac' | 'agriculture' | 'manufacturing' | 'medical' | 'comms' | 'storage';
  redundantGroup?: string;        // 同组设备构成 N+1 并联冗余
  powerKw: number;                // 正为耗电，负为发电
  heatKw: number;                 // 产热（正）或散热能力（负）
  moduleSizeM: [number, number, number]; // [宽, 高, 深]，用于校验能否过走廊与货梯
  weightKg: number;               // 单模块最大拆换重量（需 <= 3000kg 货梯额定值）
  serviceIntervalDays: number;
  requiredSpareType: 'structural' | 'precision_filter' | 'electronic' | 'consumable';
  primaryRoleId: string;
  backupRoleId: string;
}

export interface RoomInstance {
  id: string;
  templateId: string;
  name: string;
  floorId: FloorId;
  bounds: GridBounds;
  replaceable: boolean;           // 是否允许在 Phase 1 编辑态中替换
  zonePressure: 'high_pos' | 'normal_pos' | 'neutral' | 'neg_isolation';
  isDryElectricalZone?: boolean;  // true 时严禁给排水管线正上方穿越
  requiresHoistRail?: boolean;    // true 时校验顶部单轨吊与货梯直通
  equipment: EquipmentUnit[];
}

export interface MepSegment {
  id: string;
  layer: MepLayerId;
  floorId: FloorId | 'SHAFT';
  from: [number, number, number]; // 精确世界坐标（走竖井或夹层 Y 标高）
  to: [number, number, number];
  radius: number;
  flowDirection: 1 | -1 | 0;
  isBackupBus?: boolean;          // 标识 A/B 冗余或备用回路
  linkedRoomIds: string[];
  isolatableValveOrBreakerId?: string;
}

export interface DiagnosticIssue {
  id: string;
  severity: 'pass' | 'warn' | 'fail';
  category: 'power' | 'thermal' | 'water' | 'food' | 'hvac' | 'maintainability' | 'safety';
  title: string;
  detail: string;
  targetFloorId?: FloorId;
  targetRoomId?: string;
  targetSegmentId?: string;
}
```

---

## 4. 关键工程实现要点（给 Codex 的防坑备忘）

1. **单一坐标换算源（`src/scene/utils/coords.ts`）**：
   - 严禁在各个组件里手算 `(gx - 7) * 2` 或写死 Y 高度；所有房间、走廊、竖井、设备、管网点位必须调用统一的 `gridToWorld()` 和 `getFloorElevation(floorId)` 工具函数，杜绝楼层错位或管道悬浮。
2. **管网拓扑自动适配房间替换**：
   - 6 大主干管网（竖井立管 + 走廊顶部主干环网）相对固定；房间支管根据 `RoomInstance` 的 `bounds` 与属性（需电/需水/需风/需吊轨）程序化接入最近主干接口。这样当用户在编辑态替换了某个可替换房间时，新房间的支管与体检结论会自动更新，不需要手工重画整张管网图。
3. **相机平滑聚焦与楼层联动**：
   - 当用户点击体检报告里的某条警告、或点击某位专家、或点击“模拟隔离检修”时，如果目标在 B4 而当前只显示 B1，系统应自动将楼层切片切到对应楼层（或切入 X 光视图），并用阻尼插值平滑移动 `OrbitControls` 的 `target` 与相机位置。
4. **帧率与交互流畅度护栏**：
   - 使用 Zustand 的原子选择器（`useShelterStore(s => s.activeLayers)`）避免全场景重渲染；
   - 动画（管网光点、风轮、AGV、小人巡视、暴雪粒子）全部在 R3F `useFrame` 中直接更新 `ref` 或 `InstancedMesh` 矩阵，**严禁在 `useFrame` 中调用 `setState`**。
   - 室内照明优先用材质自发光 + 烘焙感柔和环境光，全场景实时投影灯严格控制在 1–2 盏主光源以内。
5. **Phase 2 演进预留**：
   - 蓝图全部以可导出/导入的纯 JSON 存储；设备参数已预留 `serviceIntervalDays`、`requiredSpareType`、`primaryRoleId`、`backupRoleId`——将来引入时间轴推进、真实磨损、库存消耗和专家自主寻路抢修时，无需改动建筑与 3D 渲染底座。
