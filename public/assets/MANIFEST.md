# ARS-01 室内资产

浏览器按对照版本从本站读取资产。r1 使用程序化材质与家具，r2 读取四套 PBR，r3 增加软装、洁具、餐椅及三幅现场挂图。四套材质共用一个 WebGL2 数组采样器与已有 ars-solid 程序。

## 四套实拍表面

每项源文件取自 Poly Haven 官方 [CC0 许可](https://polyhaven.com/license)。下表依次列出漫反射、OpenGL 法线、粗糙度三张 1K JPG。浏览器只请求 WebP。显存列按实际 RGBA8 完整 mip 链的通道占用计算。

| 材质、作者与物理平铺尺度 | 官方源文件字节 | 发布路径与字节 | GPU 通道字节 |
| --- | --- | --- | ---: |
| [Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01)，Jenelle van Heerden，1.8 m | 641,756 B | [pilot/oak-diff.webp](pilot/oak-diff.webp) · 93,564 B | 4,194,303 |
| oak | 484,844 B | [pilot/oak-nor_gl.webp](pilot/oak-nor_gl.webp) · 110,180 B | 2,796,202 |
| oak | 865,194 B | [pilot/oak-rough.webp](pilot/oak-rough.webp) · 350,574 B | 1,398,101 |
| [Rough Linen](https://polyhaven.com/a/rough_linen)，colormass 摄影、Rico Cilliers 处理，0.3 m | 835,801 B | [finishes/linen-color.webp](finishes/linen-color.webp) · 186,142 B | 4,194,303 |
| linen | 916,843 B | [finishes/linen-normal.webp](finishes/linen-normal.webp) · 311,604 B | 2,796,202 |
| linen | 1,083,725 B | [finishes/linen-rough.webp](finishes/linen-rough.webp) · 353,196 B | 1,398,101 |
| [White Plaster 02](https://polyhaven.com/a/white_plaster_02)，Rob Tuytel，1 m | 527,219 B | [finishes/plaster-color.webp](finishes/plaster-color.webp) · 195,378 B | 4,194,303 |
| plaster | 652,310 B | [finishes/plaster-normal.webp](finishes/plaster-normal.webp) · 218,246 B | 2,796,202 |
| plaster | 295,900 B | [finishes/plaster-rough.webp](finishes/plaster-rough.webp) · 34,340 B | 1,398,101 |
| [Floor Tiles 08](https://polyhaven.com/a/floor_tiles_08)，Rob Tuytel，1.5 m | 414,119 B | [finishes/tile-color.webp](finishes/tile-color.webp) · 79,196 B | 4,194,303 |
| tile | 259,727 B | [finishes/tile-normal.webp](finishes/tile-normal.webp) · 38,334 B | 2,796,202 |
| tile | 160,616 B | [finishes/tile-rough.webp](finishes/tile-rough.webp) · 13,360 B | 1,398,101 |

原始图及 MD5 可由官方文件索引的 Diffuse / nor_gl / Rough → 1k → jpg 复核。[橡木](https://api.polyhaven.com/files/oak_veneer_01) · [亚麻](https://api.polyhaven.com/files/rough_linen) · [哑光墙面](https://api.polyhaven.com/files/white_plaster_02) · [地砖](https://api.polyhaven.com/files/floor_tiles_08)

橡木沿用 M2.5b 的三张 1024² WebP，质量 83 / 95 / 88。新增三套以 80 / 89 / 75 转码。蓝色原亚麻的漫反射经灰度化，保留织纹明暗，染色使用家具的燕麦、陶土、鼠尾草与暖灰色。亚麻原图为 1024 × 1026，重采样至 1024²。其余原图皆为 1024²。墙漆和地砖在解 sRGB 后以周期高斯分解分离大尺度色斑（半径参数 σ=12 texel）。墙漆保留 28% 的低频变化，地砖保留 72%，细砂、砖缝的高频纹理保持原扫描，详见[离线转码脚本](../../scripts/prepare-finish-scans.py)。地砖 GL 法线的 XY 原图带全幅正偏，转码前先在斜率空间扣除均值并重新归一，以保留微观起伏与实际铺设平面。地砖使用未施釉材质扫描；此模型没有实物防滑等级测试数据。

层 0–3 存四套漫反射的 RGB 和各自的线性粗糙度 A。层 4、5 的 RG/BA 各装一套切线法线 XY，着色时恢复上半球 Z。只有漫反射 RGB 和画面 RGB 解码 sRGB。使用米制投影，曲面按平滑法线作三平面混合；橡木按板面长边转动取样与法线。载入时以 Worker 解码、打包并转移像素缓冲区，首屏预编译前显式上传数组。某一套读取失败时，该表面自动使用原程序化材质。

## 研究站挂画

三幅作品为本项目生成，并以 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 发布。[生成脚本](../../scripts/generate-field-prints.py) 从已有场地数据和原创绘图指令直接生成图像。每幅在打包时占用一层 1024² RGBA8，含 mip 5,592,404 B；挂画的实际长宽比由装裱尺寸还原。

| 作品、依据 | 文件、原图尺寸 | 安装尺寸 | 原始像素 RGB8 | 发布 WebP |
| --- | --- | --- | ---: | ---: |
| Across the ridge。场地 mountain.bin 的十条东西向断面，每点间距 5 m，各行独立平移基线 | [ridge-transects](art/ridge-transects.webp) · 1024 × 683 | 2.13 × 1.42 m | 2,098,176 B | 43,170 B |
| Larix。针叶簇生短枝与球果的原创形态习作 | [larch-study](art/larch-study.webp) · 683 × 1024 | 0.46 × 0.69 m | 2,098,176 B | 58,882 B |
| Fall line。场地 mountain.bin 的 20 m 等高线及按地形模拟的汇流支线 | [surface-drainage](art/surface-drainage.webp) · 683 × 1024 | 0.51 × 0.765 m | 2,098,176 B | 112,726 B |

## 餐椅与资产预算

[Low-Poly Chair / Chair-001](https://nopreciousmodels.com/models/low-poly-chair/) 由 No Precious Models 发布为 [CC0](https://creativecommons.org/publicdomain/zero/1.0/)。[作者原件](https://nopreciousmodels.com/models/chair-001.glb) 与[随站 GLB](pilot/dining-chair.glb) 均为 28,536 B。原包围盒为 0.51 × 0.90 × 0.51 m。运行时椅背转到 +Z，按 DIN-201 子件的宽、高、深和旋转安置。968 个三角形，672 个顶点与 2,904 个 uint16 索引占 27,312 B，十组实例变换和颜色另占 760 B。

r2 的 12 张表面 WebP 共 1,984,114 B，数组实际占用 33,554,424 B（32 MiB）。r3 的 17 个文件共 2,528,888 B（2.529 MB / 2.412 MiB），较 M2.5b 追加 1,946,034 B。九层完整数组占用 50,331,636 B（50.33 MB / 48 MiB），其中三个艺术图层合计约 16 MiB。四份室内反射 CubeUV 目标实际另占 2,752,512 B，两项合计 53,084,148 B。前述下载量不含应用 JS，完整实测见[进度记录](../../docs/PROGRESS.md)。

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

### M2.5c 软装与洁具曲面库

[domestic.glb](pilot/domestic.glb) 内有七个独立命名的索引网格。三维造型由本项目生成，作者为 Project Aegis Ridge，以 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 提供。原始参数曲面与导出过程见[本地生成器](../../scripts/generate-domestic-models.mjs)，在项目根目录执行 `node scripts/generate-domestic-models.mjs` 可逐字节复现。GLB 文件 301,460 B，gzip 6 为 213,783 B。全部顶点、法线与索引在 GPU 上合计 295,380 B，各实例复用网格。灯具的导线和扩散板、花盆、洗手台五金及硬家具继续沿用项目构件。

| 网格 | 源模型外廓，宽 × 高 × 深（m） | 三角形 | 顶点和索引（B） | 安装位置 |
| --- | --- | ---: | ---: | --- |
| `pillow` | 0.685 × 0.214 × 0.473 | 1,760 | 32,736 | 居住区全部 14 个床位，含备勤宿舍两组上下铺；每床一只带侧缝的枕芯 |
| `duvet` | 1.068 × 0.222 × 1.563 | 3,096 | 61,152 | 同一批 14 个床位，每床一件带折角、绗缝和垂边的双面被套 |
| `sofa-cushion` | 0.940 × 0.244 × 0.950 | 640 | 12,288 | 共餐客厅，12 块坐垫、靠垫和扶手总计 7,680 面 |
| `wc-bowl` | 0.582 × 0.946 × 0.796 | 3,036 | 56,136 | 公卫 WC-211，含水箱、池沿和内部釉面 |
| `basin` | 0.702 × 0.205 × 0.570 | 1,904 | 35,616 | 公卫 BAS-212，按已登记的安装包络缩放 |
| `pleated-shade` | 0.622 × 0.218 × 0.622 | 1,760 | 33,600 | 卧室阅读灯、共餐吊灯、沙发落地灯 |
| `houseplant` | 0.550 × 0.409 × 0.693 | 2,754 | 63,852 | 共餐客厅壁架，带弯曲叶柄和有中脊的双面叶 |

载入时按每个源网格的包围盒归一化，再套用项目安装尺寸、朝向和位号。源材质只用于交换文件，着色、反射、裁切与投影使用每个安装批次已有的项目材质。r1、r2 和缺件的 r3 使用程序化形体。
