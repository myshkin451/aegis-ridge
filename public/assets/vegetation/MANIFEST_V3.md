# V3 植被资产

默认使用 V3。打开 `?veg=v2` 可恢复 M4 的岩石、林木、地被和作物，`?veg=v3` 可显式指定新版。两个版本共用场址和摄影机位。V3 首屏从本站读取 6 个文件，共 **454,168 B**。

## 山石、林冠和地被

下列输入均来自 Poly Haven。其 CC0 许可允许对模型、照片和遮罩做减面、重排和再发布。草与灌丛的草卡由原始三维枝叶实际投影生成。树冠图集由与近景共用的枝片几何、针叶照片和树干离线渲染。[Poly Haven 资产许可](https://polyhaven.com/license)

| 发布文件 | 尺寸或几何 | 源文件 B | 发布 B | GPU B |
| --- | --- | ---: | ---: | ---: |
| [boulder-lods.glb](boulder-lods.glb) | 岩块 1,250 / 270 / 58 三角面；独立树冠节点 304 三角面 | 3,929,048 | 56,812 | 52,072 |
| [fir-bough.webp](fir-bough.webp) | 384 × 384 针叶枝片 | 2,166,398 | 72,382 | 786,424 |
| [fir-octa.webp](fir-octa.webp) | 960 × 960，5 × 5 个半球八面体方向，每格 192 × 192 | 复用上两项 | 239,916 | 4,915,136 |
| [alpine-grass.webp](alpine-grass.webp) | 256 × 192，含穗草丛 | 1,876,952 | 17,808 | 262,140 |
| [alpine-shrub.webp](alpine-shrub.webp) | 256 × 208，矮枝簇 | 1,278,487 | 25,590 | 283,964 |
| 室外小计 | 4 张 RGBA8 WebP 解码纹理与 1 份 GLB | 9,250,885 | 412,508 | 6,299,736 |

- **山石**。Rico Cilliers 的 Boulder 01 发布版 glTF 有 66,122 个三角面，母体沿 X/Y/Z 为 1.272 × 1.004 × 1.830 m。生成时合并 UV 接缝处的同位置顶点，对源模型按形状误差独立减面三次。1K 漫反射经线性化、降低饱和度后烘入顶点，保留原始表面法线。三个网格在同一参考包围盒内归一，实例按米缩放并嵌入坡面。各档位置、法线、颜色及索引合计为 30,072、6,552、1,464 B。[Boulder 01](https://polyhaven.com/a/boulder_01) · [官方原始文件与摘要](https://api.polyhaven.com/files/boulder_01)
- **针叶林**。Rob Tuytel 摄影、Rico Cilliers 建模的 Pine Tree 01 提供 2K 枝条颜色与裁切遮罩。取其中一个完整针叶嫩枝，以原始形状围绕枝轴展开，叶尖在图像上方。共享的近景树冠网格占 13,984 B。离线逐三角投影至 25 个方向，用深度缓冲和 alpha 裁切处理枝片前后遮挡。图集存基础色与自遮蔽，现场光照、风摆和积雪在着色时计算。每个八面体格的正交宽高为参考树高的 1.10 倍。[Pine Tree 01](https://polyhaven.com/a/pine_tree_01) · [官方原始文件与摘要](https://api.polyhaven.com/files/pine_tree_01)
- **草甸与矮灌丛**。草丛取自 Rob Tuytel 摄影、Rico Cilliers 建模的 Grass Medium 01 的 mid_b 原型。矮灌丛由 Rico Cilliers 的 Shrub 02 的 a、b、d 三组枝条错位组合。两者均按 glTF 的原始 UV 取色和裁切，离线以双倍采样渲染，再缩为最终卡片。[Grass Medium 01](https://polyhaven.com/a/grass_medium_01) · [Shrub 02](https://polyhaven.com/a/shrub_02) · [草丛文件索引](https://api.polyhaven.com/files/grass_medium_01) · [灌丛文件索引](https://api.polyhaven.com/files/shrub_02)

显存按实际 RGBA8 纹理的完整 mip 链逐级求和。几何按 GPU 属性数组及索引字节数计，WebP 和 glTF 的编码开销只计入发布体积。发布地形还分配 1,759,096 B 室外实例矩阵与实例颜色，可容纳 1,799 棵树、1,360 个岩块、13,117 簇草和 552 簇矮灌丛。两档针叶林、三档岩石和两类地被共 8 批，树的近档分别绘制树干和枝片。此处列举的是资产和实例缓冲区，浏览器、阴影图与公共渲染目标的内存另计。

M4 与 V3 在本版地形上的 1,799 个树根位置逐一相符。5 株靠近会车湾和路缘，V3 收窄了它们的冠幅。按播种顺序将根点 X、Z 写到小数点后六位、逐行连接，SHA-256 为 `62d5f38c70b8c613d050e83a8c42207edbfc6efcd3258050ac76961b062b3594`。

复现时从上列文件索引下载脚本列明的 13 个原文件到同一目录，运行 `python3 scripts/prepare-vegetation.py <源文件目录>`。脚本核对官方 MD5，在构建机上减面、深度栅格化并输出发布资产。应用运行与日常构建均可离线使用成品。[准备脚本](../../../scripts/prepare-vegetation.py) · [减面与树冠导出](../../../scripts/bake-vegetation-geometry.mjs)

## B3 与 L2 作物

| 发布文件 | 图集内容 | 源文件 B | 发布 B | GPU B |
| --- | --- | ---: | ---: | ---: |
| [crop-leaves.webp](crop-leaves.webp) | 768 × 256，齿缘叶、阔叶、羽状复叶 | 39,561,521 | 41,660 | 1,048,576 |

原片来自 ambientCG 的两套绿叶表面扫描。制作时提取颜色与不透明度通道，将一张阔叶重排为复叶的各片小叶。生菜类莲座和块茎作物的分枝依据株型建模，贴图记录的是叶脉和叶缘。每层的种植实例按苗期、成熟和采收分组。[Leaf Set 018](https://ambientcg.com/a/LeafSet018) · [Leaf Set 020](https://ambientcg.com/a/LeafSet020) · [ambientCG CC0 许可](https://docs.ambientcg.com/license/)

按实际 WebGL 属性和索引计算，L2 的 214 张叶片卡占 19,864 B，B3 的 5,577 张叶片卡占 427,452 B，两层共用同一张图集。全分支 5 张纹理含完整 RGBA8 mip 链共 7,296,240 B。管线还复用已有的钢框、灯具和茎材质。

下载两套 2K-PNG 源包后，可用 `python3 scripts/prepare-crop-atlas.py LeafSet018_2K-PNG.zip LeafSet020_2K-PNG.zip public/assets/vegetation/crop-leaves.webp` 复现图集。源包 SHA-256 依次为 `506b8b7360b54bc731f7c4a677e25b3a0092711f7d6bfec8216fec753179472e`、`f7fc4c0b860d75c3f0c3b94887e28fac6c8ebaa3ea6fbe031ebaa6a0c1050337`。[作物图集脚本](../../../scripts/prepare-crop-atlas.py)

## 分支复核

`npm run shots -- v3` 生成五组 1440 × 900 对照，核对各组的世界矩阵、投影矩阵、曝光和 DPR。`npm run shots -- v3 --steady` 在 2560 × 1440 下开启正常动效，逐机位采样六秒。完整视图切换沿用 `npm run perf`。[对照图与实测记录](../../../docs/shots/v3/ab/)
