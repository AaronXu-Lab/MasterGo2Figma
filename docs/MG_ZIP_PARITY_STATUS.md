# MG / ZIP 导入一致性状态

最后更新：2026-08-26（临时测试集：字体样式表正则、矩形逐角圆角、paint blendMode、导出设置注册表、
嵌套实例 override 坐标系；importer 侧修掉「外层 boolean 填充丢失」与「默认灰蒙版孪生」）

## 2026-08-26 测试集「临时测试」（当前主回归集）

```bash
node tools/compare_mg_import.js "测试集/临时测试/临时测试.mg" \
  "测试集/临时测试/mastergo2figma-partial-pages-2026-08-26T08-20-53-958Z.zip"
```

| 指标 | 修复前 | 修复后 |
|---|---|---|
| deep-prop | 1304 | **60**（全部为已接受残差） |
| font | 166 | **4**（Source Han Sans CN vs Source Han Sans 命名） |
| geometry / transform / index | 15 / 6 / 2 | **0 / 0 / 0** |

剩余 60 行 deep：缺失字体文本的 fontWeight 0（API quirk，我们的值更真）、导出器专属 SVG
通道（svgMarkup/svgFallback ×1 矩形）、单行文本 '2' 的 paragraphSpacing。
Extra 124 = 外部库 master（预期，importer 收尾删除）。
0806 主回归集同步受益：deep 1396 → 1323、0 新增行。

Importer 侧两处修复对 **zip 和 mg 两条路径同样生效**：
1. `promoteSingleBooleanChild` 现在把外层 boolean 记录的填充搬给被提升的子 boolean
   （状态栏 信号/WiFi 图标此前整组透明——子树完整，只是 boolean fills=[]）。
2. `paintFilledMaskTwins` 跳过默认占位灰 #D8D8D8 的蒙版（标签行此前多一条灰底）。

第二轮回归修复：`libraryMaster` 只对**页面根**生效（画布内的库同步组件 组 16567 /
组 16709 曾被误删——比较器对 importer 的删除全盲，这类改动必须重导入验证画布）。

规格见 `MG_DECODER.md`「临时测试 fixture pass (2026-08-26)」，过程见
`MG_DECODER_JOURNAL.md` 同日期章节。


## 2026-08-06 可同步测试集「插件测试 汇总」（当前主回归集）

用户更新了测试集与同批基准 zip。新文件带来一个此前没有的场景：**整个 `首页普通版` 画板从
750 宽缩到 404**（404/750 = 0.538667），把 tag 26 的旧解读打穿。

| 集 | MG 文件 | 记录数 | 导出形态 | 状态 |
|---|---|---|---|---|
| `可同步测试集` | `插件测试 汇总.mg` | 1369（= 基准 1127 + 242 条外部库 master） | 编辑器全量导出 + 内嵌外部库组件集 | **missing 255 → 0**、index/child-order → 0、effect **40 → 0**；deep-prop 6067 → 1440（记录集补齐后 255 条新记录带进约 900 行既有可接受族） |

**记录集已完全对齐**：`Actual 1369 − Extra 242（外部库 master，预期）= 1127 = Expected`。
`Missing` 归零意味着不再有整棵子树丢失——这是本轮最重要的一项，见下面第 6 条。

```bash
node tools/compare_mg_import.js "可同步测试集/插件测试 汇总.mg" \
  "可同步测试集/mastergo2figma-partial-pages-2026-08-06T10-27-59-527Z.zip"
```

本轮五处修复（规格见 `MG_DECODER.md`，破解过程见 `MG_DECODER_JOURNAL.md` 2026-08-06 三节）：

1. **trailer tag 26 是"环境缩放"不是"实例缩放"**（6067 → 930）。它出现在普通节点上，只说明
   "这条记录所在坐标系被缩过 S 倍"；节点自己写的标量已是终值，乘它等于自伤。`mgNativeProps`
   等 10 处的 `effScale || trailer.scaleFactor || 1` 兜底删掉，只认 `effScale`。此前整棵树的
   vectorNetwork、默认 strokeWeight、模糊半径都被额外乘了 0.539。
2. **合成实例子节点的 trailer 是模板的**（930 → 639）。整份键拷贝把模板的 tag 26（组件内部
   环境，`核心功能 2` 存 1.111）也带了过来。只有真实 override 记录的 tag 26 描述副本自己。
3. **`mgFillContainerMeta` 现在给借来的字段盖戳**（639 → 576）。`mgInheritFromTemplate` 是就地
   填充的，到 `mgNativeProps` 时"自己的 corners"和"抄来的 corners"已不可分辨，而两者缩放规则相反。
4. **旋转读矩阵第一列**：`atan2(-m10, m00)`（transform 69 → 33）。第一行读法只对纯旋转成立，
   MasterGo 会存纯错切。
