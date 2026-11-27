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
| **M2.5a** | **A+ 格局纠偏 + 门与开口数据化 + 8+1 扩容居住区与卫浴 + M3 几何前提 + 室外剔除** | 封死全部 13 处无门侧洞、四层 `gx=10` 联络廊 + B1/B4 贯通货梯、B1 健身/工坊/仓库避振重排、B2 餐厅客厅 + 48 m² 卫浴洗衣（公卫门开主走廊）+ 8 间实墙独立卧室（6 单 15 m² + 2 双 17 m²）+ 1 间 4 床备勤宿舍（19 m²）+ 独立疏散前室（避开东梯踏步）、走廊玻璃按房间声明、卧室隔墙到结构板底、门数据与不穿房/分区测试、固化 M3 管网接口、现场视图剔除地下室内 | 零穿墙漏洞、每房独立可达不穿他房、疏散不穿卧室、站房绘制调用显著回落 |
| **M2.5b** | **“外冷内暖”基调 Round 1 + 混合资产最小管线打通 + 工坊避卧 + 灯光数据化** | B1 工坊 CNC 西移至 `x ≤ −2.5` 避卧、解耦 `visualKind` 外观注册表；拆室内外材质进 `'ars-solid'`、B2 改暖白墙漆/暖橡木护墙板与可隐藏吊顶灯槽；建 `src/data/lighting.ts` 与固定灯池、压低假自发光与地下冷半球光、恢复地下家具局部投影、建 B2 室内 PMREM 与实时 `PhysicalSky` 模拟天窗；用最小资产（1 套橡木 `DataArrayTexture` + 1 把餐椅 GLB + `MANIFEST.md`）跑通零重编译混合管线与 `?pilot=r1\|r2\|r3` | B2 三间样板真正温馨可居、家具落地有阴影、峰值绘制 `≤ 370` 为 M3 留余量、零新增 `linkProgram` |
| **M2.5c** | **CC0 实拍 PBR 贴图铺量 + 软装/洁具低模 GLB + 温馨挂画 + 全站铺开与 r0–r3 正式对照** | `DataArrayTexture` 铺满橡木/亚麻/墙漆/瓷砖；软装与洁具低模 GLB（枕被/沙发软垫/马桶洗手台/灯具/绿植，硬家具保持程序化倒角）；接入受控 2D 挂画/科考海报；铺开 B1 健身胶垫、B3 抗菌板、图书馆书脊与其余楼层室内反射；产出正式 `r0–r3` 四轮对照图 | 室内软装轮廓柔软自然、全站无画风断层、预算（下载/显存/帧率）按 M2.5b 实测锁死 |
| **M3** | **6 大工程管网（MEP）+ GB 7231 色环 + Alt X 光透镜 + 水流/阀门追踪** | 夹层与核心竖井 6 套物理合规管网（线型+系统色）与新风末端送回风口格栅、管道表面 GB 7231 识别色环与位号牌、**漫游按住 Alt 的 X 光透视透镜**（穿过含 B2 吊顶灯槽在内的 `'ars-solid'` 墙顶）、抬头 >30° 看夹层、点水管“顺着水走”高亮、悬停阀门影响描红 | X 光夜景出片震撼、强弱电与干湿隔离经得起细查、Alt 透镜手感惊艳、总绘制 `≤ 400` |
| **M4** | **物理守恒可行性引擎 + 中控真态势屏 + 隔离检修 + 30 秒封锁编排 + 4 工况 LUT** | 诚实物理计算引擎（含堆侧废热、热信号掩护、岩体温升、分层农学、5–14 人氧气与 14 人应急扩员、储能排烟、CHP 密闭闭锁）+ 全套 Vitest 单测、B2 中控室多屏实时态势界面、模拟隔离检修与 B1 搬运路径、30 秒封锁编排（联动 `lighting.ts` 应急照明）与 4 工况 3D LUT | 数值绝不造假（不合理必报 WARN/FAIL）、拖人数滑杆立见余量变号并追溯责任设备 |
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
2. 为全部 26 个房间写入真实工程参数（powerKw、thermalEfficiency、heatRejectionKw、o2RateKgPerDay、moduleSizeM、weightKg、tagCode 等）与 1–3 个精选机位锚点（cameraAnchors），点击任意房间或设备在右侧弹出 1px 细线工程数据表，支持一键“掀顶落地 / 竖井下潜”进入该房漫游；替换掉 M1.5b 临时样段 StudyFixtures.tsx，并确保新增室内材质/合批模型全部纳入首屏 warmPrograms 预热与漫游缓存 BVH（不得破坏零切换顿挫与 <= 400 绘制调用预算；顺手在 capture-shots.mjs 切机位时重置光标读数消除上个机位坐标残留）。
3. 扩充 Vitest 测试验证全部设备参数完整性与房间机位锚点合法性（校验设备不越出房间边界、不堵死走廊与门洞通行）。

