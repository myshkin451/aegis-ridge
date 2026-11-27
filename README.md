# Project Aegis Ridge（磐石山脊高山生态与气象观测站 ARS-01）

一个以**现实工程可行性验证与双语域沉浸展示**为核心的 **交互式 3D 高山避难所数字孪生（Interactive 3D Shelter Digital Twin）**。

项目选址于海拔 `1,450.000 m` 的花岗岩南向半山腰平台：
- **山外是实景**：真实尺度的高山侵蚀山脊、远景群峰、物理天空与山谷云海，地表建有常规现代化高山科研观测站（L1–L2），周界与生命线严格遵循**“藏于科研”**原则（19 处外围设施全部拥有合理的高山科研或山地工程明面用途）。
- **剖开是图纸**：地表之下经由 `6.0 m` 复合防护层（钢筋混凝土顶盖 + 连续花岗岩）延伸出 4 层高规格地下自持综合体（B1–B4，单层 `32m × 24m = 768 m²`，地下合计 `3,072 m²`，全站总建面 `3,996 m²`），服务于一支 10 人规模、主副职互补的高素质专家团队。剖面与平面严格遵循建筑制图、地质剖面图例与 GB 7231 工业管道标识规范。

---

## 文档导航（v2.0）

| 文档 | 内容说明 |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | 仓库级工程红线、视觉纪律、Harness 验证与 `REVIEW` 签收规则（Codex 自动读取） |
| [`docs/PROGRESS.md`](./docs/PROGRESS.md) | **开发进度与视觉签收账本**：里程碑状态、历史交接记录与 5 机位截图画廊 |
| [`docs/01-shelter-engineering-spec.md`](./docs/01-shelter-engineering-spec.md) | **避难所建筑与工程总设计（v2.0）**：`16×12` 精确零重叠网格、真实尺寸核心筒、垂直干湿对齐、物理守恒可行性模型（热/电/水/粮/氧/安全）、6 大 MEP 管网、4 工况与 10 人专家团 |
| [`docs/02-visual-and-ux-spec.md`](./docs/02-visual-and-ux-spec.md) | **双语域视觉圣经与仪器 HUD 规格（v2.0）**：实景 × 图纸设计系统、溯源色板、4 字体角色、图签与真实比例标高尺、四尺度侵蚀地形、10 种程序化 PBR 材质、物理天空/云海/AgX/N8AO、5 个出片机位 |
| [`docs/03-technical-architecture.md`](./docs/03-technical-architecture.md) | **技术架构与数据模型（v2.0）**：WebGL2 渲染管线、构建期地形预计算、中立 `src/geometry/` 坐标层、纯 TS 工程引擎、纯 CSS 设计令牌与运行时预算 |
| [`docs/04-codex-execution-roadmap.md`](./docs/04-codex-execution-roadmap.md) | **Codex 分阶段开发路线图（M1.5a → M6）**：拆解清晰的垂直里程碑、验收画廊与直接可复制的 Codex 启动指令 |
| [`docs/05-camera-and-walkthrough-spec.md`](./docs/05-camera-and-walkthrough-spec.md) | **相机状态机与第一人称漫游规格**：6 状态相机、竖井下潜等 5 大招牌转场、`three-mesh-bvh` 漫游手感、气闸压差、Alt X 光透镜、测距与照片模式 |
| [`docs/06-site-security-and-lifelines-spec.md`](./docs/06-site-security-and-lifelines-spec.md) | **外围地景、隐蔽安保与逃生体系规格**：“藏于科研” 19 处外围设施清单、三条出路与 270m 东侧冲沟逃生平硐、热信号掩护、30 秒封锁编排 |
| [`docs/archive/visual-review-m1/index.html`](./docs/archive/visual-review-m1/index.html) | **设计演进归档**：基于 M1 (`1fcd52c`) 实测截图的视觉与工程评审报告（促成 `v2.0` 重定调的原始评审记录） |

---

## 本地运行与校验

```bash
npm ci
npm run dev       # 生成地形并启动本地开发预览
npm run verify    # 执行 typecheck、Vitest 与生产构建
npm run shots     # 核对原版 r0，拍摄五张固定机位与三间样板，输出四档对照图
npm run perf      # 用本机 Chrome / ANGLE Metal 实测首切、步行、环绕与推近
```

