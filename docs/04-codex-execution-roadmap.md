# 04. Codex 分阶段开发路线图（v2.0：M1.5a → M6）

> **执行铁律**：
> 1. **每个里程碑开一个全新 Codex Session**，严格按顺序串行推进；
> 2. 每次交付前必须跑通 `npm run verify`（含 `tests/` 与 `src/` 全部单元测试），自 `M1.5b` 起还需跑通 `npm run shots`（5 机位出片）与 `npm run perf`（真 GPU 帧时/零切换顿挫回归）；
> 3. **签字权归属用户**：Codex 完成交付并提交推送后，只能将 `docs/PROGRESS.md` 中本阶段状态改为 **`REVIEW`（待签收）**，由用户在浏览器、5 机位画廊与性能数据验收通过后再改为 `DONE` 并推进下一阶段。

---

## 里程碑总览（v2.0）

| 阶段 | 主题 | 核心交付物 | 验收重点 |
| --- | --- | --- | --- |
| **M1.5a** | **v2.0 工程骨架纠偏 + 四尺度侵蚀真山体 + 19 处外围与双平硐 + 地质剖面** | `16×12` 新网格、真实尺寸核心筒、垂直干湿对齐、构建期侵蚀高度场脚本（远景 10km / 主山 2–3km / 场地 300m / 剖切体 80m）、解析地质剖切面、19 处外围设施与双平硐、修复 `vitest` 范围与中立 `coords.ts` | 几何与高程零冲突、山体彻底摆脱纸板蛋糕感、270m 东侧平硐与 19 处外围位置合理 |
| **M1.5b** | **PBR 材质库 + 物理天空/云海/AgX/N8AO + 6 状态相机与漫游 + 全屏图纸 HUD + 5 机位签收** | 10 种程序化 PBR 材质与全局倒角、物理天空/云海/AgX/N8AO/4 档性能、6 状态相机与竖井下潜/`three-mesh-bvh` 漫游、彻底去 AI 味全屏图签与真实比例标高尺 HUD、Playwright 5 机位截图画廊 | **彻底去 AI 味**、5 张固定机位图质感过关、第一人称走起来丝滑不穿模 |
| **M2** | **全 6 层精细程序化房间 + 空间巧思 + 机位锚点** | 按新材质库建成 L2–B4 全部 26 个高辨识度房间、B2↔B3 `4×6m` 防火玻璃挑空中庭、光纤导光束、餐厅/图书馆 `3.6m` 抬高、10 间个性化居住舱、每房机位锚点、生活痕迹与点击数据表 | 进任意房间漫游都能一眼认出且有“想住进去”的质感、稳 60 FPS |
| **M3** | **6 大工程管网（MEP）+ GB 7231 色环 + Alt X 光透镜 + 水流/阀门追踪** | 夹层与核心竖井 6 套物理合规管网（线型+系统色）、管道表面 GB 7231 识别色环与位号牌、**漫游按住 Alt 的 X 光透视透镜**、抬头 >30° 看夹层、点水管“顺着水走”高亮、悬停阀门影响描红 | X 光夜景出片震撼、强弱电与干湿隔离经得起细查、Alt 透镜手感惊艳 |
| **M4** | **物理守恒可行性引擎 + 隔离检修 + 30 秒封锁编排 + 4 工况 LUT** | 诚实物理计算引擎（含堆侧废热、热信号掩护、岩体温升、分层农学、10 人氧气、储能排烟、CHP 密闭闭锁）+ 全套 Vitest 单测、模拟隔离检修与 B1 仓库搬运路径、30 秒封锁编排、4 工况天气与 3D LUT | 数值绝不造假（不合理必报 WARN/FAIL）、封锁 30 秒编排极具电影感 |
| **M5** | **10 人专家团与晨间巡检 + 24h 节律时间轴 + 分层声景 + 照片模式** | 10 位专家主副职高亮与“晨间巡检”自动漫游、24h 时间轴联动日照/B2 节律色温/B3 夜间错峰补光/中控红光、WebAudio 分层声景（含 B4 100Hz 嗡声）、照片模式（移轴/景深/高分导出） | 整座避难所真正“活过来”、蓝调剖面与 B3 漫游出片达到收藏级 |
| **M6** | **受控模块替换实验 + 毫米级测距 + 深链接 + 蓝图存取与终审** | 备选替换模块（含 3D 模型与物理参数）实时替换并重算管网与体检、两点吸附毫米测距工具、视角深链接 URL、JSON 导出导入与重置、全站最终 QA 与 5 机位终审 | 改一间房立刻联动全局物理指标、全站零报错、开源仓库完整可交付 |

