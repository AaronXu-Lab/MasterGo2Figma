# 修复与回归细节

范围、暂停条件与最终验收以 [执行工作流](workflow.md) 为准。用户明确结束时按主工作流收尾；三页核验后若仅剩已证实的缺失字体文本差异，按第 5a 步提前结束。开始修复时读本文件；既有 case 的局部续作只复核相关章节。默认输入来自本批次 Downloads 目录，不要求复制进仓库。

取证前读取仓库 AGENTS.md；改 `mgPackage.js` 前必须读 `docs/MG_DECODER.md`。图层结构用 `use_figma` 读真实树，调用前加载 `figma:figma-use`。每轮重新列 `figma.root.children` 的 id/name；metadata 可能截断，不能当完整树。实际插件用 Computer Use，先读其工具文档。不沿用旧页 ID、不按最大编号猜验证页、不覆盖基准。

## 分诊（最省时间的一步，别跳）

先按用户范围建立差异清单：整页问题逐屏核查，不局限于图表；单层小修聚焦目标及同类节点，不重开已验收的问题。记录页面/节点、现象、三侧证据、待修原因与验证状态。

先跑结构比对拿全局盘面并保留本轮修改前输出：

```bash
node tools/compare_mg_import.js "<file.mg>" "<baseline.zip>"        # --json 可导出全量
```

- **Missing records 永远不可接受**；**Extra** 全是库 master 才是预期噪音。
- **deep prop 要看全量**，`--json` 后按 prop path 分桶再抽样——具名计数全零时仍可能有一整族属性全错。
- **record 级字段比较器根本不比**：`libraryMaster` / `maskRendersFill` / `instanceScale` / `mainComponentId` /
  各 styleRef。改这些时 diff 数字纹丝不动 ≠ 没生效，必须去画布验证。
- **旧 ZIP 不是视觉真值**：MG 修正后若更符合原生 image/SVG，逐项记录 ZIP 的错误及 compare 残差，不为 diff 清零回退正确修复。

然后按现象查表，直接决定去哪个阶段：

| 现象 | 判定 | 下一步 |
|---|---|---|
| 只有 mg 错、zip 对 | 解码器 | 解码器章节 |
| **mg 与 zip 同错** | importer 或渲染语义 | 先 diff 两侧 record；**相关解码记录一致就停止盲目 hexdump** → importer 章节 |
| **同一族里部分对、部分错**（某几个字重正常，只有一档挂） | 匹配/归一化层，不是数据 | 去找匹配函数，别怀疑记录 |
| 记录齐全但画布少块／多块 | importer 删除或增补类逻辑 | 比较器全盲 → 数画布顶层块数 |
| 用户说"zip 导入也有问题" | **当真**，这是 bug 在两个解码器下游的强信号 | importer 章节 |

## 解码器破解（`ReceiveFromMasterGo/src/ui/mgPackage.js`）

- `scripts/hexdump_record.js <file.mg> <recordId> [bytes]` 按 `\x01<id>\x00` 锚点 dump 原始字节；
  `scripts/dump_records.js <file.mg> <baseline.zip> <outDir>` 把 mg 解码与 zip 基准各导成 JSON 逐节点对照。
  两个脚本都 vm 加载仓库当前的 `mgPackage.js`，不缓存旧版本。
- **已知答案交叉表**：把节点按经原生证据确认的基准期望值分组，与候选字节交叉制表，取值与分组完全对齐的 tag 才算破解。单例最值钱。
- **顺序步进解析，永不在 twisted-float 载荷里用 tag 正则**；`break`-on-unknown 是静默截断不是保险。
- **区分"字段缺失"与"值为 0"**：MasterGo 大量"省略即默认"（padding 缺失=10、strokeWeight 缺失=1、sizing 缺失=AUTO）。
- 坐标错误要逐段观察 **原始解码 → 模板继承/实例展开 → v2 record → Figma 节点**，不能看到偏移就归咎于约束计算。完整导出的真实 stub 有 transform 对象时，省略轴为零；整个对象缺失才继承 slot。合成子层另有回退，不能混用。0920 标签 y=0 被继承为 -5 的修复同时验证了隐藏合成节点未退化。
- 避免按节点 ID、名称或某张图的固定像素写特例；以原生字段、结构和交叉样本确定规则。
- **放宽正则前先定义新语法的边界**：一个不允许点号的 family 正则曾丢掉 22/27 个字体条目，是"mg 明显比 zip 差"的最大单一根因。
- **两个 fixture 各持一半真相时，答案几乎一定是还没破解的格式位**——去 hexdump 差字节，别选边站。
  trailer `1e`（蒙版是否自渲染填充）就是这么破的：0806 说"要补漆"、临时测试说"不能补漆"，差的就是这一个字节。

## importer 取证（`src/code.ts`、`src/appliers/`、`src/fontLoader.ts`）

- **"看不见" ≠ "没还原"**。先用 `use_figma` dump 真实节点树（type / visible / fills / 子节点数）再定性。
- **补漆、补孪生、提升填充这类"加东西"的修复，先排查兄弟画纸层**：MasterGo 惯用"蒙版 + 同款画纸兄弟层"结构，
  补出来的东西和兄弟层撞色时看着是对的，会把错误规则伪装成正确。
