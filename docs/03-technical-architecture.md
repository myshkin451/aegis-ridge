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
│   │   ├── roomLayouts/           # M2 分层设备清册、安装原点和室内机位
│   │   ├── photographs.ts          # 5 个固定机位的时刻、镜头、取景与漫游落点
│   │   ├── siteFacilities.ts       # 19 处“藏于科研”外围设施与三条出路元数据
│   │   ├── roomTemplates.ts        # 可替换房间模块库
│   │   ├── mepNetwork.ts           # 6 大管网拓扑与 GB 7231 识别信息
│   │   ├── lockdown.ts             # 30 秒封锁时间线及构件、仪表与照明状态
│   │   └── crew.ts                 # 10 位专家主副职、居住舱与巡检路线
│   ├── engine/                     # 纯 TypeScript 工程与物理引擎（零 React/Three 依赖）
│   │   ├── feasibility.ts          # 电、核堆堆侧废热/岩体温升、水、分层农学、氧气、新风
│   │   ├── compliance.ts           # 干湿垂直对齐、核心筒/楼梯合规、储能排烟、CHP 联锁、大件可达
│   │   ├── maintenance.ts          # 模拟隔离检修、备用回路接管、阀门下游影响与搬运路径
│   │   └── __tests__/              # 完整引擎物理与违规检测 Vitest 单测
│   ├── store/
│   │   ├── useShelterStore.ts      # 相机、剖切、楼层、时刻、工况与 MEP 图层
│   │   └── useOperationsStore.ts   # 人数、封锁时钟、隔离对象和共享体检报告
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
│   │   │   ├── ScenarioGrade.ts       # 四套三维颜色查找表的常驻插值通道
│   │   │   ├── WeatherParticles.tsx   # 暴雪、孢子与沉降粒子的共享批次
│   │   │   └── LockdownTour.tsx       # 30 秒封锁跟拍及 B1 压差表机位
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
│   │   ├── rooms/                  # M2：6 层高精细倒角程序化房间与设备库
│   │   ├── mep/                    # M3：6 大管网、GB 7231 色环、Alt X 光透镜、水流/阀门追踪
│   │   └── ambiance/               # M5：10 人巡视小人、AGV、24h 节律照明与 WebAudio 声景
│   └── ui/
│       ├── Instruments.tsx         # 工程图签、视图、线型图例、即时读数、房间数据表
│       ├── ElevationRuler.tsx      # 标高实尺与平面切面游标，窄屏横排
│       └── OperationsSheet.tsx     # 工程体检、工况、人数与隔离检修数据表
└── tests/                          # 几何、坐标、高程与蓝图不变量测试
```

---

### M1.5a 已接入的地形数据

`npm run terrain` 读取测点与道路设计线，用固定种子 145001 生成 `public/terrain/atlas.json` 和二进制测区。清单记录范围、采样间距、父测区、道路中心线和各测区的 SHA-256。每个顶点占 6 字节，前两字节为小端无符号高程（米值为原码除以 32 再减 512），接着四字节分别记录坡度、曲率、汇流和坡向。运行时的高程查询与网格渲染使用相同的三角形对角线。开发、测试和构建的 npm 前置脚本都会生成数据，内容一致时保留已有文件。

`src/geometry/` 提供坐标、开孔平面、楼梯踏板、地形采样以及平硐切面。场景在 `src/scene/terrain/` 读取测区，在 `src/scene/BuildingSection.tsx` 以模板缓冲封闭剖到的建筑实体。现有楼层与视图控件使用 `src/styles/` 下的纯 CSS。

---

### M1.5b 渲染与导航

`pbrLibrary.ts` 按世界米制坐标采样程序化矿物、粗糙度和凹凸细节。矩形构件使用 5–20 mm 法线倒角，带开孔的楼板有 12 mm 几何倒角。天空生成同源 PMREM 供玻璃反射，三层噪声云片位于山谷。渲染器按光照、AO、选中发光体的 Bloom、SMAA 与 AgX 输出。现场最高两档有三级太阳阴影；持续慢帧时逐档降低阴影、AO、植被细节和像素比。

`geometry/doors.ts` 保存门的楼层、底部中心坐标、墙轴、宽高、门型和两侧分区。建筑沿墙轴读取开口，图纸绘制关闭的门扇，漫游按各扇的开度更新碰撞位置。地下走廊观察窗由房间的 `corridorGlazing` 控制。B2 的卧室、共用内廊、卫浴和疏散前室边界定义在 `geometry/residentialPlan.ts`。房间设备、隔墙与漫游寻路共用这份平面。

`walkCollision.ts` 从建筑实体和设备碰撞体建立 BVH。`SectionBoxTool.tsx` 与标高尺通过 store 修改世界切面。楼板孔洞与楼梯保留在漫游碰撞几何中。封口模板只录入封闭实体，避免把单面平硐表皮误判为实体产生大面积黑块。

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
  name: string
  position: [number, number, number] // 米，世界 X/Z、距本层地面的眼高 Y
  target: [number, number, number]   // 同一坐标系内的视线目标
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
  inputPowerKw: number               // 机组辅机或用电设备的额定输入
  generatedPowerKw: number           // 毛发电量；powerKw = 输入 − 毛发电
  heatKw: number                     // 设备在所列工况产生的热负荷
  thermalEfficiency: number | null         // 发电机组热电效率（如 0.30），用于真实推导堆侧废热
  heatRejectionKw: number           // 散热设备额定排热能力（kWth）
  o2RateKgPerDay: number            // 正产氧（电解/光合），负耗氧
  requiresExternalExhaust?: boolean  // 如备用 CHP，在密闭工况下自动闭锁
  hasRunawayVent?: boolean           // 储能电池柜独立热失控排烟校验标志
  position: [number, number, number] // 世界 X/Z，底面距本层地面的 Y
  moduleSizeM: [number, number, number] // 宽、高、深
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
  corridorGlazing: boolean
  servicePorts?: ServicePort[]        // 世界 X/Z、相对端口所在楼层的 Y，单位均为米
  dailyWaterBudget?: { people: number; greyLitres: number; blackLitres: number }
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

同层的重复构件按材质和原语合批。每个设备实例保留位号，点击后可回到同一条设备记录。龙门吊、洗消拱门和卧室家具采用分件碰撞体。首屏将设备与建筑一次性建入 BVH，再从货梯旁的主走廊测出地下各机位的通路。寻路和路径简化都检查公共通行范围、地面支撑、胶囊净空与打开后的门扇。设备饰面跟随建筑裁切面，图纸的材料封口归属结构实体。

六系统拓扑在 `buildMepNetwork(atlas)` 中按当前地形和蓝图生成。每条有向边保存两端节点、米制折线、管径包络、系统和介质。图纸线型、实体安装、射线拾取与右侧数据表读取同一张图；改变图例、阀门或选中管段只更新可见性与材质参数。预热遍历常驻的实体、图纸和选中轮廓批次。

## 4. 运行时性能预算与工程防坑清单

### 4.1 个人机性能验收（Apple M1 Pro / Chrome）

以本地生产预览、Chrome WebGL2 / ANGLE Metal 实测。自动画质从 `tiers[3]` 起步，视口 1728 × 1117 CSS px、设备像素比 1.5。验收覆盖开场、全部视图、漫游和工程交互。

| 指标 | 个人机条件 |
| --- | --- |
| 稳态帧率 | 60 FPS；同时报告平均 FPS 与 P95 帧时 |
| 切换和交互主线程 | Chrome Trace 最长 RunTask ≤ 50 ms |
| 首屏交互就绪 | 完整光照和预编译首帧 GPU fence ≤ 10 s |
| WebGL 程序 | 就绪后全程新增 linkProgram = 0 |
| 控制台 | 错误、警告均为 0 |
| 自动画质 | 全程保留起始 DPR，持续检查实际画布像素 |
| WebGL 纹理（含环境与离屏附件） | 全部纹理声明存储峰值 ≤ 1 GB（1,000,000,000 字节）；独立深度缓冲另外计量 |
| 绘制、三角形和下载体积 | 报告峰值与实际传输量；超过 600 draws 或 8M triangles 时警告 |

三级 CSM、两盏室内投影聚光灯与后处理常驻。室内深度图按房间及门状态更新，室外相机运动连续更新太阳阴影；地表视角剔除地下室内设备。漫游碰撞复用 MeshBVH，室外与室内分别使用对应近远裁面。运行中自动画质只调节 DPR，采样剔除长任务毛刺并用滞回抑制抖动。

启动时从房间内实际布置拍摄六面 HDR 环境图，按 64 px 面分辨率预滤波与缓存。切房在同规格 CubeUV 纹理间用 0.32 s 过渡。反射对照锁定机位、时刻、灯位与漫反射照明，仅在关闭组抑制项目材质的环境镜面反射。照片模式的独立景深通道也在首屏预热。导出按所选画幅冻结场景，离屏分块进行 4 × 4 次亚像素采样，编码完成后恢复现场。灯晕使用独立的半分辨率缓冲，室内表面和镜面反射保持完整分辨率。

`npm run perf` 以持续约八秒的真实鼠标拖动测量环绕，计入第一次输入与五次按下和松开。M1 Pro 上首次打开默认声卡可能同步耗时超过 150 ms，Chrome 收到手势后先创建静音输出，再异步切到系统默认声卡。验收也读取两倍 PNG 的文件头，检查导出期间的纹理峰值、释放结果和程序链接。

以下 M2.5 小节保存当时的样板与验收记录，当前冲刺采用上表预算。

#### M2.5b 样板房的性能与数据约定

- B1 工坊以设备安装外廓校验叠放。CNC、分选机分别落在西侧中段和北段，东边界为 −4.06 m、−4.325 m。额定 2 t 吊轨沿东西向跨过两机之间的交接带，工件从走廊门沿东侧通道到达轨下。测试用 0.90 m 宽的连续扫掠矩形覆盖从门到交接位和工作面的整条路径，单独检查 CNC 朝北的 1.0 m 操作面及其余侧的 0.6 m 检修空间。
- 设备安装点、包围盒、位号与碰撞仍由蓝图给出。外观由 `visualKind` 注册表选择，旧记录可从既有位号恢复。餐椅网格在加载时展开节点变换、按包围盒归一化，再以实例矩阵恢复各安装尺寸。
- 开场预载一套橡木的颜色、OpenGL 法线、粗糙度与一个餐椅 GLB。三个 1K WebP 通道放入同一数组纹理；GLB 采用项目材质与剖切规则。纹理和几何切换保持着色器程序键。资源尺寸、来源、许可与显存核算见[资产清单](../public/assets/MANIFEST.md)。
- 灯具安装位置、色温与两个时间预设在 `src/data/lighting.ts`。新增的漫游灯池常驻一盏投影聚光灯、三盏无影点光和一盏面光，场景另有既有的剖面楼层灯及日间光纤。太阳三级阴影与室内聚光灯分别按需更新。首屏同时烘焙地表和 B2 反射环境，尺寸相同，行走跨楼层时只换纹理引用。
- `npm run perf` 将本阶段绘制预算收紧到 370。样板机位依次检查进房、稳定帧率、切房深度图更新和太阳阴影计数。单独的迟到资产场景在真实漫游画面中将程序化资源换成橡木和餐椅，并记录实际 WebGL2 链接次数。

#### M2.5c 表面、模型和室内反射

四种实拍表面共享 `ars-solid`。每种材料的颜色和粗糙度共用一个 RGBA8 图层，两种材料的法线 XY 共用一个图层；着色器重建法线 Z。三张艺术纸本各用一个图层。完整 r3 为九层，r2 只分配六层。Worker 解码本地 WebP、合并通道并把像素缓冲区转交给渲染线程。表面按各自米制平铺尺度投影。画页使用纸面坐标。

`domestic.glb` 收录七种具名网格。项目用安装数据确定枕、被、沙发软垫、马桶、洗手盆、灯罩和盆栽叶簇的位置、尺度与材质。十四个床位复用同一对枕、被网格。床尾叠毯按当前被面的三角形高度成形，漫游与简化回退分别贴合。切入漫游时切换共享几何，图纸继续使用简化形体。餐椅沿用独立文件。GLB 与贴图分别支持程序化回退。正式压测额外在共餐厅落地后加载全部资产，再切去卧室和卫浴，检查替换和后续切房有没有产生 WebGL 链接。

B2 使用居住反射，L1／L2 共用科研站反射，B1／B4 共用机房反射，B3 使用农场反射。室外保留对应时刻的天空。引擎按实际渲染目标的尺寸、像素类型与已加载纹理层数核查内容纹理预算。性能门槛以签收构建 `813b8dc` 为基线，新增 WebP 与 GLB 的实际传输体积至多 4,000,000 B，内容纹理及室内反射合计至多 64,000,000 B，首屏 GPU 就绪增量至多 500 ms。

### 4.2 强制修复清单（自 M1.5a 立即生效）
1. **`vite.config.ts` 测试包含路径**：改为 `test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] }`，彻底杜绝引擎测试被静默跳过。
2. **中立坐标层**：`coords.ts` 迁出 `src/scene/utils/` 至 `src/geometry/coords.ts`，确保 `src/engine/` 零 Three.js 渲染依赖。
3. **消除 PMREM 控制台警告**：`PMREMGenerator.fromScene(studio, 0.04)`（将 `0.06` 修正为 `0.04`）。
4. **清理冗余依赖**：从 `package.json` 与 `vite.config.ts` 移除未使用的 `@tailwindcss/vite` / `tailwindcss`，全面采用 `src/styles/` 精密令牌样式。
5. **GPU 资源释放与零 `useFrame setState`**：严禁在 `useFrame` 中触发 React state 更新；所有材质、贴图、BVH、Geometry 卸载时严格 `dispose()`。

### M4 工程运行数据与渲染

`src/engine/operations.ts` 以工况、时刻、人数、密闭状态、隔离对象与 M3 管网为输入，返回同一次体检和检修结果。纯 TS 引擎可在 Vitest 中单独运行。静态几何审查复用同一份蓝图和管网的结果。运行状态放在 `useOperationsStore`，只有操作点、网络或密闭边界改变时才重新求解。

B2 的七个显示面共享一张 CanvasTexture，指标和故障计数取自 HUD 使用的报告。封锁倒计时只更新总览区域。检修图层按隔离段、接管支路和搬运折线更新同一个实例缓冲。四套颜色查找表在开场创建，在常驻后处理通道内插值；天气共享实例几何，室外防护构件按材质合批。30 秒动画、快进与跟拍取同一个时钟。