---

## 极简启动指令（每个新 Session 通用）

```text
请先完整阅读仓库根目录的 AGENTS.md、docs/PROGRESS.md 和 docs/04-codex-execution-roadmap.md，然后严格按规范完成当前标记为 NEXT 的里程碑。完成后跑通 npm run verify（及对应截图验收脚本），更新 docs/PROGRESS.md 为 REVIEW 状态并按 AGENTS.md 执行安全检查、git commit 与 git push origin main。
```

---

## 各阶段详细启动指令

### 阶段 M1.5a：v2.0 工程骨架纠偏 + 四尺度侵蚀真山体 + 19 处外围与双平硐 + 地质剖面

> **前置**：新建 Codex Session。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md、docs/02-visual-and-ux-spec.md（第 3 节）、docs/03-technical-architecture.md 与 docs/06-site-security-and-lifelines-spec.md。

本轮任务仅完成里程碑 M1.5a（工程底座 v2.0 纠偏 + 真实尺度侵蚀地形 + 19 处外围设施与双平硐 + 地质剖切面）：
1. 工程与 Harness 基础修补：
   - 修改 vite.config.ts 使 Vitest 同时包含 tests/**/*.test.ts 与 src/**/*.test.ts；
   - 将坐标换算迁移至渲染无关的中立层 src/geometry/coords.ts；
   - 移除未使用的 Tailwind 依赖，切回清晰模块化 CSS（src/styles/）；
   - 将 ShelterCanvas 中 PMREMGenerator.fromScene 的 sigmaRadians 由 0.06 改为 0.04 消除控制台警告。
2. 升级核心蓝图至 v2.0 规格（src/data/floors.ts、src/data/defaultBlueprint.ts、src/types/shelter.ts）：
   - 地下标准层扩容为 16×12 网格（32m×24m = 768 m²/层），L1 540 m² / L2 384 m²，严格落实 6m 复合防护层（顶部 1.5m 钢筋混凝土盖板 + 下部 4.2m 连续花岗岩）；
   - 核心筒扩容至物理真实尺寸（wet: gx 4 gz 3..4, freight: gx 5..6 gz 3..4, personnel 双跑合规楼梯+独立电梯: gx 7..8 gz 3..4, electrical: gx 9 gz 3..4, 东侧无烟联络楼梯井仅贯通 B4-B1: gx 14..15 gz 5）；
   - 按 docs/01 第 4 节重构全楼垂直干湿分区（西北湿区列、东北绝对干区列、B2 餐厅正对 B3 农场、B2 居住区邻东端出口）；
   - 同步重写并强化几何回归测试：校验 16×12 逐格零重叠满铺、楼梯踏步合规、严禁湿房间叠在干电区上方、东侧逃生井不出 L1。
3. 实现构建期预计算侵蚀山体与四尺度真实地形（scripts/generate-terrain.mjs + src/scene/terrain/）：
   - 构建期按固定种子生成四尺度山体数据（远景 10km 5-7 层山脉剪影、主山 2-3km 侵蚀高度场：上 600m 主脊 / 下 300m 山谷与东西两条冲沟、场地 300m SDF 整形平台与之字形盘山路、80m 可剖切核心地质体）及高度/坡度/曲率/汇流/坡向 5 张驱动图；
   - 彻底替换 M1 的纸板阶梯蛋糕山，实现按五驱动图分带的自然坡面与植被；
   - 实现真正平面地质剖切面（地形解析切面 + 建筑 clipping stencil 封口），世界坐标投影表土/风化岩/新鲜花岗岩/节理/岩脉/钢筋混凝土/地下水位图例，6m 缓冲层严格分层画；切剖面时前方山体向南平移约 40m 淡出。
