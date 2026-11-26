# 03. 前端技术架构与数据模型（v2.0）

> **架构目标**：以 WebGL2 成熟生态为基座，做到**数据、几何、物理引擎、渲染、HUD 五层严格解耦**；同时确保构建期地形预计算、程序化 PBR 材质库、6 状态相机与 BVH 碰撞、Playwright 五机位截图画廊全部可验证、可回归、稳跑 60 FPS。

---

## 1. 技术栈选型（v2.0 精简与升级）

| 层级 | 选型 | 理由与 v2.0 调整 |
| --- | --- | --- |
| 构建与运行 | **Vite 6 + TypeScript 5 (strict)** | 零容忍类型锁死网格坐标、管网拓扑与工程单位 |
| UI 框架与样式 | **React 19 + 纯 CSS 设计令牌（移除 Tailwind）** | 经 M1 审计 Tailwind 几乎未被使用；图纸仪器 HUD 依赖精确 1px 细线、SVG 标高尺与双语域令牌，纯模块化 CSS 更干净轻快 |
| 3D 渲染底座 | **Three.js（WebGL2）+ `@react-three/fiber` + `@react-three/drei`** | WebGL2 生态成熟稳定（AgX、`postprocessing`、`n8ao`、`camera-controls`、`three-mesh-bvh` 全线就绪），避免实验性云包 API 变动拖垮构建 |
| 相机与碰撞 | **`camera-controls` + `three-mesh-bvh`** | 取代基础 OrbitControls，支持平滑拟合、光标缩放、透视/正交切换；`three-mesh-bvh` 负责第一人称胶囊碰撞、楼梯自动升降与快速射线拾取 |
| 后处理与光影 | **`postprocessing` + `n8ao` + `three-csm`（或内置级联阴影）** | 提供 AgX 色调映射、N8AO 环境光遮蔽、选择性 Bloom、SMAA 与 4 情景 3D LUT |
| 状态管理 | **Zustand** | 原子选择器隔离 React HUD 与 R3F `useFrame`，禁止帧循环触发 React 重渲染 |
| 测试与视觉验收 | **Vitest + Playwright（可选 headless 验收脚本）** | `vite.config.ts` 统一包含 `tests/**/*.test.ts` 与 `src/**/*.test.ts`；Playwright 固化 5 机位截图签收 |
| 声音（M5） | **原生 WebAudio API** | 零音频文件体积，纯程序化合成各层真实底噪（含 B4 100Hz 变压器嗡声）与气闸泄压声 |

---

## 2. 目录结构（v2.0 规范）