完成前执行 npm run verify、npm run shots（输出至 docs/shots/m2/）与 npm run perf（确保切视图主线程 <= 50 ms、交互后新增 linkProgram = 0、绘制调用 <= 400），将 docs/PROGRESS.md 中 M2 标为 REVIEW，自动 commit 与 push。
```

---

### 阶段 M2.5a：A+ 格局纠偏、门数据化、8+1 扩容居住区与 M3 几何前提

> **前置**：M2 已签收，在进入 M3 管网之前先彻底修复建筑平面与拓扑硬伤，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 3–4 节）、docs/03-technical-architecture.md 与 docs/06-site-security-and-lifelines-spec.md（第 3 节），并检查当前 src/data/floors.ts、src/data/defaultBlueprint.ts、src/geometry/doors.ts、src/geometry/stairs.ts、src/scene/utils/shellGeometry.ts、src/scene/rooms/RoomInteriors.tsx 与 tests/blueprint.test.ts / roomRoutes.test.ts / rooms.test.ts。

本轮任务仅完成里程碑 M2.5a（A+ 修正版格局纠偏 + 门与开口数据化 + 扩容居住区与卫浴 + M3 几何前提固化 + 室外剔除；本轮不重做室内的灯光与精装材质，留给 M2.5b）：
1. 门与开口数据化、封死全楼 13 处非法无门侧洞（src/geometry/doors.ts、src/scene/utils/shellGeometry.ts）：
   - 取消 shellGeometry.ts 在房间侧墙默认自动切出 2.04 m 无门洞口的逻辑；所有侧墙默认为完整实墙，一切墙体开口必须由统一的门/开口数据实体驱动（显式声明 id、floor、position/axis、width、height、kind: 'airlock' | 'fire' | 'acoustic' | 'insulated' | 'sliding'、rooms/zones）；
   - 走廊玻璃改为由房间数据（如 corridorGlazing）显式声明，严禁再按楼层一刀切：仅 b2_commons、b3_hydroponics、b3_aquaponics 等展示/生态房保留走廊玻璃，b2_quarters、b2_medical、b2_command、b3_coldvault 全部改为实墙；
   - 合法保留并配真实门扇的内部连通门：B1 b1_workshop ↔ b1_warehouse（推拉防火门）、B3 b3_hydroponics ↔ b3_aquaponics（推拉隔离门）、B4 b4_drainage ↔ b4_geothermal（设备套间门）；其余 B1 洗消/物流、B2 医务/图书馆/中控、B3 净水/食品加工/冷库、B4 地热/配电与微核堆/三防新风之间全部恢复封闭实墙。
2. 四层北中段独立可达（gx=10 联络支廊）与东北干区东移（src/data/floors.ts、src/data/defaultBlueprint.ts、src/data/roomLayouts/）：
   - 在 B1–B4 固定骨干中新增 gx=10, gz=0..4（共 5 格，使每层骨干为 33 格、房间 159 格、总计 192 格满铺）：其中 gz=2..4 为 2m 宽公共联络支廊，使 B1 物流、B2 图书馆、B3 食品加工、B4 地热全部直接开合规门入联络廊，不再借道相邻房间或防烟楼梯；gz=0..1（8 m²）作为端头嵌入式储藏/机电壁龛，保证全部房间保持严格矩形；
   - 东北绝对干区列由 gx=10..15 调整为 gx=11..15, gz=0..4（100 m²/层），同步将 b1_tactical、b2_command（弧形台 HMI-201 适当收窄适配 10m 宽留足走道）、b3_coldvault（冷库门朝 gx=10 联络廊配保温门方便进食品加工间）、b4_switchgear 内全部设备与机位锚点合法东移并零越界；
   - B1 与 B4 的 3t 货梯井（gx=5..6, gz=3..4）北墙增设贯通后门直通 b1_logistics 与 b4_geothermal。
3. B1 避振重排与 B2 南翼彻底重构（含 8+1 扩容居住区、48 m² 卫浴洗衣与独立疏散前室）：
   - B1 南翼自西向东重排为：b1_gym（gx=0..3, gz=6..11，96 m²，replaceable: true，正压 B2 餐厅且封锁期可用）、b1_workshop（gx=4..7, gz=6..11，96 m²，紧邻货梯）、b1_warehouse（gx=8..15, gz=6..11，192 m²，安静立体总库正压 B2 卧室区）；全站由 26 间扩为 27 间房；
   - B2 南翼自西向东重排为：
     * b2_commons（gx=0..4, gz=6..11，120 m²，3.6m 抬高）：保留 4×6m 防火玻璃中庭、光纤阳光与潜望镜，开放厨房贴东侧共用水墙，补出南侧 L 型沙发与影音客厅区；
     * b2_bath_laundry（gx=5..6, gz=6..11，48 m²，wetDryZone: 'wet'）：北段 12 m² 公共卫生间**门直接开向主走廊（严禁开进餐厅）**，中南段 36 m² 独立淋浴间与洗烘房从居住区西端内廊进入；配置船用真空马桶与淋浴/洗衣设备元数据（记录 10 人日常灰水/黑水用水定额，供 M3/M4 读取）；
     * b2_quarters（gx=7..15, gz=6..11，216 m²，x ∈ [-2, 16], z ∈ [0, 12]）：
       - 东西向 2.0 m 静谧内廊（z ∈ [5, 7]）西接玄关（x ∈ [-2, 0], z ∈ [0, 5] 开门入主走廊）与淋浴洗衣房；
       - **南排 6 间独立单人卧室**（各 3.0 × 5.0 m = 15.0 m²，实墙砌至结构板底 3.9 m 封堵 0.9 m 夹层防串音，配独立隔声门）；
       - **北排 2 间双人/大套间**（各 3.4 × 5.0 m = 17.0 m²，x ∈ [3.8, 7.2] 与 [7.2, 10.6]，与南排 6 单人合计精准常住 10 人）+ **北排西端紧邻玄关 1 间 4 床模块化备勤/应急宿舍**（3.8 × 5.0 m = 19.0 m²，x ∈ [0, 3.8]，支持 M4 14 人扩员工况且不穿私人内廊）；北侧临主走廊墙为实墙隔声墙砌至板底；
       - **东北角独立防火疏散前室**（x ∈ [10.6, 16.0], z ∈ [0, 3.0]，16.2 m²）：由防火墙彻底与卧室隔离；北墙防火门设在主走廊东端 x ≈ 11.3, z = 0（**严禁开在东梯 x ∈ [12, 16] 梯段中部**！撤离人员从东梯 B2 西平台 x ∈ [12.0, 12.92] 一步出主走廊东端即进前室），东墙直通 270 m 东平硐（z = 1.5）；居住区内廊东端另设防火门经短廊接入该前室，保证居住区具备两个独立疏散方向；同步更新 siteFacilities.ts 的 eastTransfer 路径。
4. 固化 M3 管网几何前提与回收室外绘制调用：
   - 在房间/设备数据中显式固化 B2 真空排污接点（走 B3 夹层接 gx=4 湿井）、B1/B3/B4 西北湿区列值班卫浴接口、B4 地埋井群立管接口、B4 电解制氧安全排氢（H₂）与 CO₂ 吸附接点、B3 鱼菜水泵减振基座说明，以及 B2 卧室板底隔声墙的夹层穿管套管预留位；
   - 修复 RoomInteriors.tsx 在 site 室外视图渲染被 6m 岩层遮挡的 B1/B2 地下室内的问题（仅 L1/L2 或竖井下潜过程在 site 室外可见），立刻回收站房推近绘制调用余量。
5. 重写并强化 Vitest 回归测试（tests/blueprint.test.ts、tests/rooms.test.ts、tests/roomRoutes.test.ts）：
   - 校验 33 骨干格 + 159 房间格 = 192 格满铺、27 间房元数据与设备零越界、干湿垂直对齐；
   - 新增拓扑与建筑合规硬测试：① 主走廊到任意地下房间机位的合法路径**严禁穿过其他房间**；② 不同压力、干湿或防火分区的相邻房间之间不得存在无门扇开口；③ 疏散路线（eastTransfer 及东梯至平硐）严禁进入任何卧室区域，且 B2 东梯西平台至疏散前室与平硐连通无碰撞；④ 居住区内廊具备东西双疏散出口；⑤ 走廊玻璃仅存在于显式声明房间。

完成前执行 npm run verify、npm run shots -- m2.5a（输出至 docs/shots/m2.5a/，同步更新 scripts/capture-shots.mjs 默认里程碑参数）与 npm run perf（确保主线程 <= 50 ms、新增 linkProgram = 0、峰值绘制调用 <= 400 且较 M2 381 明显下降），将 docs/PROGRESS.md 中 M2.5a 标为 REVIEW，同步文档后自动 commit（feat(m2.5a): ...）并 git push origin main。
```

