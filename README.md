# Project Aegis Ridge（磐石山脊避难所）

一个面向“现实工程可行性验证与沉浸式空间展示”的 **交互式 3D 山体避难所工程数字孪生（Interactive 3D Shelter Digital Twin）**。

项目选址于半山腰，地表伪装为一座常规的现代化高山生态与气象科研观测站（L1–L2），地下经由 6 米防护岩层缓冲带向下延伸出 4 层高规格自持地下综合体（B1–B4，地下总面积 2,240 m²），服务于一支 10 人规模、主副职互补的高素质科研与工程团队，用以抵御极寒、生化危机、核尘埃封锁等末日情境。

> **第一阶段定位（Phase 1）**：不是数值催命的经营游戏，也不是从零毛坯手搭模拟器，而是**把脑海中完整的避难所构想以高水准 3D 架构与工程管网可视化出来**——验证空间布局、强弱电分离、给排水闭环、三防新风、大件物流与可维修性在现实世界（近未来适度超前尺度）是否成立，并支持楼层切片、X 光管网透视、检修隔离演练、末日工况切换以及有限度的模块替换实验。

---

## 文档导航

所有设计定稿均位于 `docs/` 目录，按阅读与开发依赖顺序组织：

| 文档 | 内容说明 |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | 仓库级工程规范、Harness 验证与自动提交约束（Codex 会自动读取） |
| [`docs/PROGRESS.md`](./docs/PROGRESS.md) | **开发进度与交接账本**：记录当前所处里程碑、历史决策与验收结果（跨 Session 记忆锚点） |
| [`docs/01-shelter-engineering-spec.md`](./docs/01-shelter-engineering-spec.md) | **避难所建筑与工程总设计**：半山腰选址、L2–B4 精确坐标与房间清单、六大机电与物流管网规范、近未来可行性测算公式、四大情景工况、10 人互助专家团设定 |
| [`docs/02-visual-and-ux-spec.md`](./docs/02-visual-and-ux-spec.md) | **视觉审美与交互规格**：高级建筑微缩模型 + 洁净数字孪生配色、光照与材质标准、程序化 3D 设备精细度要求、6 图层管网透视与流向动效、UI 与检修模拟交互 |
| [`docs/03-technical-architecture.md`](./docs/03-technical-architecture.md) | **前端技术架构与数据模型**：Vite + React + TS + Three.js/R3F 分层结构、数据驱动蓝图 Schema（为 Phase 2 模拟与自由建造留好扩展位）、性能红线与自测规范 |
| [`docs/04-codex-execution-roadmap.md`](./docs/04-codex-execution-roadmap.md) | **Codex 分阶段开发路线图（M1–M6）**：每个里程碑的明确范围、验收清单，以及可直接粘贴给 Codex 的分步指令模板 |

---

## 开发推进方式（面向 Codex）

本项目推荐采用 **单仓单主干 + 6 个垂直里程碑（M1 → M6）串行推进 + 每步肉眼验收 + Git 提交存档** 的方式开发：

1. **每个里程碑开一个新的 Codex Session**，直接粘贴 `docs/04-codex-execution-roadmap.md` 中对应阶段的提示词。
2. Codex 完成后先确保 `npm run typecheck && npm run build` 通过，再在本地浏览器打开肉眼检查 3D 视觉与交互。
3. 在当前 Session 内微调至满意后，执行一次 `git commit` 留下稳定存档点，再开新 Session 进入下一里程碑。