```text
/
├── AGENTS.md
├── README.md
├── scripts/
│   ├── generate-terrain.mjs        # 构建期确定性侵蚀高度场与 5 张驱动图预计算脚本
│   ├── capture-shots.mjs           # M1.5b 起：Playwright 自动截取 5 个固定机位图（npm run shots）
│   └── measure-perf.mjs            # M1.5b 返修起：Playwright 真 GPU 性能与切换零顿挫回归脚本（npm run perf）
├── public/
│   ├── terrain/                    # 预计算 16-bit 高度图与坡度/曲率/汇流/坡向驱动图
│   ├── fonts/                      # 按需子集化图纸长仿宋（缺失时回退系统仿宋）
│   └── assets/crew/                # 可选 10 位专家立绘（缺失时自动矢量工程徽章降级）
├── docs/
│   ├── PROGRESS.md
│   ├── 01-shelter-engineering-spec.md
│   ├── 02-visual-and-ux-spec.md
│   ├── 03-technical-architecture.md
│   ├── 04-codex-execution-roadmap.md
│   ├── 05-camera-and-walkthrough-spec.md
│   ├── 06-site-security-and-lifelines-spec.md
│   ├── shots/                      # 按里程碑存档的 5 机位签收画廊（M1.5b+）
│   └── archive/visual-review-m1/   # M1 视觉评审与实测截图历史归档
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   ├── tokens.css              # 双语域色板、4 字体角色、4 级字号、线宽与动效令牌
│   │   ├── hud.css                 # 全屏图签、标高尺、图例、比例尺与坐标读数
│   │   └── panels.css              # 按需数据表、体检报告、检修与漫游小地图
│   ├── types/
│   │   └── shelter.ts              # 全项目唯一权威 TypeScript 类型定义
│   ├── geometry/                   # 中立纯 TS 几何层（零 React/Three 渲染副作用）
│   │   ├── coords.ts               # 16×12 网格与标高唯一换算源（供 engine 与 scene 共享）
│   │   ├── planGeometry.ts         # 二维布尔运算、楼板开孔与多边形辅助
│   │   └── siteElevations.ts       # 山体基准高程采样与 19 处外围/双平硐几何校验
│   ├── data/
│   │   ├── floors.ts               # L2..B4 标高、16×12 网格、扩容核心筒与双平硐定义
│   │   ├── defaultBlueprint.ts     # v2.0 垂直干湿对齐完整避难所蓝图（含机位锚点）
│   │   ├── photographs.ts          # 5 个固定机位的时刻、镜头、取景与漫游落点
│   │   ├── siteFacilities.ts       # 19 处“藏于科研”外围设施与三条出路元数据
│   │   ├── roomTemplates.ts        # 可替换房间模块库
│   │   ├── mepNetwork.ts           # 6 大管网拓扑与 GB 7231 识别信息
│   │   ├── scenarios.ts            # 4 种情景参数、3D LUT 配置与 30 秒封锁时间线
│   │   └── crew.ts                 # 10 位专家主副职、居住舱与巡检路线
│   ├── engine/                     # 纯 TypeScript 工程与物理引擎（零 React/Three 依赖）
│   │   ├── feasibility.ts          # 电、核堆堆侧废热/岩体温升、水、分层农学、氧气、新风
│   │   ├── compliance.ts           # 干湿垂直对齐、核心筒/楼梯合规、储能排烟、CHP 联锁、大件可达
│   │   ├── maintenance.ts          # 模拟隔离检修、备用回路接管、阀门下游影响与搬运路径
│   │   └── __tests__/              # 完整引擎物理与违规检测 Vitest 单测
│   ├── store/
│   │   └── useShelterStore.ts      # 相机状态、剖切面/盒、楼层、时间轴、工况、MEP、检修、编辑态
│   ├── scene/
│   │   ├── ShelterCanvas.tsx       # WebGL2 Canvas、AgX、N8AO、CSM、4 档质量分级、PMREM(0.04)
│   │   ├── materials/
│   │   │   ├── pbrLibrary.ts       # 10 种程序化 PBR 材质 + 全局倒角工具与 GLSL 噪声库
│   │   │   └── sectionShader.ts    # 世界坐标地质剖切图例着色器（岩性/混凝土/节理/水位）
│   │   ├── terrain/
│   │   │   ├── MultiScaleMountain.tsx  # 远景 10km / 主山 2-3km / 场地 300m / 剖切体 80m
│   │   │   ├── SiteFacilities.tsx      # 19 处外围设施、进站路、防雪崩廊道、双平硐与索道
│   │   │   └── Vegetation.tsx          # 五驱动图分带高山植被与倒石堆（InstancedMesh + LOD）
│   │   ├── atmosphere/
│   │   │   ├── PhysicalSky.tsx         # 24h 物理天空、空气透视雾与山谷逆温云海
│   │   │   ├── RenderPipeline.tsx      # CSM、N8AO、选择性 Bloom、SMAA、AgX 与四档画质
│   │   │   └── WeatherAndLockdown.tsx  # M4：多工况与 30 秒封锁编排驱动
│   │   ├── camera/
│   │   │   ├── CameraStateMachine.tsx  # 6 状态相机、投影变形、竖井下潜、掀顶落地与深链接
│   │   │   ├── WalkthroughRig.tsx      # three-mesh-bvh 胶囊碰撞、点地移动、气闸长按压差
│   │   │   ├── walkCollision.ts       # BVH 地面支撑、胶囊滑动与门扇通行
│   │   │   ├── SceneReadouts.tsx      # 光标拾取、轴号、指北针、比例尺与漫游压差读数
│   │   │   ├── SectionBoxTool.tsx      # 6 面拖拽剖切盒（吸附轴线与墙线）
│   │   │   └── MeasureTool.tsx         # M6：两点顶点吸附毫米级测距
│   │   ├── SurfaceStation.tsx      # L1/L2 科研站、气闸前厅、百叶与光伏翼
│   │   ├── UndergroundShell.tsx    # 分层防护、核心筒与平硐
│   │   ├── FloorSliceGroup.tsx     # 按层合批的楼板、墙体、楼梯与夹层
│   │   ├── DrawingMarks.tsx        # 平面房间标注与剖面标高线
│   │   ├── CoreTraces.tsx          # M1.5b 竖井与走廊干线示意
│   │   ├── rooms/                  # M2：6 层高精细倒角程序化房间与设备库
│   │   ├── mep/                    # M3：6 大管网、GB 7231 色环、Alt X 光透镜、水流/阀门追踪
│   │   └── ambiance/               # M5：10 人巡视小人、AGV、24h 节律照明与 WebAudio 声景
│   └── ui/
│       ├── Instruments.tsx         # 工程图签、视图、线型图例、即时读数、房间数据表
│       ├── ElevationRuler.tsx      # 标高实尺与平面切面游标，窄屏横排
│       └── TimeAndScenarioBar.tsx  # 紧凑 24h 时间轴与 4 工况切换（嵌套于图签/次级条）
└── tests/                          # 几何、坐标、高程与蓝图不变量测试
```