- **删除类改动（`libraryMaster`、residue skip…）必须重导入或数画布顶层块数**——比较器对 importer 的删除全盲。
- 布局恢复是分阶段的：节点自身、父子 auto-layout、固定尺寸/transform、实例 override 以及收尾可能互相覆盖。既看最后属性，也看实际边界和相邻元素；STRETCH 高度不能只在中途赋值后就判定修好。
- MCP 与桌面 Figma 的字体环境可能不同。MCP 缺 PingFang 等字体不等于用户桌面缺字体；涉及字体的写操作失败时改用桌面插件验证，不为完成 MCP 操作擅自换字体。
- 仅清理自己本轮创建的临时节点、失败导入页和中间验证页，核对 id 后执行；保留用户提供的页面与基准，以及最终成功验证页。

## 回归（每次改动后）

1. 当前样本和可用主回归 fixture 都跑 compare，以本轮修改前的实际输出为基线，逐类计数与 deep diff 都要检查；历史残差导致退出码非零时，区分新增差异与既有差异，不把比较器失败说成全通过。
2. 属性计数变化需逐项解释：例如新增 minWidth 可能是旧 ZIP 未导出的字段；是否改善由 `_image` 和原生记录交叉判断。未解释的新增差异不能直接豁免。
3. 需要 A/B 时用独立 worktree 对比，**不要用 `git stash`**。已有未提交修改时，另保留任务开始时的实际源文件快照，不把 HEAD 当成当前基线。其余有 ZIP 的可用 fixture 比较 `--json` 差集，无 ZIP 的检查页数/记录数/id digest；记录不可用的测试集，不声称已运行。
4. 新增与根因对应的回归测试，覆盖真实 raw、缺字段、合成实例等受影响分支；运行 `node --test tools/tests/*.test.js`，区分已有失败。
5. ZIP／导出端修复按主工作流第 7 步完成相关本地检查后交用户手动测试，不为验证而重开 MasterGo；已有样本可用于分析，但不能证明新导出效果。
6. 功能变更完成后两端 `npm run build`，确认接收端生成了最新 `code.js` / `ui.html`。禁止手改 `ui.html`。接收端修改通过后用已有资产开始真实导入；ZIP／导出端修复遵守上述手动测试分支；纯技能/文档维护只做对应文档校验，不触发无关构建或 Figma 操作。

## 实际插件导入与视觉闭环

### 导入与故障恢复