4. 按 docs/06 落地 19 处“藏于科研”外围设施（src/data/siteFacilities.ts + SiteFacilities.tsx）与三条出路：山谷闸口、内藏钢闸门的防雪崩廊道、之字形公路、西南 60m B1 平硐（出挡墙）、东侧 270m 3‰ 下坡 B2 远端逃生平硐（含中段避难硐室与东侧冲沟 1,435m 伪装水文洞口）、双进风口、排风口、山泉集水房、1,240m 冲沟重力排水涵洞、光伏试验场、融雪直升机坪、货运索道、邻峰中继、散布检波器、消防水池；补齐高程与连通自检测试。

完成前请严格执行 npm run verify 全部通过，将 docs/PROGRESS.md 中 M1.5a 标为 REVIEW（禁止标 DONE），同步文档并自动 commit 与 push。
```

---

### 阶段 M1.5b：PBR 材质库 + 物理天空/云海/AgX/N8AO + 6 状态相机与漫游 + 全屏图纸 HUD + 5 机位签收

> **前置**：用户签收 M1.5a 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/02-visual-and-ux-spec.md、docs/03-technical-architecture.md 与 docs/05-camera-and-walkthrough-spec.md，并检查 M1.5a 已完成代码。

本轮任务仅完成里程碑 M1.5b（视觉重定调收官：PBR 材质库 + 天空云海与后处理 + 6 状态相机与 BVH 漫游 + 全屏图纸 HUD + 5 机位签收画廊）：
1. 建立程序化 PBR 材质库（src/scene/materials/pbrLibrary.ts）：
   - 实现 docs/02 第 4.2 节全部 10 种程序化材质（Worley 三相花岗岩、地衣风化岩、碎石草甸、风蚀积雪、带模板缝与对拉孔的清水混凝土、喷射混凝土+岩钉、带雨痕耐候钢、檐下新木/下部风化落叶松、低铁玻璃、沿轨迹磨损环氧地坪与钢格栅）；
   - 落实全局 5–20mm 倒角规范与分楼层光温基调（L2 天光、L1 4000K、B1 4500K、B2 暖光、B3 全光谱品红白、B4 5000K）。
2. 升级 WebGL2 渲染管线与大气（src/scene/atmosphere/ + ShelterCanvas.tsx）：
   - 接入基于太阳高度角的物理天空着色器、距离+高度双雾效空气透视、山谷逆温云海；
   - 接入 AgX 色调映射、N8AO、选择性 Bloom、SMAA、太阳 3 级 CSM 阴影与 4 档动态画质分级（稳 60 FPS，绘制调用 <= 400）。
3. 实现 6 状态相机状态机与第一人称漫游（src/scene/camera/）：
   - 用 camera-controls 实现 现场（默认透视 50-85mm）/ 剖面（正交+投影变形过渡）/ 剖切盒（6 面可拖并吸附轴线）/ 平面（正交 FL+1.200）/ 楼层俯瞰 / 漫游 六种状态及 5 个招牌转场（含 3-4s 竖井下潜 + 1.2m 超大层号掠过、掀顶落地、Esc 拉出、投影变形、山体前移）；
   - 用 three-mesh-bvh 实现 1.65m 眼高漫游（默认点地移动 + WASD/触屏、1.4/2.5 m/s、胶囊碰撞与楼梯自动升降、普通门靠近滑开、气闸门长按 E 配合压差表与泄压感）。
4. 彻底重做全屏“去 AI 味”图纸仪器 HUD（src/ui/ + src/styles/）：
   - 删除旧上下实心黑边栏、圆角磨砂浮卡、金色强调、呼吸灯与无意义图标；
   - 严格按 docs/02 第 1–2 节落地全屏出血画布 + 四大常驻件（左上工程图签 ARS-01、右上纯文字 2px 下划线视图切换、左侧真实比例标高尺含 6m 花岗岩纹与可拖动修改红 FL+1.200 剖切游标、右下光标实时坐标/标高/轴号+分段比例尺+极简指北针）+ 情境线型图例（含夹层 M 勾选）与按需 1px 细线数据表；
   - 落实 4 种字体角色（含系统长仿宋/可选子集化朱雀仿宋）与键盘快捷键（1-6/V/M/X/W/F/H/?）及 1.5s 绘图仪式首次入场。
5. 建立视觉验收画廊自动化脚本（scripts/capture-shots.mjs + npm run shots）：
   - 用 Playwright 自动截取 docs/02 第 6 节的 5 个固定机位图保存至 docs/shots/m1.5b/，并在 docs/PROGRESS.md 中挂出 5 张图清单。

完成前执行 npm run verify 与 npm run shots，将 docs/PROGRESS.md 中 M1.5b 标为 REVIEW，自动 commit 与 push。
```