5. **两处"未知 tag 吞掉整条记录"**：特效的 `11 01`（40 个模糊消失，effect 40 → 0）、
   paint 的 `0d` 其实是图像调整子对象（三张调过色的照片完全没有填充）。

6. **38 条幽灵记录占住了 255 个真实节点的坑位**（missing 255 → 0）。节点扫描器的
   `\x03([^\x00]+)\x00` 把另一张 **id 关联表**（其 `03` 是单字节枚举，后面没有 `00`）的
   `…:6:1` 尾串当成了排序码，凭空造出 38 条无 type 的记录，而每条的 id 恰好是某个实例子节点
   的克隆 id；展开时复用了幽灵，发射时 `subtreeOf` 的 `!type` 闸门把它和整棵子树一起丢弃。
   排序码收紧为 `[\x20-\x7e]+`（可打印 ASCII，`a!`/`a ` 仍通过）。**画布表现**：
   `容器 359`（找桩充电地图）、`容器 537145`、`特色服务`、`容器 537143` 四整块此前是空的，
   框架 hug 到了残缺内容的高度（223.92 → 60.17 等）。

### 第三轮：视觉对照（MasterGo PNG vs Figma 渲染）

用户把 `首页普通版` 直接从 MasterGo 导成 PNG 放进 `0806 图片` Page（节点 `77:1581`），
和导入结果（`77:789`）逐像素对。**zip 是「API 说的值」，PNG 是「屏幕上画出来的样子」**——
后者能抓到比较器结构性看不见的一整类问题（两个包完全一致、但导进 Figma 就是不对）。

比较器：Geometry 198 → **182**、Transform 109 → **108**、Paint 8 → **7**、
deep-prop 1440 → **1396**；missing / type / parent / index / child-order / effect / text 保持 0。

| # | 现象 | 根因 | 层 |
|---|---|---|---|
| 1 | 快/慢 芯片渲染成正圆、里面的字大一倍被裁 | `record.instanceScale` 取 `n.trailer.scaleFactor`，而**嵌套实例是合成的、没有自己的 trailer** → 7 个嵌套实例从未 `rescale()`，锁定的组件子节点保持 22px 字号 / 7px 圆角 | 解码器 |
| 2 | 地图定位大头针是黑的（应为蓝） | 实例 override 的 key 是**扁平**的 `<实例>/<节点>`；逐层拼 `tplPath` 在中间层没有 override 时断链，`24:1747/24:0946` 的蓝色重着色失联 | 解码器 |
| 3 | 消息通知文字冲出卡片、`10` 角标被顶出行外 | `1c 08` 的 `03 03` = **TRUNCATE**（此前当成 WIDTH_AND_HEIGHT）；且 Figma 已废弃并**拒绝** `TRUNCATE`，赋值抛异常被吞 → **zip 路径同样中招** | 解码器 + importer |
| 4 | 附近充电按钮的纸飞机图标消失 | raw 记录的显式尺寸被自己的 tag 26 又乘一遍（24 → 1.55），保险丝 `n.w == tpl.w * s` 因 `templateRef` 尚未填充而从未生效；命中的 32 条**全部**错 | 解码器 |
| 5 | 地图纹理跑到标签栏底下 | 原生 Group 的 finalize 只保留 `layoutAlign/Grow/Positioning`，坐标交给 `figma.group()` 算；延迟布局先给父级写 `layoutMode`（group 被吸进流式槽位）、后翻 ABSOLUTE，此时已无坐标可还原 → **zip 路径同样中招** | importer |

**剩余 1396 条 deep 残差的分布**（均为已归类的可接受差异或已知缺口；补齐 255 条记录后
既有族按比例放大。第三轮又消掉约 44 行几何/paint）：

- **585 条几何**（x/y/width/height/relativeTransform）：多数是实例子级——Figma 端是真
  InstanceNode，几何由 Figma 的 auto-layout 自己解，比较器可见、画布不可见；其余是文字盒的
  亚像素差（基准的盒子来自实时字体排版，取整成 8/17/27，我们按模板 × 缩放算）。
- **479 条字体**：大部分是基准侧 artifact——实例内未被覆盖的文字，MasterGo API 返回 Figma
  默认样式（12 / Source Han Sans / Regular / PERCENT / AUTO），我们给的是真实模板值；
  少量是显示名拼写（`AlibabaPuHuiTi` vs `Alibaba PuHuiTi`、`Bold` vs `粗体`）——
  **显示名不在 `.mg` 里**，只存 PostScript 名，无法推导。导入端 `fontLoader` 的归一化匹配
  已经把空格/连字符抹平，所以 family 一侧不影响加载。
- **248 条 = 62 个节点 × 4 个 SVG-fallback 字段**（`svgMarkup` / `svgFallback` /
  `receiveCreateOverride` / `vectorFallback`）。zip 导出器判定这些矢量的 region 无法回放，
  改发 SVG；`.mg` 侧没有这个信息，我们发真 vectorNetwork。**唯一可能真的更差的一块**——
  若某个矢量确实靠 region fallback 才对，我们会渲染错，需要在 Figma 里逐个核对。