---

### 阶段 M2.5b：“外冷内暖”基调 Round 1、灯光数据化与混合资产最小管线打通

> **前置**：用户已签收 M2.5a（`ebbe617`）为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/02-visual-and-ux-spec.md（第 4–5 节）与 docs/03-technical-architecture.md（第 4 节），并检查 M2.5a（ebbe617）之后的 src/scene/materials/pbrLibrary.ts、src/scene/rooms/roomModels.ts、src/scene/rooms/residential.ts、src/data/roomLayouts/upper.ts、src/geometry/residentialPlan.ts、src/scene/utils/shellGeometry.ts、src/scene/utils/modelBuilder.ts、src/scene/utils/Model.tsx、src/scene/atmosphere/warmPrograms.ts、RenderPipeline.tsx、PhysicalSky.tsx 与 FibreDaylight.tsx。

本轮仅完成里程碑 M2.5b（“外冷内暖”基调 Round 1 + 混合资产最小管线打通）：在不做外部贴图铺量与全套软装 GLB 的前提下，先让 B2 单人卧室 1、共餐客厅、卫浴三间样板“像有人长住的家”；同时用最小资产（1 套 CC0 橡木贴图 + 1 把餐椅 GLB）证明贴图与 GLB 管线在零新增 linkProgram 下跑通。实拍贴图铺量、其余软装/洁具 GLB、正式 r0–r3 对照与全站材质铺开属于 M2.5c，本轮不做。