#### 阶段 M1.5b 返修精修（`fix(m1.5b)`：零切换顿挫 + 相机防穿模 + 3D 自由飞行 + 接地细节 + `npm run perf`）

> **背景**：用户与跨模型真 GPU 实测发现初版 M1.5b 稳态帧率 60 FPS 但存在 4 类不可带入 M2 的底座问题：① 切视图触发 32–42 个 shader 重编译（0.2–0.3s 主线程冻结）与自动画质静止期来回跳档；② 轨道相机无碰撞可滚轮钻入站房墙体与山坡，过渡直线插值不可打断；③ 极寒光伏翼竖立、装甲百叶穿幕墙与木格栅、B3 叶片穿框、站房基座生插绿坡；④ 缺少 3D 透视视角自由飞行。**须在本轮返修达标后再签收进 M2。**

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/02-visual-and-ux-spec.md（第 2.2 节）、docs/03-technical-architecture.md（第 4.1 节）与 docs/05-camera-and-walkthrough-spec.md（第 1.1 节），并检查当前 M1.5b 代码。

本轮为 M1.5b 返修精修（不引入 M2 房间装修内容），目标彻底解决“切换卡顿、相机与模型穿模、手感僵硬、缺少 3D 自由移动”四大问题并建立 npm run perf 性能门禁：

1. 根治切换顿挫与自动画质震荡（RenderPipeline.tsx / ShelterCanvas.tsx / WalkthroughRig.tsx）：
   - 阴影系统（CSM）与后处理管线（EffectComposer / N8AO / SelectiveBloom / SMAA / AgX）改为常驻不销毁重建，切视图/进漫游/开 X 光仅通过开关与 uniform 控制，严禁在视图切换时增删材质 USE_CSM 宏或触发全场景 needsUpdate；
   - 在首屏开场期间一次性预编译全场景着色器（gl.compile），并缓存复用 WalkthroughRig 的 MeshBVH 碰撞树（不再每次切入漫游同步现建）；
   - 重写自动画质：换档只平滑调节 DPR（不重建后期与阴影），剔除长任务异常帧，拉宽升降档滞回带，确保静止 8 秒内画布分辨率零震荡；
   - 取消 CSM 0.16s 抽搐式更新节流，相机移动时阴影连续平滑跟随；室外/室内动态切换 near/far（室外 near >= 0.5m / far 15000m，漫游 near 0.12m / far 350m）。
   - 量化验收硬门槛：除首屏预编译外，任意一次视图切换（含首次切剖面/平面/漫游/X光）主线程长任务必须 <= 50 ms、新增 WebGL linkProgram 次数 = 0。

2. 相机防穿模 + 3D 自由飞行 + 可打断平滑转场（CameraStateMachine.tsx / Instruments.tsx）：
   - 统一无冲突键位：WASD + Q/E（Shift 加速）专职移动；1–5 直达视图（1 现场 / 2 剖面 / 3 平面 / 4 X光 / 5 漫游），[/] 切层，V 循环视图，M 夹层，X X光，F 聚焦，H 隐藏 HUD，? 快捷键，Esc 退出/打断；
   - 在 site / sectionBox / floorOrbit / xray 透视视角下实现【3D 自由飞行（Free-Fly）】：WASD 沿视向水平飞行、Q/E 升降、速度随离地高度自适应；
   - 在 site 视图下给轨道与自由飞行相机加上地形高度场防钻地约束（相机始终高于地形 +0.8m）与站房外廓防穿墙碰撞，彻底消除 dolly-in 钻入混凝土墙或山体的现象；
   - 视角过渡改为避开山体与楼板的平滑弧线，且任何鼠标拖拽、滚轮或按键均能立即打断过渡动画把控制权还给用户。