- **53 条 VECTOR 节点级 cornerRadius**（顶点半径逐条正确，渲染不受影响）。
- **34 条 `layoutAlign = STRETCH`**：来源字节未定位，见
  `MG_DECODER_UNKNOWN_FIELDS.md`（trailer / 显式尺寸 / layoutGrow / 父 layoutMode 四维交叉表
  均无分离度）。
- 13 条 paint `blendMode` PASS_THROUGH vs NORMAL（Figma 对 paint 两者同义）、28 条零散。

## 2026-08-05 可同步测试集（上一代基准对）

| 集 | MG 文件 | 记录数 | 导出形态 | 状态 |
|---|---|---|---|---|
| `可同步测试集` | `插件测试 汇总.mg` | 681（2 页：覆盖集 344 + 真实页 0806） | 编辑器全量导出 + 内嵌外部库组件集 | deep-prop **430 → 76**（0806 页 415 → 62，覆盖页 15 → 14 既有）；type/parent/index/child-order/effect/text/vectorNetwork 全 0；paint 60 → 1；font 14 → 1 |

```bash
node tools/compare_mg_import.js "可同步测试集/插件测试 汇总.mg" \
  "可同步测试集/mastergo2figma-partial-pages-2026-08-06T02-34-51-120Z.zip"
```

本轮修的字段族（规格见 `MG_DECODER.md`「Library-master copies & instance-child inheritance」）：
paint 的 `08` alpha 被默认 1 的 `09` 覆盖（51 个半透明填充/描边被压成不透明）、tag 17
"无 effects ⇒ 圆角 10" 的历史 hack（29 个直角节点被凭空加圆角）、blendMode `0xff`=NORMAL、
sort code 非字母数字导致注册表记录整条丢失、字体族取 PostScript 名而非显示名、外部库 master
识别（容器 `07 03`）、slash-id 即模板链、容器 meta 逐字段继承、trailer `20`=layoutGrow。

**第二轮（按用户在 Figma 上看到的实际差异）**：VECTOR 的 geometry hash 可以躲在 `04 <float>`
后面（`1c 01 04 <f> 07 <hash>`）——不跳过就整条 vectorNetwork 丢失，画布上是一个**看不见的图层**
（tab bar 的 `logo`，也就是首页那一格空白）；font run 的空字体串拼写 `06 00` 未消费，导致多 run
解析整体回退到 legacy 单串路径——状态栏 `9:4` + `1` 两个 run 只剩 `1`（时间显示成 "1"）；
实例子级的 auto-layout gap/padding 是**覆盖值**不是组件值（tab bar 存 20/24 vs 组件 38/40），
`applyInstanceChildOverrides` 现在逐项回放。

**第三轮（组 370 的 auto-layout）**：标量 `19` override mask 在带库导出里是**九字节 LEB128**，
`mgReadVarint` 的 35 位守卫返回 NaN → 标量 walk 在那里断掉 → 后面的 `1a` templateRef、
`1b` owner 全部静默丢失（大文件夹具因此少了 6 条记录的页可达性）；实例壳对组件 meta 是
**逐字段合并**不是整体采用（整体采用会把实例自己的显式零 padding 吃掉，变回默认 10），
且要记住哪边来的——自己的值是终值，借来的才乘实例缩放（否则缩放实例的 padding 会被乘两次）；
存根的 trailer 若 `21`/`22` 都不提，就是"没覆盖 sizing"，用组件的标记（tab bar 那一行
因此从 hug 变回 FIXED 750）。

**填充型蒙版（导入端语义差，非解码差）**：MasterGo 会**画出**蒙版图层自身的填充，Figma 的
蒙版只提供 alpha —— tab bar 那个渐变圆 `圆形 865` 在 mg 和 zip 两个包里都是 `isMask: true`，
所以两边导入都看不到它。`paintFilledMaskTwins` 在会话收尾时给每个"有可见填充的蒙版"在**它下方**
插一个非蒙版副本：蒙版继续裁剪上方兄弟，副本负责上色。跑在所有实例创建并按位匹配完覆盖之后，
所以给 COMPONENT 加的副本会自动传播进实例。本集统计：每次导入 2 个填充型蒙版。

**剩余 76 条 deep 残差的分布**：14 条属旧覆盖页的既有族（与本轮无关，改动前后逐条相同）；
约 36 条是 `24:696/*` 实例子级的 x/width —— MasterGo 侧 auto-layout 重排后的物化值，
Figma 端该实例是**真 InstanceNode**（`mainComponentId` 重链），子级几何由 Figma 自己解，
比较器可见但画布不可见（gap/padding 覆盖回放后结果一致）；12 条是 zip 导出器独有的 SVG
fallback 字段（`svgMarkup` / `vectorFallback`，`.mg` 侧无来源）；9 条是 `↳ Time` 的
SFProText 字体名拼写（zip 报 `SFProText-Semibold`/Regular，我们报 `SFProText`/Semibold ——
按 zip 拼会把 `Roboto-Regular` 也整成 family，且两种拼法在 Figma 里都是缺失字体，视觉无差）；
4 条 VECTOR/POLYGON 节点级 cornerRadius（顶点半径已正确，渲染不受影响）；
2 条亚像素 y。