---

### M1.5a 已接入的地形数据

`npm run terrain` 读取测点与道路设计线，用固定种子 145001 生成 `public/terrain/atlas.json` 和二进制测区。清单记录范围、采样间距、父测区、道路中心线和各测区的 SHA-256。每个顶点占 6 字节，前两字节为小端无符号高程（米值为原码除以 32 再减 512），接着四字节分别记录坡度、曲率、汇流和坡向。运行时的高程查询与网格渲染使用相同的三角形对角线。开发、测试和构建的 npm 前置脚本都会生成数据，内容一致时保留已有文件。

`src/geometry/` 提供坐标、开孔平面、楼梯踏板、地形采样以及平硐切面。场景在 `src/scene/terrain/` 读取测区，在 `src/scene/BuildingSection.tsx` 以模板缓冲封闭剖到的建筑实体。现有楼层与视图控件使用 `src/styles/` 下的纯 CSS。

---

### M1.5b 渲染与导航

`pbrLibrary.ts` 按世界米制坐标采样程序化矿物、粗糙度和凹凸细节。矩形构件使用 5–20 mm 法线倒角，带开孔的楼板有 12 mm 几何倒角。天空生成同源 PMREM 供玻璃反射，三层噪声云片位于山谷。渲染器按光照、AO、选中发光体的 Bloom、SMAA 与 AgX 输出。现场最高两档有三级太阳阴影；持续慢帧时逐档降低阴影、AO、植被细节和像素比。

`geometry/doors.ts` 使用房间、平硐和前厅坐标定位门扇。`walkCollision.ts` 从同一套实体网格建立 BVH，`SectionBoxTool.tsx` 与标高尺通过 store 修改世界切面。楼板孔洞与楼梯保留在漫游碰撞几何中。封口模板只录入封闭实体，避免把单面平硐表皮误判为实体产生大面积黑块。

## 3. 核心 TypeScript 数据模型要点（`src/types/shelter.ts`）

在 `v1.0` 基础上扩充以下关键字段，确保 `M1.5a` 至 `M6` 类型一次成型：

```ts
export type CameraStateId =
  | 'site'        // 现场透视 50-85mm
  | 'section'     // 正交剖面（可切透视）
  | 'sectionBox'  // 透视 35mm 六面剖切盒
  | 'plan'        // 正交平面 FL+1.200
  | 'floorOrbit'  // 单层透视 35mm 俯瞰
  | 'walkthrough' // 漫游 60° FOV / 1.65m 眼高

export type WetDryZone = 'wet' | 'semi_wet' | 'dry' | 'strict_dry_electrical'

export interface RoomCameraAnchor {
  id: string
  label: string
  position: [number, number, number] // 相对房间地板原点的眼位偏移
  lookAt: [number, number, number]
  fov?: number
}

export interface EquipmentUnit {
  id: string
  tagCode: string                    // 位号牌，如 "P-301A" / "V-B3-012"
  name: string
  category:
    | 'power' | 'thermal' | 'water' | 'oxygen'
    | 'hvac' | 'agriculture' | 'manufacturing'
    | 'medical' | 'comms' | 'storage' | 'security'
  redundantGroup?: string
  powerKw: number                    // 正耗电，负发电
  thermalEfficiency?: number         // 发电机组热电效率（如 0.30），用于真实推导堆侧废热
  heatRejectionKw?: number           // 散热设备额定排热能力（kWth）
  o2RateKgPerDay?: number            // 正产氧（电解/光合），负耗氧
  requiresExternalExhaust?: boolean  // 如备用 CHP，在密闭工况下自动闭锁
  hasRunawayVent?: boolean           // 储能电池柜独立热失控排烟校验标志
  moduleSizeM: [number, number, number]
  weightKg: number
  serviceIntervalDays: number
  requiredSpareType: 'structural' | 'precision_filter' | 'electronic' | 'consumable'
  primaryRoleId: string
  backupRoleId: string
}

export interface RoomInstance {
  id: string
  templateId: string
  code: string                       // 图纸编号，如 "B3-04"
  name: string
  floorId: FloorId
  bounds: GridBounds
  clearHeightOverride?: number       // 如 b2_commons 与 b2_library 局部抬高至 3.6m
  wetDryZone: WetDryZone
  replaceable: boolean
  adjustable?: boolean
  zonePressure: 'high_pos' | 'normal_pos' | 'neutral' | 'neg_isolation'
  isDryElectricalZone?: boolean
  requiresHoistRail?: boolean
  atriumVoidToBelow?: GridBounds     // 如 b2_commons 4×6m 防火玻璃通高洞口
  cameraAnchors: RoomCameraAnchor[]
  equipment: EquipmentUnit[]
}
```