0. 硬约束（任一不满足即视为未完成）
- 交互就绪后新增 linkProgram = 0；任意视图切换与切房主线程 ≤ 50 ms；峰值绘制调用 ≤ 370（为 M3 管网预留 ≥ 30 次，含室内阴影更新帧），并汇报较 M2.5a（347）的增量；稳态 60 FPS；控制台零错误、零警告。
- 已签收的 5 张固定机位不得回退，尤其 shot-01 蓝调剖面“切开的灯笼”：现场 / 剖面 / 平面 / X 光视图下的地下观感保持 M2.5a 水平，本轮变化只体现在漫游与新增样板机位。
- 不改墙体、门表与房间边界；不改 src/engine/。

1. 工坊避卧（数据层）
- 重排 src/data/roomLayouts/upper.ts 中的 b1_workshop：重振动的 CNC-142 与 REC-141 平面占地须满足 x ≤ −2.5（距 B2 单人卧室 1 西墙 x = −2 至少 0.5 m），落在 B2 卫浴洗衣与餐厅东缘上方；安静的 PCB-144、AMF-143 可占用东侧，包括卧室 1 投影区。可旋转设备，保证 CNC 正面操作区 ≥ 1.0 m、其余检修侧 ≥ 0.6 m，并按 RAI-145 吊轨覆盖范围核对上料路径。
- CNC-142、REC-141 的 notes 补登惯性基座 + 弹簧减振器，口径与 M2.5a 泵组减振一致。
- 新增 Vitest 测试：两台重振设备的平面投影与 B2 全部卧室矩形零交叠；工坊内设备零重叠，门到每台设备有 ≥ 0.9 m 通道。

2. 外观分派解耦
- 设备 / 家具数据新增显式 visualKind；roomModels.ts 按 visualKind 查注册表分派，不再按楼层 ID 选绘制函数；未声明者沿用现有绘制，保证零回归。
- 注册表同时支持 'procedural' 与 'glb' 两类实现，GLB 缺失时自动回落程序化。尺寸、安装点、碰撞盒、位号只取项目数据，GLB 按包围盒对齐 moduleSizeM；同一 visualKind 的全部实例共享一份几何与材质，走 InstancedMesh。

3. 材质拆分与暖调建筑收口（全部进现有 'ars-solid' 单一着色器）
- 在 pbrLibrary.ts 的 finish 分支链中新增 oak_int、plaster（#EAE5DA 暖米白）、fabric（燕麦 / 陶土 / 鼠尾草绿 / 暖灰）、tile（瓷砖与洁具陶瓷两档粗糙度）、pvc_clean、rubber_gym；原 wood 仅留给室外落叶松。不得改变 customProgramCacheKey 分组，不得新增程序变体（保证 M3 的 Alt X 光透镜可统一裁切）。
- 床垫、被子、枕头、沙发软垫从 epoxy 改为 fabric；室内木作从 wood 改为 oak_int；residential.ts 中冷青灰床品色改为上述低饱和暖色。
- B2 卧室、餐厅客厅、图书馆内墙从 stone 改为 plaster + 暖橡木护墙板与踢脚线，补门套收口；B2 吊顶灯槽做成可单独隐藏的一层（供 M3 Alt 透镜与抬头看夹层穿行），送回风口格栅本轮不做，留给 M3 按新风管网末端位置生成；卫浴墙地改为 tile；B4 地下 wash 由偏蓝改为约 4500 K 中性白。B1 健身、B3 的材质铺开留给 M2.5c。