**外部库 master**：`标签栏` COMPONENT_SET（235 条记录）在 `Extra records` 里是**预期的** ——
它必须被还原，实例才能 `createInstance()` 重链；导入端在 `completeImportSession` 收尾时
调用 `removeLibraryMasterNodes()` 删除，Figma 画布上看不到它（Figma 会保留已删除主组件的实例）。

## 2026-08-05 大文件设计系统（新增基准）

| 集 | MG 文件 | 记录数 | 导出形态 | 状态 |
|---|---|---|---|---|
| `测试集/大文件` | `测试集 0804.mg` | 205,005 层/69 页 | **库文档自身的编辑器全量导出**（34.6MB，200,903 条原生记录，冒号 token 页面表，含 12 个外来离画布 master） | 69 页逐页「发射 ≥ 可达」零缺口；按钮页 1818/1818（button/button-group COMPONENT_SET 完整） |

该集没有 zip 基准（只提供了 .mg），验证方式为解码侧自证：逐页对比
「页可达节点数」（parent 链上溯到页 id 的 typed 记录数）与实际发射数，再抽查关键组件树。
share 判定规则见 `docs/MG_DECODER.md`「Share-mode discriminator」（sort-code 信号）与
JOURNAL 2026-08-05（下）条。**特斯拉夹具已由用户删除退役**，回归矩阵改为本表三组。

## 2026-08-05 带外部库测试集（基准对）

| 集 | MG 文件 | 记录数 | 导出形态 | 状态 |
|---|---|---|---|---|
| `测试集/带外部库测试` | `测试集 0804_1_32.mg` | 997/997 | **编辑器导出 + 内嵌外部库**（28MB，195k 条原生记录，冒号 token 方言） | 对照组逐字段 **0 diff**（0.015 容差） |

基准不是 SendToFigma zip，而是 `测试集 0804_1_32 手动复制对照组.mg`（同内容手动复制进
干净文件，MasterGo 物化显示名/值）——两文件 id 空间不同，用位置配对树比较
（根按 x,y 排序、子级按 type|name|round(x,y) 键配对，根级差全局画布偏移）。可接受残差：
9 条源文件本身的 0.5px 坐标差（复制取整）、18 条 orig 比对照组多解析出的中英混排
styledTextSegments（更优）、1 条被 segments 覆盖的节点级 fontName。修复明细见
`docs/MG_DECODER.md`「Library-bearing editor export form」与 JOURNAL 2026-08-05 条。
回归：0712 转换字节一致；特斯拉仅 2 条 "20º" live-font 残差闭合（Inter/22 猜测值 →
Montserrat Light/50 真值）；`node --test` 23 过 2 挂与 HEAD 相同（存量失败）。

## 当前基准（四个测试集）

| 集 | MG 文件 | 记录数 | 导出形态 | 状态 |
|---|---|---|---|---|
| `测试集/0` | `插件测试.mg` | 191/191 | share（194 component-root 标记） | **全类别 0** |
| `测试集/1` | `测试集 0710-1.mg` | —/— | share（62 标记） | 45 geometry / 32 transform / 157 deep（既有运行时派生族） |
| `测试集/2` | `测试集 0710-2.mg` | 1357/1357 | **完整导出**（0 标记，无 share 模式） | 7 geometry / **9 deep**（同一运行时派生族，见下） |
| `测试集/0711-1` | `测试集 0711-1.mg` | 23/23 | share | 除 `0:50 Subtract` 宽高（1 geometry / 2 deep，布尔结果盒族）外全 0 |

比较命令（每集）：

```bash
node tools/compare_mg_import.js 测试集/<i>/<file>.mg 测试集/<i>/<baseline>.zip --json
```

任何解码改动必须四集全跑：目标集改善、其余集 diff **逐条 byte-identical**（不只是计数相同）。
本轮实测方法：worktree 取 HEAD 双跑 `--json`，按 JSON 行做集合差 —— added 必须为 0，
removed 必须全部属于本轮目标字段。

## 本轮（2026-07-11 letterSpacing + 渐变视觉真值 pass）修复

1. **letterSpacing 破解**（样式条目 `08`/`0b`，另 `06` = 行高单位旗标）：
   `08 <f>` = 字距值（负值=压缩字距）、`0b 01` = 单位 PIXELS（缺省=PERCENT）。
   测试集/1 与 /2 各消掉 142 条 unit-only 残差（上一轮"字节级无区分位"的结论被
   `0b` 推翻）；0711-1 的 4px 字距样本逐值命中。
