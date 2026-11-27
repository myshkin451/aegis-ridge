# ARS-01 室内资产

资产随站点交付。浏览器从本站读取下列四个文件，不连接作者网站。

| 文件 | 来源、作者与许可 | 实尺与加工 | 作者文件 | 随站发布 | GPU 开销 |
| --- | --- | --- | ---: | ---: | ---: |
| pilot/oak-diff.webp | [Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01)，Jenelle van Heerden，[CC0](https://polyhaven.com/license) | 1.8 × 1.8 m，1K JPG 转 1024² WebP，质量 83；sRGB 漫反射 | 641,756 B | 93,564 B | 数组第 0 层 |
| pilot/oak-nor_gl.webp | 同一套橡木扫描与许可 | 1.8 × 1.8 m，1K JPG 转 1024² WebP，质量 95；OpenGL 切线法线，无颜色转换 | 484,844 B | 110,180 B | 数组第 1 层 |
| pilot/oak-rough.webp | 同一套橡木扫描与许可 | 1.8 × 1.8 m，1K JPG 灰度转 1024² WebP，质量 88；线性粗糙度 | 865,194 B | 350,574 B | 数组第 2 层 |
| pilot/dining-chair.glb | [Low-Poly Chair / Chair-001](https://nopreciousmodels.com/models/low-poly-chair/)，No Precious Models，[CC0](https://creativecommons.org/publicdomain/zero/1.0/) | [作者 GLB](https://nopreciousmodels.com/models/chair-001.glb) 原封装，原包围盒 0.51 × 0.90 × 0.51 m。运行时椅背转向 +Z，按 DIN-201 子件的宽高深和旋转放置。968 三角形 | 28,536 B | 28,536 B | 672 顶点 × 32 B + 2,904 个 uint16 索引 = 27,312 B；10 个矩阵与实例色另计 760 B |

三个 WebP 的原始 JPG 可通过 [Poly Haven 文件 API](https://api.polyhaven.com/files/oak_veneer_01) 的 Diffuse、nor_gl、Rough → 1k → jpg 核对；MD5 依次为 `39a99df4e328d62d74f3122722a64a95`、`d05406f5fdaf51f0d7b115b35d9af1b7`、`a19b44176a078b9ae93314133848c9aa`。三层 RGBA8 含完整 mip 链共 16,777,212 B，约 16 MiB。只对漫反射解 sRGB。四项资产合计下载文件体 582,854 B，约 569.2 KiB，不含 HTTP 头。

材质使用现有 ars-solid，沿世界米制取样；曲面按平滑表面法线的三平面权重混合。GLB 原材质释放，归一化几何与程序化备用椅共享项目材质、尺寸和裁切面。M2.5b 的新增贴图与模型均使用上表的外部原件。

## 既有离线场址资产

下列地形来自本项目的[固定种子构建脚本](../../scripts/generate-terrain.mjs)，作者与来源均为本项目生成。每个采样点以 6 B 记录量化标高、坡度、曲率、汇流与坡向。脚本直接输出发布格式，原文件与发布文件体积相同。GPU 栏按实际裁洞后的表面网格求和，包括位置、颜色、法线和索引，不含单独生成的剖面与测线。

| 文件 | 边长 / 间距 | 原始及发布 B | 表面几何 GPU B |
| --- | --- | ---: | ---: |
| horizon.bin | 10,000 m / 40 m | 378,006 | 2,974,836 |
| mountain.bin | 2,400 m / 5 m | 1,388,166 | 13,770,660 |
| site.bin | 300 m / 1.25 m | 348,486 | 2,720,676 |
| core.bin | 80 m / 0.625 m | 99,846 | 797,268 |
| east-mouth.bin | 40 m / 0.625 m | 25,350 | 206,436 |
| west-mouth.bin | 40 m / 0.625 m | 25,350 | 206,388 |

[场址索引](../terrain/atlas.json)含各文件的 SHA-256、采样规格和道路轴线，原始及发布均为 10,270 B，索引本身不上传 GPU。[站点图标](../ridge.svg)为项目原绘的 40 × 40 矢量图标，原始及发布均为 270 B，浏览器栅格化尺寸由显示端决定，以 40 × 40 RGBA8 计约 6.25 KiB。