4. 真实温馨光照与灯光数据化（Round 1 核心）
- 地下假自发光（pbrLibrary.ts 中的 totalEmissiveRadiance += albedo × wash × pool）改为按视图切换的 uniform：现场 / 剖面 / 平面 / X 光保持 M2.5a 强度，漫游态压低到真实光影主导的底噪，系数写入文档。
- 压低地下冷白半球光（PhysicalSky.tsx 第 256–268 行）：现场 / 剖面 / 地表 L1–L2 保持不变，但进入地下漫游态时，将 hemisphereLight 强度从 1.36 压低至柔和暖调底光（约 0.25–0.35，天顶 #f5e2c6 / 地面 #7d6c5d），防止冷蓝全局半球光冲淡 2700 K 暖光池与明暗反差。
- 灯位、色温、强度预设写成纯数据（src/data/lighting.ts，按房间与时段索引），供 M4 封锁应急照明与 M5 24h 节律时间轴直接驱动；本轮先落地 19:30 与 10:30 两档预设。
- 开场即创建并常驻一个固定灯池（数量、类型、castShadow 全程不变，非漫游时强度为 0）：1 盏投影 SpotLight（不用点光源投影）+ 至多 3 盏无阴影 PointLight + 至多 2 盏 RectAreaLight（RectAreaLightUniformsLib.init 须在预编译前调用）。漫游时按 src/data/lighting.ts 随当前房间移到预设灯位（床头灯、餐桌吊灯、沙发落地灯、镜柜灯带），色温 2700–3000 K。灯池必须在 precompileSurvey 之前进入场景。
- 室内阴影按需更新 + 恢复室内家具投影：CSM 三盏灯与室内 SpotLight 均设为 shadow.autoUpdate = false；仅在切房、开门时令室内 SpotLight 的 shadow.needsUpdate = true 且当帧 gl.shadowMap.needsUpdate = true（CSM 保持 needsUpdate = false，绝不连带重画 CSM），阴影相机 near/far 收紧到房间尺度不画山体；同时修改 Model.tsx 室内模型全部禁用 castShadow 的逻辑，让地下当前层室内家具/设备在室内 SpotLight 阴影更新 pass 中正常投射落地阴影（同时通过层隔离或按态切换确保室外 CSM 绝不绘制地下家具）。
- 室内反射：漫游 B2 时 scene.environment 从天空 PMREM 换成开场烘一次的 B2 室内 PMREM（cubeSize 与天空 PMREM 相同，保证程序键不变），彻底消除瓷砖、洁具、玻璃反射室外蓝天的问题。
- 调优漫游态 N8AO 半径与强度，保证桌腿、床底、马桶底座有清晰接触暗部。

5. 三间样板温馨陈设（程序化几何即可）
- 单人卧室 1：通顶暖橡木衣柜、软包床头板、床头暖光灯、地毯、书架小景、模拟天窗（**模拟天窗直接复用 PhysicalSky 同一套天空着色器实时绘制，随 sunAt(time) 变化，不使用静态图片**）。
- 共餐客厅：长桌与餐椅、餐桌暖光吊灯、L 型布艺沙发、茶几与地毯、光纤出光微光锥（白昼随 sunAt(time) 点亮）。
- 卫浴：镜柜与暖灯带、干湿玻璃隔断、叠放洗烘机。

6. 混合资产管线打通（最小证明）
- 建立 public/assets/MANIFEST.md，每项外部或离线生成的资产登记：来源 URL、作者、许可证（仅 CC0 或已署名 CC-BY；自生成资产注明“本项目生成”）、真实米制尺寸或平铺尺度、原始与压缩后体积、GPU 显存估算。
- 贴图路径：CC0 实拍贴图打成一张 DataArrayTexture（sampler2DArray）接入 'ars-solid'，按 finishIndex 取层，沿用现有世界米制投影。本轮只落地 1 套室内橡木（颜色 + 法线 + 粗糙度，1K WebP，优先 Poly Haven / ambientCG）。若无外网，先用构建期脚本生成同格式占位贴图，并在 MANIFEST 标记“待替换”。
- GLB 路径：GLTFLoader（meshopt 可选，不用 DRACO、KTX2）。加载后丢弃 GLB 自带材质、重映射到项目 'ars-solid' 材质；曲面网格改用三平面混合或模型 UV，并关闭 boxEdges，避免逐面接缝。本轮只落地 1 个 GLB：餐椅（若无外网，用 Node + GLTFExporter 在构建期生成）。
- 两类资产都须在首屏 ready 前加载完成、挂上 clippingPlanes 并经过 precompileSurvey；另加一项测试或检查，证明资产晚到时同样不新增 linkProgram。