2. **渐变 ratio 视觉真值翻案**：ZIP 基准对该字段**不是 ground truth** ——
   MasterGo 插件 API 的 transform 用折叠值 `min(r, 2|major|/r)` 构建，与自家渲染器在
   `r² > 2|major|` 时不一致且不可逆（Tesla 车身截图实锤，见 `MG_DECODER.md`）。
   - 裸 `03`：scalar 直存 ratio（不再 min()）。
   - 扩展 `06` 子对象：`{scalar, field06/scalar}` 分支对取**较大者**（同一设计两次
     导出存相反分支：0710-2 存 0.4117 除法得真值、0711-1 直存 3.5696）。
   - 比较器新增 `foldGradientTransform` 归一化：已知导出端折叠不再误报 decoder 回归。
   - SendToFigma：优先信运行时可能提供的真实第 3 个 handle（typings 只声明 2 个）。
   - **zip 侧径向渐变已修（当日晚，SVG 自证）**：导出端对含径向渐变的节点做
     `exportAsync(SVG)`，从渲染器输出的 `<radialGradient gradientTransform>` 反推真
     ratio（`enrichRadialGradientTruth` + `serializers/svgGradientTruth.ts`），绕开 API
     折叠；**需重新导出 zip 生效**。ratio 对 viewBox 平移/统一缩放不变；按 stops 匹配
     paint；门槛子树 ≤40 节点、SVG ≤2MB，失败静默回退。角向/菱形无 SVG 等价物，
     仍为折叠近似。测试 `svgGradientTruth.test.js` 4 项（合成 Tesla 用例 + 跨插件
     transform 一致性断言）。**第一次重导出实测翻车**：MasterGo 的 SVG 导出器把
     半径写反槽位（沿轴/垂直互换），产出第三个错误值 0.2006；已改为双候选读取 +
     「沿轴半径==|p1−p0|」不变量仲裁（两节点实测命中真值），需**再次重导出** zip。
3. **SECTION 恒 FIXED/FIXED**（trailer 21/22 对 SECTION 无意义）。

## 2026-07-11 大文件修复（特斯拉 Model 3 车载系统）

- 无斜杠 Boolean 槽位覆盖记录（VECTOR 仍带子）改判 BOOLEAN_OPERATION 走布尔树，
  修复 5779/5643 还原计数崩溃；四回归集零触发。
- `mgFindTemplateRoot` 名字门槛前置，转换从二次方降为线性（大文件分钟级→秒级）。

## 剩余项（有意不修，运行时派生族）

- 测试集/2 的 9 deep + 7 geometry 与 0711-1 的 Subtract 宽高同族：2 Group / 2 Subtract
  （布尔结果盒需路径求值，.mg 存 MasterGo 自身包围盒）、3 connector waypoints ±1px、
  文本派生尺寸。Figma 导入时 figma.subtract / 实时字体会自行重算。
- 测试集/1 的 45/32/157：文档已记录的 live-font / Boolean 运行时派生族。

## 历史

- 2026-07-10 测试集 2 全量导出 pass：几何 blob 零压缩浮点、MD5("") 空 blob、
  扩展渐变 `06` 解析（除法规则本轮已被 max() 取代）、absent-`0a` padding 缺省。
- 2026-07-10 文本/渐变 pass（插件测试.mg 全类别归零）：样式表 `0c/12`、decoration、
  lineHeight `-1=AUTO`、font-run 列表、渐变裸 `03` ratio min() 规则（本轮已改直存）、
  零宽细线、按钮实例居中平移。
- 更早（1388 记录旧 fixture,文件已删）：顺序标量解析、`_mg` 页名后缀、Boolean 叶裁剪、
  实例可见性/浅 transform、radial axis-scale、GROUP 重算、quarter-stroke Boolean、
  v2 包校验和回滚。

## 验证

- `node --test tools/tests/*.test.js`：25 项通过。
- `ReceiveFromMasterGo` / `SendToFigma` `npm run build`：均通过（`ui.html` 由构建生成）。
- 四集 comparator：集 0 全零；集 1/2 严格差集 added=0、removed 全为 letterSpacing；
  0711-1 仅剩 Subtract 族。

## 比较器盲区（务必知道）

`tools/compare_mg_import.js` 调 `convertMgPackageToV2Entries(entries, name)` **不传 options**，
而插件 UI 传 `{ slimInstanceDescendants: true }`。所以比较器测的是**不瘦身**的包，
`mgSlimInstanceDescendantProps` 的白名单回归它一条都看不见 —— 2026-08-05 就是这样让实例子级的
auto-layout 覆盖静默失效了三轮。白名单必须覆盖 `applyInstanceChildOverrides` 读的每个字段
（visible / opacity / characters / fills / strokes / itemSpacing / padding*），
由 `tools/tests/mgPackage.test.js` 的单测把关。