在右上角切换现场、剖面、平面、X 光和漫游。“机位与图幅”里可以进入剖切盒、楼层俯瞰和场址总览，也可定位 19 处外围设施或重现五张签收图。按 `1` 现场、`2` 剖面、`3` 平面、`4` X 光、`5` 漫游。`[` 上一层，`]` 下一层。`V` 循环六个视角，`X` 切换 X 光，`H` 隐藏图签，`?` 查看键位。

- **看剖面与平面**　拖动剖面下方的 Z 滑杆切过核心筒。点标高尺选层，进入平面后拖红色游标可改变相对楼面的剖切高度。`M` 切换机电夹层。平面中点房间可查面积、净高与分区，按 `F` 聚焦选中的房间。
- **在三维空间移动**　在现场、剖切盒、楼层俯瞰和 X 光透视视角，拖鼠标环绕，滚轮推近。用 `W/A/S/D` 沿视向在水平方向飞行，`Q` 下降，`E` 上升，按住 `Shift` 加速。贴近地面时速度约 6 m/s，高空可达 70 m/s。现场镜头受地表和站房外墙约束。转场中可以拖动、滚轮或按键立即接管。
- **走进建筑**　从“机位与图幅 → 房间索引”选房，或在图纸视图点房间、在三维视图点设备。右侧表可查位号、净用电的输入与输出、散热、尺寸和质量。选室内机位，再点“进入漫游”或按 `5`。现场进入地下房间会经过车库和货梯井，楼层俯瞰从上方落地。单击地面行走，拖动画面转头，也可用 WASD、Shift 或触屏摇杆。靠近气闸后长按 `E` 或屏上压差表约 1.5 秒。按一次 `Esc` 拉回俯瞰，再按一次返回现场。
- **复现画廊**　截图使用 Playwright Chromium 或本机 Google Chrome。首次安装浏览器可运行 `npx playwright install chromium`，也可设置 `CHROME_PATH` 指向现有 Chromium 可执行文件。运行 `npm run verify` 后执行 `npm run shots -- m2.5c`，查看[五个工程机位](./docs/shots/m2.5c/)和[三间样板的四档对照图](./docs/shots/m2.5c/pilot/comparison.webp)。

在“机位与图幅 → 固定摄影机位”选择“单人卧室 1”“光纤下的共餐客厅”或“卫浴镜柜与瓷砖”，分别在 19:30、10:30 和 19:30 进入 B2。网址加 `?quality=2&pilot=r1` 打开程序化材质与陈设，`r2` 换上实拍橡木、亚麻、墙面和瓷砖，`r3` 再加入软装、洁具、灯具、绿植、餐椅和科考挂画。默认使用 r3。同一菜单内的“公卫洁具近看”可同时看到洗手盆与马桶。原始 r0 来自 `ebbe617` 的封存截图。三个当前档位共用机位、时刻、曝光和画幅。[资产来源与尺寸](./public/assets/MANIFEST.md)

全站房间索引收录 27 间房。看平面时可从货梯南侧主走廊向东找到 2 米宽的北向联络廊，物流、图书馆、食品加工和地热各自在这一侧开门。B2 公卫从主走廊进入，淋浴、洗衣从居住内廊西端进入。居住区南排六个单人间、北排两个双人间，共十个常住床位。玄关旁的备勤宿舍另有四床。东侧前室把主走廊、居住区第二出口和疏散平硐接在一起。

地形由固定种子在构建期生成。`npm run terrain` 可单独重建测区与五个驱动通道。工程坐标见 `src/geometry/coords.ts`，外围设施见 `src/data/siteFacilities.ts`，摄影机位及其时刻见 `src/data/photographs.ts`。

---

## 开发推进方式（面向 Codex）

本项目采用 **Spec-Driven + 垂直里程碑分 Session + 5 机位截图人工签收** 模式推进：
1. 每个里程碑新开一个 Codex Session，发一句启动指令让其按 `AGENTS.md` 与 `docs/PROGRESS.md` 完成当前 `NEXT` 里程碑。
2. Codex 跑通 `npm run verify`（及 `M1.5b` 起的 `npm run shots` 5 机位截图）后，更新 `docs/PROGRESS.md` 标为 `REVIEW` 并提交推送。
3. 开发者在浏览器与验收画廊中确认满意后，签收为 `DONE` 并推进下一里程碑。
