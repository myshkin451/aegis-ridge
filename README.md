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
npm install
npm run dev       # 本地开发预览
npm run verify    # 一键执行 typecheck + Vitest 单元测试 + 生产构建
```

---

## 开发推进方式（面向 Codex）

本项目采用 **Spec-Driven + 垂直里程碑分 Session + 5 机位截图人工签收** 模式推进：
1. 每个里程碑新开一个 Codex Session，发一句启动指令让其按 `AGENTS.md` 与 `docs/PROGRESS.md` 完成当前 `NEXT` 里程碑。
2. Codex 跑通 `npm run verify`（及 `M1.5b` 起的 `npm run shots` 5 机位截图）后，更新 `docs/PROGRESS.md` 标为 `REVIEW` 并提交推送。
3. 开发者在浏览器与验收画廊中确认满意后，签收为 `DONE` 并推进下一里程碑。