3. 修复截图实锤的穿模、粗糙接地与静态僵硬感（SurfaceStation.tsx / StudyFixtures.tsx / MultiScaleMountain.tsx / Vegetation.tsx / PhysicalSky.tsx）：
   - 极寒封锁（shot-03）：修正光伏翼收拢角度使其真正平铺折拢（严禁像广告牌一样 76° 竖立），外挂装甲百叶整体外扩偏移完全避开倾斜幕墙立柱与木格栅；
   - B3 样段（shot-05）与 B2 走廊（walk）：水培叶片严格收束在托盘边界内不得穿破铝框，排查并清除 B2 走廊近楼梯处地面/门框小穿模；
   - 站房基座与山坡接缝（site）：给 L1 站房四周补建整平混凝土散水台基与毛石/混凝土挡墙过渡，让建筑稳妥“坐”在山坡上而非生插进草坡；
   - 景深与呼吸感（shot-02）：消除远山背坡横向条纹，丰富松树高度/冠幅/色彩个体差异，云海优化为多层柔和错落薄层并缓慢漂移，屋顶测地雷达罩与双风力机加入克制慢速旋转。

4. 新增性能回归脚本 scripts/measure-perf.mjs 与 package.json 的 npm run perf 命令：
   - 基于 Playwright + 真 GPU（ANGLE Metal）自动测量：现场静止 8s（校验画布宽度无震荡）、现场连续环绕、连续两轮切换全部视图与 X 光、漫游步行 4s、向山坡滚轮推近防穿模检查；
   - 校验并汇报每项的 FPS、P95 帧时、最长主线程任务（<= 50 ms）、新增 shader linkProgram 次数（= 0）与控制台零错误。

完成前请跑通 npm run verify、npm run shots（更新 docs/shots/m1.5b/ 五张图）与 npm run perf 全部达标，将完整性能数字与改动写入 docs/PROGRESS.md（M1.5b 保持 REVIEW 等用户二次签收），同步文档后自动 commit（fix(m1.5b): ...）并 git push origin main。
```

---

### 阶段 M2：全 6 层精细程序化房间、空间巧思与机位锚点

> **前置**：用户签收 M1.5b 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 4 节）、docs/02-visual-and-ux-spec.md（第 4–5 节）与 docs/05-camera-and-walkthrough-spec.md。

本轮任务仅完成里程碑 M2（全 6 层新材质程序化房间、核心空间巧思与设备元数据）：
1. 基于 M1.5b 的 10 种 PBR 材质库与全局倒角规范，在 src/scene/rooms/ 下精细构建 L2–B4 全部 26 个房间的程序化 3D 室内与核心设备（杜绝裸盒，重复构件合批 InstancedMesh）：
   - L2/L1：观测厅望远镜与监测台、温室种植池与屋顶光纤采光器、车库 2 台全地形车与 3t 龙门吊、互锁防爆前厅、公开科普展厅；
   - B1：三级洗消喷淋拱门、AGV 港、装备无人机库、4 层立体备件库（满载周转箱）、废料回收→CNC→3D 打印→焊台完整工坊产线；
   - B2：中控弧形多屏台与机柜、3.6m 抬高图书馆与还书车、负压隔离医务生化室、3.6m 抬高餐厅（含地板 4×6m 防火玻璃通高生态中庭俯瞰 B3 农场 + 地表光纤一束真阳光 + 光学潜望镜）、健身光疗区、10 间各具个人生活痕迹（书籍/乐器/盆栽/门牌）的独立居住舱；
   - B3：分层农场（明确区分 5 层叶菜架与 2 层高光强块茎主食床，全光谱偏品红白补光）、鱼菜共生水池（带水面焦散感）与菌菇/螺旋藻舱、战略冷库、双 25,000L 不锈钢净水罐；
   - B4：双模块屏蔽微核堆与独立进排烟 CHP、带独立热失控排烟道的储能阵与双母线配电柜、三防快拆滤箱与电解制氧机、地热集分水器、深层排水与固废压实间；
   - 走廊尽端设大尺寸人工天空窗，每层加 3–5 处克制生活痕迹（擦痕、保温杯、白板排班、半局棋）与 ISO 7010 标志/荷载标牌/灭火与急救柜。
2. 为全部 26 个房间写入真实工程参数（powerKw、thermalEfficiency、heatRejectionKw、o2RateKgPerDay、moduleSizeM、weightKg、tagCode 等）与 1–3 个精选机位锚点（cameraAnchors），点击任意房间或设备在右侧弹出 1px 细线工程数据表，支持一键“掀顶落地 / 竖井下潜”进入该房漫游。
3. 扩充 Vitest 测试验证全部设备参数完整性与房间机位锚点合法性。

完成前执行 npm run verify 与 npm run shots（输出至 docs/shots/m2/），将 docs/PROGRESS.md 中 M2 标为 REVIEW，自动 commit 与 push。
```