1. 通过 Computer Use 将 Figma 切到前台，检查当前窗口确为目标文件。`getApp` 或读取 AX 不代表已置前台；必要时用当前 UI 的 Window → Bring All to Front，再确认窗口。使用当前 UI 状态中的入口与元素索引，不写死索引、节点 ID 或路径。
2. 关闭旧插件实例后启动最新本地开发插件，确认加载本次构建。最近一次插件确为 MasterGo Importer 时可用其重新运行快捷键，否则从 UI 选择正确插件。分别选择已核实的 `.mg` 和配对 ZIP（分两次导入），等待解析完成，核对选页及图层数，再点击导入。
3. macOS 文件选择框可用“前往文件夹”（`Cmd+Shift+G`）输入完整路径；中文路径粘贴失效时用工具支持的文本字段赋值，再观察路径与选中文件。不要把“已点选择文件”当成已完成导入。
4. 导入期间遵守[插件运行隔离](workflow.md#插件运行隔离)，等待时维持进度沟通。
5. 卡住、超时或失败时，先按[桌面状态恢复](workflow.md#桌面状态恢复)唤起目标应用与文件窗口，重新核实插件状态和残留页面，再决定续作或重试。曾有导入进度停滞在恢复前台后继续成功；这只能证明该次恢复有效，不能据此确认后台节流或导入算法为根因，不盲目延长超时。确认失败后清理本轮残留并重试；同一故障重复且无新证据时停止无效重试，说明阻塞与尚未验证项。不要要求用户手动完成自己已有权限可执行的导入。
6. 插件显示成功后关闭插件，再重新列 Figma 页面，用实际新增页面确认结果；命名为可辨认的 `_mg` / `_zip` 验证版本，记录新页面和目标节点链接。

**直接修改画布仅可用于诊断假设，不能代替源代码修复与新构建的真实导入。** 最终截图必须来自实际导入结果；字体匹配类可通过插件「刷新字体」原地验证，并明确验证了哪条路径。

### 视觉检查与完成条件

以下循环适用于仍在执行的接收端修复；用户结束、仅缺字体提前结束和 ZIP／导出端交用户手测的分支均按主工作流，不以此节重新启动测试。

- 对同一内容、同一比例的 `_image` / 新 `_zip` / 新 `_mg` 截图逐屏检查，可用 Pillow 拼成三联图并裁剪热点。不能用一个图表的截图代表整页验收；用户只要求单层修复时，核查该层及受影响同类即可。
- 几何看坐标、尺寸、文本基线及实际渲染边界；颜色在同坐标纯色区域取样，排除抗锯齿边缘与截图缩放。渐变、蒙版和字体渲染可能存在平台残差，记录实际差值与原因；不设全图统一的 `1/255` 阈值，也不自动豁免所有字体问题。
- 除主工作流第 5a 步的提前结束条件外，有差异就回到分诊，逐项修复、回归、构建、重新导入，直到本次约定范围内问题解决。无新证据且受工具、缺失基准或字体环境阻塞时，如实交付当前结果与未验证项，不称“全部解决”。
- 接收端技术验证依据（随后仍需进入主工作流的用户验收 Gate）：目标问题在新导入结果中消失、与 `_image` 目视一致且几何核验支持结论、相关回归无未解释退化、临时实验已清理。不要承诺未证明的逐像素一致。

## 文档与交付

同步有变化的 `docs/MG_DECODER.md`（字段规格与证据）、`docs/MG_DECODER_JOURNAL.md`（过程与教训）、`docs/MG_ZIP_PARITY_STATUS.md`（本次实际计数和画布验证结果）。环境存在 `mg-binary-format` 记忆时同步相关发现；不可用时以仓库文档为准。

交付说明根因、修复效果、实际导入的页面/节点链接、已执行验证和必要残差。复杂批次可附解码器/importer 修复清单及计数表，单层小修简明报告即可。明确哪些旧页面仍需重导入或刷新字体，不把旧画布当作已更新；保留最终验证页供用户查看。

## 已知 case 速查

先查这张表，命中就直接去对应位置，别从头逆向：

| 症状 | 根因 | 位置 |
|---|---|---|
| 整屏字号/行高/字距回退默认值 | 字体条目 family 正则不认某字符（如点号） | `mgScanFontStyles` |
| 字体明明装了仍回退 Inter，且只有某一档字重挂 | 样式名带字符集版后缀（`55 Regular L3` vs `55 Regular`） | `normalizeFontStyleForMatch` |
| 画布整块消失 | 库同步来的**画布**组件被误标 `libraryMaster` 删掉 | `mgPackage.js` 页面根门控 `!nodes[n.parent]` |
| 色块过饱和 / 多出一层底色 | 给"仅形状"蒙版补了漆 | trailer `1e` → `maskRendersFill` → `paintFilledMaskTwins` |
| 多出一条灰条 | 默认 #D8D8D8 占位蒙版（含透明度渐变）被补漆 | `isDefaultMaskFill` |
| 图标完全透明但子树完好 | 外层 boolean 的填充没提升 | `applyOuterBooleanPaint` |
| 文本框被撑到全长、后面元素被挤飞 | `textAutoResize = "TRUNCATE"` 是 Figma 已废弃拼写 | `appliers/text.ts` |
| 整页 token 着色文字/描边偏淡（0.88/0.45/0.25） | SOLID paint 的 `09` 被当 opacity；`08` alpha 才是 | `mgParsePaintRecord` |
| 品牌色/状态色节点 fills=[] | paint 尾部 `0e`/`0f` 未消费，或变量只有别名没有 paint | `mgParsePaintRecord` / `mgScanPaints` 别名表 |
| 实例容器子节点翻倍、index/child-order 大片失配 | slash stub 之下是 TYPED bare 子记录，仍克隆了模板 | `mgExpandInstances` walk 顶部谓词 |
| STRETCH / layoutGrow 整族丢失 | trailer 走读器遇到 `30 <n>{…}` 返回 null，整条 trailer 消失 | `walkTrailerFields`；先用 python 普查未知 tag |
| 实例里的 DatePicker/Input 撑出表单项 | 实例子层 layoutGrow 未回放 | `flushInstanceChildLayoutOverrides` |
| 表单标签比单选项高 5 px | raw stub 的 transform 存在但零轴被继承成母版 -5 | `mgInheritFromTemplate` |
| 图例文字盒只有 10 px、文字挤压 | computed 字体项无像素标记时应为 AUTO 行高 | `mgLineHeightFromStyleEntry` |
| 按钮比原图窄、最小宽度丢失 | trailer `32` minWidth 未贯通解码/精简/导入 | `mgPackage.js` / `container.ts` |
| 状态色选错但 paint 可解析 | 变量别名误取二进制首条，未按 mode 排序 | `mgScanPaints` |
| 图表曲线或柱形底部偏移 | ABSOLUTE STRETCH 尺寸与 auto-layout 收尾互相覆盖 | `deferredLayout.ts` |
| Boolean 外框丢失但内部正确 | 外层 stroke 的提升不能依赖 fill 是否存在 | `applyOuterBooleanPaint` |

## 附带脚本

| 脚本 | 用途 |
|---|---|
| `scripts/dump_records.js <file.mg> <baseline.zip> <outDir>` | mg 解码与 zip 基准各导出为 `actual_records.json` / `expected_records.json` |
| `scripts/hexdump_record.js <file.mg> <recordId> [bytes]` | 按 id 锚点在 `.mg` document 里 hexdump 原始记录字节 |

从仓库根运行 `node .agents/skills/mg-import-fix/scripts/<脚本名> ...`；输入路径可相对仓库根，脚本自己推导仓库根。