---

## 4. 运行时性能预算与工程防坑清单

### 4.1 性能预算与流畅度硬指标（1440p，M1/M2 级笔记本）
- **稳态帧率**：稳定 `60 FPS`，`DPR` 上限 `1.5`；
- **零切换顿挫门禁（`npm run perf` 量化验收）**：
  - 所有材质与后处理着色器在首屏开场期间一次性预编译完成；**之后任意一次视图切换（含首次切换）主线程冻结必须 `≤ 50 ms`、新增 WebGL `linkProgram` 次数 `= 0`**；
  - 阴影系统（CSM）与后处理管线（`EffectComposer` / `N8AO` / `Bloom` / `SMAA` / `AgX`）常驻内存不销毁重建，模式切换仅调整 Pass `enabled` 与 uniform；
  - 自动画质**仅平滑调节渲染像素比（DPR）**，严禁在换档时重建 `EffectComposer` 或触发全场景材质 `needsUpdate`；采样时剔除单帧卡顿毛刺并拉宽升降档滞回带，静止 8 秒内画布分辨率不得来回震荡；
  - 相机运动时阴影连续平滑更新（消除 `0.16 s` 抽搐跳动）；漫游 `MeshBVH` 碰撞树缓存复用（不在每次切入漫游时同步重算）；
  - 按室内外动态调节 `near / far` 裁面（室外 `near ≥ 0.5 m / far 15 000 m`，漫游 `near 0.12 m / far 350 m`），保证深度缓冲精度；
- **绘制调用**：`≤ 400`（重复构件强制 `InstancedMesh` / `ModelBuilder` 合批）；
- **三角形总量**：`≤ 3–4 M`（远景山体与植被按距离做 LOD 与视锥裁剪）；
- **实时阴影**：太阳 CSM `3` 级 + 每层实时局部投影灯 `≤ 1` 盏（其余室内靠自发光、面光近似与顶点烘焙 AO）；
- **纹理显存**：`≤ 400 MB`；
- **首屏体验**：`3 s` 内出现绘图仪描线与图签，`8 s` 内材质、预编译与完整光照就绪。

### 4.2 强制修复清单（自 M1.5a 立即生效）
1. **`vite.config.ts` 测试包含路径**：改为 `test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] }`，彻底杜绝引擎测试被静默跳过。
2. **中立坐标层**：`coords.ts` 迁出 `src/scene/utils/` 至 `src/geometry/coords.ts`，确保 `src/engine/` 零 Three.js 渲染依赖。
3. **消除 PMREM 控制台警告**：`PMREMGenerator.fromScene(studio, 0.04)`（将 `0.06` 修正为 `0.04`）。
4. **清理冗余依赖**：从 `package.json` 与 `vite.config.ts` 移除未使用的 `@tailwindcss/vite` / `tailwindcss`，全面采用 `src/styles/` 精密令牌样式。
5. **GPU 资源释放与零 `useFrame setState`**：严禁在 `useFrame` 中触发 React state 更新；所有材质、贴图、BVH、Geometry 卸载时严格 `dispose()`。