### 2026-08-26 第四轮补充：蒙版补漆改为按 trailer `1e` 位门控

- `.mg` trailer `1e 01` = 蒙版自身渲染填充；无此位的蒙版是"仅形状"，importer 不再补漆孪生。
- 临时测试橙色 banner 卡（矩形 148535）修复后与 MasterGo 参考图逐点最大通道差 1/255。
- 比较器数字全部不变（record 级字段不可见）：临时测试 0/124/0/0/0/4/60，0806 同前。
- zip 导入无此字段、维持全量补漆：临时测试橙卡在 zip 页仍过饱和（导出链无法拿到该位，mg 反超 zip）。

### 2026-09-06 · 测试 0906 外部组件

输入：`可同步测试集/测试0906/测试 0906.mg` 与同目录 09-25-56 导出 zip。

| 检查 | 修复前 | 修复后 |
|---|---:|---:|
| Missing | 0 | 0 |
| Extra（临时母版树记录） | 0 | 2148 |
| Geometry | 61 | 59 |
| Transform | 52 | 50 |
| Font | 9 | 9 |
| Deep props | 311 | 302 |

Type / Parent / Index / Child order / Effect / Text / Vector / Paint 均为 0。
增加的 2148 条属于 62 棵被引用的外部母版树，导入后清理，原画布仍为 1413 层。
恢复 mainComponentId 使 nav row 成为 INSTANCE，并由母版恢复方向盘 Boolean；
这两项不能用 deep props 数字衡量。保留的 302 条包含既有几何/transform、字体及
其他 props 差异，本轮未宣称全样本像素一致。

其他可用样本「插件测试 汇总.mg」对 detached HEAD 生成包 A/B：Missing 0、
Extra 461（母版依赖）、所有 mismatch 类别 0。历史双 fixture 的原始 zip 当前不在
本地，未将此次 A/B 冒充历史基准复测。两端 build 通过；测试 28/30 通过，
2 项既有失败已在 HEAD 复现（shallow visibility mask、container meta absent padding）。

真实 Figma 导入验证（最终生成的 ui.html）：6 个 nav row 均为 INSTANCE，预期的
右转/左转/四路转向/目的地图标可见；方向盘 Union 为 36.9873 × 36.9873，
剩余临时组件数 0。修复页「临时测试用_mg_修复0906」保留用于检查。

### 2026-09-06 · 杂记 副本

本地无对应 zip 基准，以本轮前后解码 A/B、MasterGo UI 和实际 Figma 重导入验证。

| 项目 | 修复前 → 后 |
|---|---|
| 页数 / 记录数 | 6 / 1161 → 6 / 1161 |
| 恢复的空 fills | 769（680文字、86容器、3矩形） |
| 原来非空的 fills / strokes 发生改变 | 0 / 0 |
| 已定位 HEIC 灰色占位 | 1 → 0 |
| 杭州页空 fills 文字 | 22 → 0 |

HEIC 经插件 UI 本地转 PNG，最终图片3072×3072。138个文本仍报字体缺失，
属于环境字体限制；本轮不声称全画布像素一致。旧汇总样本1830记录与修改前
完全一致；测试33/35通过（2既有失败），双端构建通过。

### 2026-09-06 · 杂记跨页实例

更新样本13页4387记录，三个交通卡实例（542:0377 / 542:0775 / 542:0531）
的mainComponentId均正确，但母版378:1687位于后续页面。修复仅在importer，
解码记录和所有props保持不变，比较器无法衡量本项。重链队列跨页保留，
只持有实例覆盖子树。36测试34通过、2既有失败；双端构建通过。
实际验证：按原顺序导入横店/通勤两页（781层），交通卡 Frame 3 → 0、
Instance 0 → 3，源记录数量未变。新增验证页标记“（跨页实例修复）”。

### 2026-09-06 · 春节页文字样式

| 项目 | 修复前 → 后 |
|---|---|
| 整份杂记记录 | 4387 → 4387 |
| 春节页文本Inter回退 | 53 → 0 |
| 本页命名样式绑定 | 0 → 23整段 + 21范围文本 |
| 标题 | Inter 14px → 本地“大标题”64/77 |

另9个文本为匿名字体覆盖，正确恢复PingFang Semibold，未冒充命名样式。
实际页面导入108层，无缺失字体提示；混合正文保持不同字重。
本地没有杂记zip基准，采用源稿UI与真实重导入验证，不声称整页像素差归零。
旧汇总1830记录逐条A/B不变；42测试40通过、2既有失败，双端构建通过。


## 2026-09-06 · 自由抽屉半透明白色覆盖层