---

### 阶段 M3：6 大工程管网（MEP）、GB 7231 色环与漫游 Alt X 光透镜

> **前置**：用户签收 M2 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 3、5 节）、docs/02-visual-and-ux-spec.md（第 1.2 节）与 docs/05-camera-and-walkthrough-spec.md（第 4 节）。

本轮任务仅完成里程碑 M3（6 大工程管网、GB 7231 标识与漫游 X 光透镜）：
1. 在 src/data/mepNetwork.ts 中生成完整合规的 6 套管网拓扑，严格遵循 v2.0 扩容核心筒（湿井 gx=4 与电气井 gx=9 相距 8m）、顶部 0.9m 夹层与东北绝对干区零过水管铁律，每条关键管段与阀门配置规范位号（如 V-B3-012）。
2. 在 src/scene/mep/ 中实现双尺度管网表达：
   - 宏观/X 光/图纸视图：使用 docs/02 规范的系统色 + 制图线型（实线/短虚线/长虚线/双线/点划线/斜线填充）与柔和流向微光（useFrame 更新，禁止 setState）；
   - 近距/漫游视图：实体管道表面贴 GB 7231 识别色环、介质名、流向箭头与阀门位号牌。
3. 实现三项招牌管网交互：
   - 漫游时按住 Alt 激活以光标为中心的圆形【X 光透视透镜】，实时看穿墙后与吊顶后管线；
   - 走廊仰视超过 30° 自动半透明化吊顶饰板，显露 0.9m 夹层；
   - 【顺着水走】点击任意水管沿上游水源 → 用水点 → 净水站全链路高亮追踪；悬停任意阀门自动描红下游受影响房间。
4. 联动左下角线型图例面板（含夹层 M 勾选）与 X 光夜景出片效果。

完成前执行 npm run verify 与 npm run shots（输出至 docs/shots/m3/），将 docs/PROGRESS.md 中 M3 标为 REVIEW，自动 commit 与 push。
```

---

### 阶段 M4：物理守恒可行性引擎、模拟隔离检修、30 秒封锁编排与 4 工况

> **前置**：用户签收 M3 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 6–7 节）与 docs/06-site-security-and-lifelines-spec.md（第 4 节）。

本轮任务仅完成里程碑 M4（诚实物理可行性引擎 + 模拟隔离检修 + 30 秒封锁编排 + 4 工况）：
1. 在 src/engine/ 下实现纯 TypeScript 物理与工程诊断引擎（零 React/Three 依赖，严禁硬编码或倒推 PASS）：
   - feasibility.ts：真实计算电力与 N+1 冗余（密闭态强制闭锁 CHP）、完整热平衡（含微核堆 28–33% 效率堆侧废热、冬季融雪/温室热信号掩护外排、封锁态岩体温升可持续天数）、闭环水续航、分层农学热量（5 层叶菜 vs 2 层主食床 + 冷库续航）、10 人 8.4 kg/d 氧气收支（光合 + 电解制氧 + 氧瓶）、三防滤芯与耗材寿命；
   - compliance.ts：垂直干湿分区与水电隔离校验、核心筒与双逃生合规校验、储能热失控排烟校验、CHP 密闭联锁校验、大件更换尺寸/承重可达性校验、热信号隐蔽评估；
   - maintenance.ts：任意设备/管段模拟隔离检修、备用回路接管求解、备件库存核对与 B1 仓库经货梯到目标房间的搬运路径计算。
2. 在 src/engine/__tests__/ 编写全面 Vitest 单测（覆盖正常、临界 WARN、物理违背 FAIL 与干湿/热/氧/CHP 专项用例），确认 npm run test 全部跑入且全绿。
3. 接入右侧按需【工程体检】与【模拟隔离检修】数据表：点击报警项自动平滑飞镜高亮目标房间/管段；隔离检修态在 3D 清晰呈现隔离红段、接管备用回路与 B1 搬运路径。
4. 实现 4 种情景切换（日常 / 极寒 -60℃ / 生化孢子 / 核尘埃封锁）与入住人数（5–10 人）调节：落地 4 套克制 3D LUT、暴雪/孢子/沉降粒子，以及 docs/06 第 4 节完整的【30 秒封锁编排动画】（地柱→廊道闸门→装甲门→外立面百叶→温室盖板与光伏折叠→雷达维持缓转→B1 压差拉升→图签变“封锁 · 第 1 天”）。

完成前执行 npm run verify 与 npm run shots（输出至 docs/shots/m4/），将 docs/PROGRESS.md 中 M4 标为 REVIEW，自动 commit 与 push。
```