7. 样板机位与对照开关
- 在 src/data/photographs.ts 新增 pilot-bedroom（锁 19:30 验晚间暖灯与暮色实时天窗）、pilot-commons（锁 10:30 白昼验光纤真阳光锥与橡木长桌暖厅）、pilot-bath（锁 19:30 验镜柜暖灯带与瓷砖室内 PMREM 反射）三个机位（优先复用现有房间机位锚点），固定曝光与画质（PhysicalSky.tsx 启动 PMREM 循环自动覆盖 photographs 中的 10:30）。
- 开工前先在 ebbe617 生产构建上按同一三个机位与时刻截取 r0 基线。新增运行期开关 ?pilot=r1|r2|r3（r1 关贴图与 GLB 回落程序化；r2 只开贴图；r3 全开）。capture-shots.mjs 在同一份最终生产构建上输出 docs/shots/m2.5b/pilot/{r0,r1,r2,r3}-{bedroom,commons,bath}.png；本轮 r2/r3 仅作管线验证，正式对照在 M2.5c。

完成前执行 npm run verify、npm run shots -- m2.5b（同步更新 scripts/capture-shots.mjs 默认里程碑参数）与 npm run perf（新增“漫游进入三间样板”与“切房阴影更新”两段；汇报峰值绘制调用及较 M2.5a 的增量、新增资产下载体积、纹理显存估算与首屏 GPU 就绪耗时变化）。将 docs/PROGRESS.md 中 M2.5b 标为 REVIEW，同步 README 与 docs/02、03、04，按 AGENTS.md 第 5.3 节 commit（feat(m2.5b): ...）并 git push origin main。
```

---

本阶段实拍在 [M2.5b 画廊](shots/m2.5b/)。其中 [r0](shots/m2.5b/pilot/) 来自改动前的 `ebbe617`，三张原图按 SHA-256 核验。最终构建分别打开 r1、r2、r3 重拍三个机位。真机门槛、开场耗时、切房阴影及迟到资产复核记录在 [PROGRESS](PROGRESS.md)。

### 阶段 M2.5c：CC0 实拍 PBR 贴图铺量、软装/洁具低模 GLB、温馨挂画与全站铺开

> **前置**：用户签收 M2.5b 为 `DONE`，**新建 Codex Session**。完整启动指令待 M2.5b 实测绘制调用与显存数据回传后定稿，以下为锁定原则：
> 1. **Round 2（实拍贴图铺量）**：在 M2.5b 的 `DataArrayTexture` 中补齐室内暖橡木、粗亚麻织物、暖白哑光墙面、卫浴防滑瓷砖四套 CC0 实拍 1K WebP 贴图；
> 2. **Round 3（软装与洁具低模 GLB + 2D 艺术挂画）**：仅软装与洁具换 GLB（枕头 ≤ 2k 面、被子 ≤ 4k、沙发软垫 ≤ 8k、马桶/洗手台 ≤ 6k、灯具与绿植；硬家具保持程序化倒角，全部 GLB 丢弃自带材质重映射到 `'ars-solid'`）；可选安装本地 Blender 用 Python 后台布料模拟烘焙柔软轮廓；接入受控 2D 温馨挂画/科考海报（存放 `public/assets/art/`，长边 1024px WebP，MANIFEST 登记来源与 CC0 声明）；
> 3. **全站材质铺开**：补齐 B1 健身胶垫、B3 洁净抗菌板、B2 图书馆书脊与其余楼层的室内 PMREM 反射；仅在截图仍显墙角死黑时再启用构建期 3D 辐照度体积纹理；
> 4. **硬预算（待 M2.5b 校准）**：新增下载 ≤ 4 MB，纹理显存 ≤ 64 MB，首屏 GPU 就绪增量 ≤ 0.5 s，峰值绘制调用仍 ≤ 370（留足 M3 余量），产出正式 `r0–r3` 四轮对照图。

---

### 阶段 M3：6 大工程管网（MEP）、GB 7231 色环与漫游 Alt X 光透镜

> **前置**：用户签收 M2.5c 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 3、5 节）、docs/02-visual-and-ux-spec.md（第 1.2 节）与 docs/05-camera-and-walkthrough-spec.md（第 4 节），并检查 M2 已完成的 src/scene/CoreTraces.tsx、src/scene/FloorSliceGroup.tsx、src/scene/rooms/RoomInteriors.tsx、src/scene/materials/pbrLibrary.ts 与 src/scene/atmosphere/warmPrograms.ts。

本轮任务仅完成里程碑 M3（6 大工程管网、GB 7231 标识与漫游 X 光透镜）：
1. 在 src/data/mepNetwork.ts 中生成完整合规的 6 套管网拓扑（强电 power、弱电/智控 data、给排水 water 含给水/排水双子路、三防新风与热力 air 含独立送排风及 B4 储能独立热失控排烟道/CHP 排烟接口、重载物流吊轨 freight、结构与防护/逃生边界 structure）：
   - 严格遵循 v2.0 扩容核心筒（湿井 gx=4 与电气井 gx=9 相距 8.0 m，电气井实体隔板分西强东弱）、地下 0.9 m 顶部夹层（严格绕开 B2 餐厅/图书馆 3.6 m 抬高区与 B2↔B3 4×6 m 挑空中庭净口）、强弱电夹层桥架物理间距 >= 0.4 m，以及东北绝对干区（b2_command、b4_switchgear 上方）零给排水管穿越铁律；
   - 接入外围与双平硐真实接点（上游山泉进水至 B3 净水站、B4 深层排水经重力暗管外排东侧冲沟、双进风口/排风口至 B4 三防新风站）；
   - 为关键管段与阀门配置规范位号（如 V-B3-012）及完整的上下游有向拓扑（支撑水流全链路追踪与阀门下游受影响房间求解），并补充 Vitest 回归测试校验干湿零穿越、强弱电间距 >= 0.4 m、夹层/中庭净空不冲突与上下游拓扑连通性。
2. 在 src/scene/mep/ 中实现双尺度管网表达（完整替换 M1.5b/M2 的占位 CoreTraces.tsx）：
   - 宏观 / X 光 / 剖面 / 平面 / 楼层俯瞰视图：使用 docs/02 规范的系统色 + 制图线型（强电实线、弱电短虚线、给水实线配法兰节点、排水长虚线标坡度、三防新风双线、物流点划线、结构防护斜线填充）与柔和流向微光（仅在 useFrame 中改 uniform，严禁每帧 setState）；
   - 近距 / 漫游 / 夹层裸露视图：实体管道表面贴 GB 7231 基本识别色环、介质名、流向箭头与阀门位号牌（合批 InstancedMesh / 合并几何 + 共享纹理图集，不生成零散节点）。
3. 实现三项招牌管网交互（全部保持零切换顿挫、交互期新增 linkProgram = 0）：
   - 漫游时按住 Alt 激活以鼠标光标（指针锁定时为屏幕中心）为圆心的圆形【X 光透视透镜】，实时看穿墙后、B2 可隐藏吊顶灯槽与吊顶后管线与桥架（直接通过 'ars-solid' 共享 uniform 裁切 + HUD 1px 圆形透镜准环实现，零新增渲染 Pass 与着色器重编译，失焦/松键必复位）；
   - 地下主走廊漫游仰视超过 30° 自动平滑半透明化走廊吊顶饰板与灯槽，显露 0.9 m 顶部夹层内强弱电桥架、风管与吊轨（不影响普通状态不透明材质与阴影）；
   - 按新风管网实际末端位置在吊顶生成对应的送回风口格栅；
   - 【顺着水走】点击任意给水/排水管段沿上游水源/水箱 → 用水点 → 净水站/重力外排全链路高亮追踪；悬停（或漫游准星对准）任意阀门自动描红下游受影响房间，并在右侧 1px 数据表/读数区显示阀号、介质、状态与受影响房间清单。
4. 联动左下角 6 大系统线型图例面板（含夹层 M 勾选）：勾选不仅作用于 X 光视图，也联动剖面/平面/楼层俯瞰/剖切盒/漫游中的管网显隐（不强行踢回 X 光），并升级 shot-04（X 光夜景）出片效果。
5. 严格守住性能与绘制预算（M2.5a 峰值 347、M2.5b/c 限额 ≤ 370，全站硬上限 400）：所有新增 MEP 几何与标识必须高度合批，非 X 光的 site 室外视图自动剔除地下管网避免抬高站房推近绘制数，全部新材质/透镜/透明变体纳入 precompileSurvey 预热；同步更新 scripts/capture-shots.mjs 默认里程碑为 m3，并在 scripts/measure-perf.mjs 中增加 M3 专项回归段（图例开关、Alt X 光透镜、走廊抬头看夹层、点水管链路追踪与阀门悬停），确保全段主线程 <= 50 ms、交互后新增 linkProgram = 0、峰值绘制调用 <= 400、控制台零错误警告。

完成前执行 npm run verify、npm run shots -- m3（输出至 docs/shots/m3/）与 npm run perf 全部达标，将 docs/PROGRESS.md 中 M3 标为 REVIEW，同步 README 与 docs/ 变更后自动 commit（feat(m3): ...）并 git push origin main。
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
3. 接入右侧按需【工程体检】与【模拟隔离检修】数据表，并落地 **B2 中控室多屏实时态势界面**（屏幕内容直连可行性引擎与封锁状态，杜绝假数据）：点击报警项自动平滑飞镜高亮目标房间/管段；隔离检修态在 3D 清晰呈现隔离红段、接管备用回路与 B1 搬运路径。
4. 实现 4 种情景切换（日常 / 极寒 -60℃ / 生化孢子 / 核尘埃封锁）与入住人数（5–14 人，覆盖 10 人常住基线与 14 人应急扩员工况）调节：落地 4 套克制 3D LUT、暴雪/孢子/沉降粒子，以及 docs/06 第 4 节完整的【30 秒封锁编排动画】（地柱→廊道闸门→装甲门→外立面百叶→温室盖板与光伏折叠→雷达维持缓转→B1 压差拉升→驱动 src/data/lighting.ts 封锁应急照明→图签变“封锁 · 第 1 天”），并保证更改人数后能直观看到氧气/净水/热量等余量变号且一键追溯至责任设备。

完成前执行 npm run verify、npm run shots（输出至 docs/shots/m4/）与 npm run perf，将 docs/PROGRESS.md 中 M4 标为 REVIEW，自动 commit 与 push。
```