`552:1892`（矩形 13）的填充引用 `552:1933` → paint `552:1934`，
字段 08 的 ARGB 为 `(0.5, 1, 1, 1)`，同时显式写入 09=1。MasterGo
属性面板显示 FFFFFF / 50%；原导入得到 opacity=1，遮住下方 12 个色块。
SOLID 的 09=1 不应覆盖 08 alpha；09 非默认值仍沿用现有优先级。两者不能
相乘：旧汇总 fixture 有 10 个填充/描边将同一透明度写在两处，相乘会重复衰减。
本次仅修改解码器，importer 无改动。

A/B 对本轮开始时的解码器（包含先前未提交修复）：汇总 1830 条记录完全相同；
杂记 4387 条记录及结构不变，2217 个节点共 2234 个属性差异均为 paint opacity。
自由抽屉 39 条记录仅矩形 13 的 fill opacity 从 1 变为 0.5。当前目录没有
配对 zip，未声称运行 zip parity。测试 43 项，41 通过，2 项为已有失败。

实际插件重导入自由抽屉成功，画布 38 节点（与原导入页一致）；新页
`5:22129`「自由抽屉（透明度修复）」、容器 `5:22130`、覆盖层 `5:22143`。
Figma API 确认白色填充 opacity=0.5；渲染截图中 12 个色块重新可见。
原页保留。两端构建通过；该解码修复需重导入，刷新字体不会应用它。


## 2026-09-08 · 测试文件 09008 外部组件范围

输入：`测试集/测试文件 09008/测试文件 09008.mg` 与同目录
`mastergo2figma-partial-pages-2026-09-08T07-20-03-412Z.zip`。

| 检查 | 修复前 | 修复后 |
|---|---:|---:|
| 解码记录 | 23647 | 777 |
| ZIP 基准画布记录 | 756 | 756 |
| Missing | 0 | 0 |
| Extra（临时母版树记录） | 22891 | 21 |
| Font / Paint / Deep props | 40 / 17 / 518 | 40 / 17 / 518 |
| 真实 Figma 页根数 | 45 | 6 |
| 真实 Figma 残留 Component / ComponentSet | 5126 / 24 | 0 / 0 |

其他具名 mismatch（type/parent/index/childOrder/geometry/transform/effect/text/vector）
均为 0。756 条画布 props 和 mainComponentId 逐条不变；所有非 Extra 差异集合
added=0、removed=0。新增包含五棵 / 21 条实际需要的母版依赖，完整/精简路径均
777 条，mainComponentId 无悬空。修复仅在 decoder 的可达性与依赖收集，importer
未改；生成的 ui.html 已更新。

实测新构建插件成功完成，UI 报告 1 页 / 756 图层。交付页
`5:12`「页面 1_mg_修复09008」有六个 375×812 框架、23 个真实 INSTANCE、
0 COMPONENT、0 COMPONENT_SET。旧「页面 1_mg」39 个残留母版根也已清理，
保留六个原框架。原页面不作为新构建导入证明。

保留残差：插件报告 3 个图片缺失、57 个文本字体缺失；518 条 props 残差包含
字体/行高/字距、padding 和 paint 等既有字段，未经本次逐项修复，不声称全画布
像素一致。旧版崩溃没有异常日志；已确认无关组件过量，新版真实导入无崩溃，
但不将“原崩溃必定是 OOM”写成已证实事实。

另一个现有主样本「插件测试 汇总.mg」与现有配对 zip：1830→1631，
Missing=0，Extra=703→504，182 geometry / 108 transform / 90 font / 7 paint /
1323 deep 均逐条不变。detached HEAD 完整/精简 A/B 均只去掉199条临时母版
记录，画布 props 不变。其他历史 fixture 本地已不在；“待处理 可忽视”不纳入
本次处理。两端 build 通过；49 测试47通过、2既有失败（修改前48测试46通过）。

应用方式：后续导入重新打开本地插件即可使用新包；已有文档需重导入才能应用
依赖裁剪，刷新字体不能执行组件清理。本测试文件已完成真实重导入及旧页残留清理。


六屏 image / zip / 新MG截图已逐屏检查。登录页背景图在zip和mg均缺失；MG
消息中心标题区仍有纵向位置差，文字/勾选项存在字体或布局差异，保留待独立定位。
前三屏九个背景取样最大通道差≤1，但这不代表整屏像素一致。

## 2026-09-08 · 09008 image / ZIP 画面修复（第二轮）

逐屏对照 `页面 1_image` 与 `页面 1_zip`，定位到以下共享导入问题：

- 三个登录/重置页的蓝色球面背景变灰：ZIP 的 `image_003.bin` 实为
  RIFF/WEBP，3840×1440，30026 字节。接收 UI 按文件头识别并在本地 Canvas
  转 PNG，旧 `.bin` 也兼容；失败仍发送原字节，由原缺图路径计数，不中断下一图。
  发送端 RIFF 第四字节误写成 `0x47`，同步更正为 `0x46`。
