# V2 山体地表实拍材质

五套扫描对应岩壁、碎石、短草、雪与裸土。物理平铺边长按作者给出的原始尺寸换算为米。每行包含一套的三张 1024 × 1024 WebP，数字为发布字节。原作与随站转码件采用 CC0 1.0。[Poly Haven 资产许可](https://polyhaven.com/license)

| GPU 槽 | 站内用途、原作与作者 | 平铺边长 | 官方 1K JPG 合计 | 漫反射 B | 相对高度 B | 法线 XY 与粗糙度 B |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | 风化花岗岩壁。[Tiger Rock](https://polyhaven.com/a/tiger_rock)，Dario Barresi | 2.55 m | 2,992,304 B | [272,544](cliff-color.webp) | [30,018](cliff-height.webp) | [344,154](cliff-surface.webp) |
| 1 | 碎石坡表层。[Gravel Stones](https://polyhaven.com/a/gravel_stones)，Amal Kumar | 2.00 m | 3,565,070 B | [143,928](talus-color.webp) | [126,214](talus-height.webp) | [525,780](talus-surface.webp) |
| 2 | 高山草甸上的短草与裸露草根。[Sparse Grass](https://polyhaven.com/a/sparse_grass)，Amal Kumar | 2.00 m | 3,553,975 B | [158,430](meadow-color.webp) | [151,868](meadow-height.webp) | [517,060](meadow-surface.webp) |
| 3 | 风积雪。[Snow 02](https://polyhaven.com/a/snow_02)，Rob Tuytel | 2.00 m | 1,697,332 B | [47,124](snow-color.webp) | [21,166](snow-height.webp) | [351,182](snow-surface.webp) |
| 4 | 露土与沟床细石。[Brown Mud Dry](https://polyhaven.com/a/brown_mud_dry)，Rob Tuytel | 1.30 m | 3,094,182 B | [366,528](soil-color.webp) | [58,072](soil-height.webp) | [544,120](soil-surface.webp) |

Tiger Rock 的官方材质页将岩面标为 granite。Sparse Grass 的原始分类为自然稀疏草地，本项目借它表现高山草甸的草根与表土细节，原作未标明采样海拔。[岩面分类](https://polyhaven.com/a/tiger_rock) · [草地现场参照](https://polyhaven.com/a/sparse_grass)

## 源图与复现

从下列官方文件索引各取 `Diffuse`、`Displacement`、`nor_gl`、`Rough` 的 `1k → jpg`，按原文件名放入同一个临时目录。每幅原图皆为 1024²。转码脚本先逐幅与发布者 MD5 比对，再以 Pillow / libwebp 编码。色图保留 sRGB，高度沿用源图的线性灰度。OpenGL 切线法线的 X、Y 与线性粗糙度分别放入表面图 R、G、B 通道。[岩壁索引](https://api.polyhaven.com/files/tiger_rock) · [碎石索引](https://api.polyhaven.com/files/gravel_stones) · [草地索引](https://api.polyhaven.com/files/sparse_grass) · [积雪索引](https://api.polyhaven.com/files/snow_02) · [裸土索引](https://api.polyhaven.com/files/brown_mud_dry)

在项目根目录执行以下命令，参数为本地存放原图的目录。色图、高度、表面图的 WebP quality 分别为 77、80、86，method 为 6。本次编码使用 Pillow 13.0.0 / libwebp 1.6.0。[转码脚本](../../../scripts/prepare-terrain-scans.py)

```sh
python3 scripts/prepare-terrain-scans.py /path/to/polyhaven-jpg
```

## 上传与采样

15 个发布文件合计 **3,658,188 B**。窗口发起请求后，Worker 解码、翻转行序并组装一个 RGBA8 DataArrayTexture。层 0–4 的 RGB 保存原扫描漫反射，A 保存对应的相对高度。层 5–9 的 RG 保存 OpenGL 法线 XY，B 保存粗糙度，A 为 255。GPU 仅对漫反射 RGB 做 sRGB 到线性光的转换。含完整 mip 链共 **55,924,040 B**。着色器按米制投影读取数组，相对高度参与不同表面的边界混合。[Worker](../../../src/scene/assets/terrainScans.worker.ts) · [数组加载器](../../../src/scene/assets/terrainScans.ts)

## 测区烘焙数据

从仓库根目录执行 `npm run terrain` 可重建两版图集。V2 的 10 km 测区为程序化地形，保留 M4 主山边界及其内侧的场址模型坐标。远景形体在 10 m 网格上侵蚀，按 20 m 采样生成渲染网格。站房、盘山路、两处硐口和外围设施继续使用各自原有的精度。[生成脚本](../../../scripts/generate-terrain.mjs) · [图集与校验值](../../terrain/atlas.json)

| 发布文件 | 采样与通道 | 字节 |
| --- | --- | ---: |
| horizon-v2.bin | 501 × 501，标高与四个表面驱动量 | 1,506,006 |
| macro-normal.rg | 1001 × 1001，世界法线 X、Z | 2,004,002 |
| horizon-angles.r8 | 201 × 201，主山与外山各 16 方位 | 1,292,832 |

遮挡角从东向南每 22.5° 取样，在主山的 12 m 方格与远景的 50 m 方格上追踪至 10 km 测区边缘。每格按方位保存视线遇到的最大地平仰角，精度约 0.35°。渲染时随太阳方位插值，与近景级联阴影共同控制太阳直射。测区之外的后山只作大气远景。06:15 的既有太阳高度约 +3.15°，19:30 约 −18.75°，蓝调剖面的光来自天光和站内灯具。[地平角计算](../../../scripts/terrain-relief.mjs) · [独立射线与边界回归](../../../tests/terrainRelief.test.ts)
