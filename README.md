# 磐石山脊 · 私人高山堡垒（Project Aegis Ridge）

海拔 1,450 m 的半山腰上，两层地表建筑与四层地下空间通过客梯和货梯相连。V3 以 6–8 人长期居住为设计目标。V3-1 更新了渲染、日常操作和垂直交通，现有各层房间沿用原布局。

---

## 工程规范与阶段记录

| 文档 | 内容说明 |
| --- | --- |
| [V3 私人高山堡垒方案](./docs/07-v3-private-fortress-redesign.md) | 三个重构阶段、双梯停靠与居住空间规划 |
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
npm run shots -- v3-1  # 生产构建的五个固定机位
npm run perf      # 在 Chrome / ANGLE Metal 实测环绕、直达、乘梯、封锁与摄影
```

右上角的四个数字键依次切换外景、剖面、平面和漫游。点标高尺选层，拖剖面滑杆查看建筑内部。从“房间直达”选房可以直接进入室内。在平面中也可点选房间，再选镜头进入。

- **乘梯**　按 4 进入当前层客梯厅，或从“房间直达”选择 L1 货梯厅。靠近门后等待开门，向前走入轿厢，点右侧楼层键。客梯服务 L2–B4，货梯服务 L1–B4。抵达后可转身或按 S 退回走廊。
- **漫游**　拖动画面转向，WASD 或触屏摇杆移动，点击地面可走到落点。长按 E 给气闸平压。按 Esc 拉出到楼层俯瞰。
- **情景与物资**　图签可选日常晴天、极寒暴雪和全面封锁。暴雪和封锁使用 30 秒防护编排。堡垒状态列出供电、储能、供水、农场、空气及主粮储备。库存年限使用满库和当前人数估算。
- **时间与照片**　拖底部时间轴查看一天的光照。拍照支持调整画幅与垂直校正，导出 PNG。分享视角会生成包含镜头、时间与情景的链接，本机预览生成的链接使用本机地址。按 H 隐藏界面，按 ? 查看键位或播放开场导览。
- **固定机位**　“房间直达”里的摄影机位可复现五张验收图，以及卧室、共餐厅、卫浴的近景。默认启用实拍材质和 V3 植被。

地形由固定种子在构建期生成。`npm run terrain` 可单独重建测区与五个驱动通道。工程坐标见 `src/geometry/coords.ts`，外围设施见 `src/data/siteFacilities.ts`，摄影机位及其时刻见 `src/data/photographs.ts`。

---

## 开发推进方式（面向 Codex）

本项目采用 **Spec-Driven + 垂直里程碑分 Session + 5 机位截图人工签收** 模式推进：
1. 每个里程碑新开一个 Codex Session，发一句启动指令让其按 `AGENTS.md` 与 `docs/PROGRESS.md` 完成当前 `NEXT` 里程碑。
2. Codex 跑通 `npm run verify`（及 `M1.5b` 起的 `npm run shots` 5 机位截图）后，更新 `docs/PROGRESS.md` 标为 `REVIEW` 并提交推送。
3. 开发者在浏览器与验收画廊中确认满意后，签收为 `DONE` 并推进下一里程碑。