- `苹方-简 / 常规体` 等中文名称被原字体归一化逻辑删空，已按本机
  Apple PingFang.ttc 的 English / zh-CN name 表建立地区与字重别名。
  保留未知中文名称，避免错误匹配；完整 face name 同时出现在 family/style
  的情况按实际已安装 family + style 匹配，不把缺失 Bold 替换成 Semibold。
- 三处欢迎语源高度 80、固定行高 40，Figma 混合字号文本实际高度 87，
  第二行下移 7 px；本机属性面板也确认 87，并以 Inter 复现相同宿主行为。
  对明确换行、每行单字号且字号不同、样式范围完整、源高度恰等于行高之和的
  WIDTH_AND_HEIGHT 文本，恢复为透明 Frame + 逐行可编辑 Text。
  保留外框 144×80 与每行 40 px；有自动折行、空行、段落间距、mask、
  不同显式行高、范围不完整或单行内混合字号时继续普通 Text 路径。
  这是渲染兼容转换，不改源字符或 decoder，代价是这些段落分行编辑。

最终构建在本机插件完整导入 ZIP 成功：UI 报 1 页 / 756 个源图层、0 缺图、
38 个缺字体文本（仅剩 PingFang SC Bold 与 HarmonyOS Sans SC Regular；包含
隐藏内容）。中间版本曾报 41，补上 full-face-name 匹配后降为 38。
交付页 `5:2742`「页面 1_zip_修复09008」六个根框架均保留；实际后处理后
753 个后代节点（原 ZIP 后处理 747 + 三段欢迎语新增六个行节点）。三段欢迎语
外框高 80，行 y 为 0 / 40，均为可编辑 Text；三个背景均恢复。六屏截图逐屏
复核，登录屏按主框架裁切对齐，排除两端截图阴影边距 30 / 20 px 的差异。
旧 image / ZIP 页面保留作基准；本轮两个中间导入页与排版诊断页已移除。
上一轮 MG 修复页不作为本轮 ZIP 修复后的实测结果。

两端构建通过；54 测试中 52 通过、2 个原有失败仍为 visibility mask 默认值
与 container padding（见上一轮基线说明）。新增字体、WebP 与混合字号行分割
测试均通过。两个现有配对样本 compare 再跑：09008 Missing 0 / Extra 21 /
Deep 518；汇总 Missing 0 / Extra 504 / Deep 1323，与上一轮相同。
这些 props 比较无法覆盖本轮图像解码与文字分行效果，画布实测另行记录如上。
本机缺失字体仍可能产生字形细节差异，不声称像素完全一致。

## 2026-09-08 · 09008 原生 MG 修复闭环（第三轮）

本轮直接修改 `mgPackage.js`，补齐 UTF-8 中文字体条目、百分比行高 `07 01`
（节点／混合文字／样式输出共用单位函数），以及两个蓝色登录按钮的蒙版渲染
组合 `2f 01 36 01`。共用 importer 的 WebP 转换、字体别名和可编辑欢迎语分行
也在 MG 的实际 `slimInstanceDescendants:true` 路径验证。

| 检查 | 上一轮 MG | 本轮 MG |
|---|---:|---:|
| 解码记录（完整／精简） | 777 / 777 | 777 / 777 |
| Missing / Extra | 0 / 21 | 0 / 21 |
| Font mismatches | 40 | 20 |
| Deep props | 518 | 367 |
| 缺图（本机插件） | 3 | 0 |
| 需绘制自身填充的按钮蒙版 | 0 | 2 |

09008 移除 151 条 deep diff、20 条 font diff，added=0；两个 maskRendersFill
由 false→true，只有 `3:71805` / `3:71503`，其他蒙版不变。汇总样本完整 diff
集合不变（deep 1323 / font 90 / paint 7），全部 maskRendersFill 也不变。
新增字节级中文字体／行高／蒙版组合回归测试；57 项测试 55 通过、2 个既有失败。
两端 build 与 diff --check 通过。

最终本机插件导入 UI 报 1 页 / 756 源图层 / 0 缺图 / 31 个字体缺失文本。
交付页更新为 `5:5436`「页面 1_mg_修复09008」：六个 375×812 根框架、
23 INSTANCE、0 COMPONENT/COMPONENT_SET；欢迎语三段均高 80、两个行节点高
40；输入提示为 14 px、行高 22。旧修复页与本轮中间导入页已移除，原始
`页面 1_mg`、`页面 1_zip`、`页面 1_image` 和 ZIP 修复页仍保留。
六屏 image / ZIP / MG 截图复核，最后额外重导入验证两个按钮：底色采样
(40,550)、(80,570) 均与基准同为 RGB(47,127,252)。背景取样 (160,60)
仍有最大 2/255 的色差，未声称全图像素一致；尚余 367 条 props 残差与缺失字体。
依赖、字节解码、蒙版及文字分行修复需重导入；字体匹配可单独用“刷新字体”。
本测试文件已由代理完成真实 MG 重导入，无需用户再次操作。