---

### 阶段 M5：10 人专家团、晨间巡检、24h 节律时间轴、分层声景与照片模式

> **前置**：用户签收 M4 为 `DONE`，**新建 Codex Session**。

```text
请先完整阅读 AGENTS.md、docs/PROGRESS.md、docs/01-shelter-engineering-spec.md（第 8 节）、docs/02-visual-and-ux-spec.md（第 5.2–5.3 节）与 docs/05-camera-and-walkthrough-spec.md。

本轮任务仅完成里程碑 M5（10 人专家团、24h 节律时间轴、分层声景与照片模式）：
1. 在 src/data/crew.ts 定义完整 10 位专家（主专业 + 2 副专业、居住舱绑定、责任区与巡检路径），右侧新增【专家团】标签页；支持加载 public/assets/crew/crew_01..10.png，缺失时优雅降级为克制几何工程徽章；点击专家高亮其负责房间、管网与互助搭档，支持一键启动【晨间巡检】自动第一人称导览并配字幕说明。
2. 实现 24 小时时间轴控制（含延时播放）：实时联动外部物理太阳轨迹与 B2 实时模拟天窗、直接驱动 src/data/lighting.ts 控制 B2 居住区 2200–5000K 节律照明与夜间 1800K 低位琥珀夜灯、B2 中控室 23:00–06:30 红光暗适应模式、B3 农场 20:00–12:00 夜间错峰 16h 补光以及人员分布。
3. 在 src/scene/ambiance/ 中实现可开关的轻动态与 WebAudio 程序化声景：10 位比例尺极简巡检小人（1.75m）、B1 AGV 穿梭、风轮与雷达缓转；漫游时按所在楼层淡入对应底噪（L2 高山风、B3 水流与风机、B4 100Hz 变压器低频嗡声）及气闸泄压声。
4. 实现【照片模式】：一键隐藏 HUD（快捷键 H）、可选景深与移轴竖线校正、16:9 / 4:5 / 2.39:1 画幅裁切与高清 PNG 导出。

完成前执行 npm run verify、npm run shots（输出至 docs/shots/m5/）与 npm run perf，将 docs/PROGRESS.md 中 M5 标为 REVIEW，自动 commit 与 push。
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

完成前执行 npm run verify、npm run shots（输出至 docs/shots/m6/）与 npm run perf，将 docs/PROGRESS.md 中 M6 标为 REVIEW，自动 commit 与 push。
```