---

### 阶段 M5：10 人专家团、晨间巡检、24h 节律时间轴、分层声景与照片模式

> **前置**：用户签收 M4 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 8 节）、docs/02-visual-and-ux-spec.md（第 5.2–5.3 节）与 docs/05-camera-and-walkthrough-spec.md。

本轮任务仅完成里程碑 M5（10 人专家团、24h 节律时间轴、分层声景与照片模式）：
1. 在 src/data/crew.ts 定义完整 10 位专家（主专业 + 2 副专业、居住舱绑定、责任区与巡检路径），右侧新增【专家团】标签页；支持加载 public/assets/crew/crew_01..10.png，缺失时优雅降级为克制几何工程徽章；点击专家高亮其负责房间、管网与互助搭档，支持一键启动【晨间巡检】自动第一人称导览并配字幕说明。
2. 实现 24 小时时间轴控制（含延时播放）：实时联动外部物理太阳轨迹、B2 居住区 2200–5000K 节律照明与夜间 1800K 低位琥珀夜灯、B2 中控室 23:00–06:30 红光暗适应模式、B3 农场 20:00–12:00 夜间错峰 16h 补光以及人员分布。
3. 在 src/scene/ambiance/ 中实现可开关的轻动态与 WebAudio 程序化声景：10 位比例尺极简巡检小人（1.75m）、B1 AGV 穿梭、风轮与雷达缓转；漫游时按所在楼层淡入对应底噪（L2 高山风、B3 水流与风机、B4 100Hz 变压器低频嗡声）及气闸泄压声。
4. 实现【照片模式】：一键隐藏 HUD（快捷键 H）、可选景深与移轴竖线校正、16:9 / 4:5 / 2.39:1 画幅裁切与高清 PNG 导出。

完成前执行 npm run verify 与 npm run shots（输出至 docs/shots/m5/），将 docs/PROGRESS.md 中 M5 标为 REVIEW，自动 commit 与 push。
```

---

### 阶段 M6：受控模块替换、毫米测距、深链接、蓝图存取与终审打磨

> **前置**：用户签收 M5 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 4 节）与 docs/05-camera-and-walkthrough-spec.md（第 4 节）。

本轮任务仅完成里程碑 M6（模块替换实验、专业测量/分享工具与整站终审）：
1. 完善 src/data/roomTemplates.ts 可替换模块库（至少提供 4 种含完整新材质 3D 模型与真实物理参数的备选专业模块，如：第二高光强主粮水培扩展舱、加倍储能与排烟扩展间、影音音乐心理疗愈室、精密冶炼与材料再生扩展室）；替换后自动重连夹层支管并实时驱动 src/engine/ 重算热/电/粮/氧/干湿合规体检（例如把干区换成湿区应真实触发干湿违规报警！）。
2. 实现【两点毫米级测距工具】（吸附建筑顶点与墙边，在 3D 场景直接绘制精确到 mm 的尺寸标注）与【视角深链接 URL】（编码当前相机状态、机位、楼层、时间与工况，打开链接直接复现视角）。
3. 实现蓝图管理：JSON 导出/导入、localStorage 自动持久化与一键重置为 v2.0 标杆预设。
4. 全面终审打磨：检查全 6 层无穿模与阴影瑕疵、窄屏响应式标高尺横置体验、核对运行时预算（<= 400 draw calls / 60 FPS），补齐模块替换与违规联动的 Vitest 回归测试。

完成前执行 npm run verify 与 npm run shots（输出至 docs/shots/m6/），将 docs/PROGRESS.md 中 M6 标为 REVIEW，自动 commit 与 push。
```
