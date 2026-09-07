# Repository Guidelines

## Project Structure & Module Organization

本仓库用于在 MasterGo 与 Figma 之间迁移设计图层。`SendToFigma/` 是 MasterGo 端插件，负责读取页面、序列化图层并导出 MasterGo2Figma JSON zip（v2 格式）；核心代码在 `SendToFigma/src/`，打包产物为 `SendToFigma/code.js`。`ReceiveFromMasterGo/` 是 Figma 端插件，负责导入原生 `.mg` 和 v2 JSON zip 并还原为可编辑图层（支持多文件合并、选择页面；zip 入口由 UI 实验室设置控制）；主线程核心代码在 `ReceiveFromMasterGo/src/`。插件 UI 是 React 18 + Tailwind + shadcn/ui 应用，源码在 `ReceiveFromMasterGo/ui-src/`（`App.tsx` 视图状态机、`engine.js` 框架无关的解析/流式传输引擎、`components/ui/` shadcn 组件）；`ui.template.html` 只是内联占位外壳，生成后的 UI 在 `ReceiveFromMasterGo/ui.html`（**不要手动改 `ui.html`**，见下文构建说明）。

共享类型与工具函数放在 `shared/`（`shared/types.ts` 定义跨端类型，其余为矩阵/矢量/connector 辅助函数与图层规则配置），两端通过相对路径 `../../shared/...` 引用。本地大文件中继服务在 `tools/mastergo_relay_server.py`；`tools/compare_mg_import.js` 用于比对 `.mg` 解码结果与基准 zip；`pythonParser/mg_to_zip.py` 是独立的 Python CLI，复用 `ReceiveFromMasterGo/src/ui/mgPackage.js` 的解码逻辑，可在不启动任何插件的情况下把 `.mg` 直接转成 v2 zip。根目录保留 `README.md` 和 `QUICKSTART.md`；其余长期说明集中在 `docs/`，包括 `docs/MG_DECODER.md`（`.mg` 二进制格式规格）、`docs/MG_DECODER_JOURNAL.md`（逆向过程与方法论）、`docs/MG_DECODER_UNKNOWN_FIELDS.md`（未破解字段清单速查表）、`docs/MG_ZIP_PARITY_STATUS.md`（MG/ZIP 当前一致性状态）和 `docs/PERFORMANCE_OPTIMIZATIONS.md`。截图与示例资源放在 `assets/`。不要手动修改第三方依赖目录或构建缓存。

AI agent 技能统一放在 `.agents/skills/<name>/`（唯一来源），各家工具的技能目录以**软链**指向它，例如 `.claude/skills/mg-import-fix -> ../../.agents/skills/mg-import-fix`。要改技能就改 `.agents/` 下的真实文件，不要把软链换成副本；新增其他工具时照此加软链即可。目前有 `mg-import-fix`（`.mg` 导入还原修复流程，配套 `dump_records.js` / `hexdump_record.js` 两个脚本）。

## Build, Test, and Development Commands

两个插件分别安装依赖和构建：

```bash
cd SendToFigma && npm install && npm run build
cd ReceiveFromMasterGo && npm install && npm run build
```

两端构建都会执行 TypeScript 类型检查，再用 `esbuild` 把 `src/code.ts` bundle 成 `code.js`（`manifest.json` 里 `main` 指向的插件入口）。接收端完整顺序为 UI 类型检查（`tsconfig.ui.json`）→ `node tools/build-ui.js` → 主线程类型检查（`tsconfig.json`）→ 主线程打包。`build-ui.js` 的职责是：它用 esbuild 打包 `ui-src/`（React + shadcn UI 与导入引擎）、用 Tailwind CLI 编译样式，并把 `src/ui/packageValidation.js` 与 `src/ui/mgPackage.js`（原生 `.mg` 二进制解码器）一起内联进 `ui.template.html` 的占位符，生成单文件 `ui.html`（无 CDN、无外部资源）。修改 UI 时编辑 `ui-src/`，修改解码器编辑 `src/ui/mgPackage.js`，然后重新构建（或用 `npm run watch`；注意 watch 只在启动时构建一次 UI，改 `ui-src/` 后需重跑）。`ui.html` 是生成产物，Figma 直接读取它、无需额外构建步骤。

开发时可使用：

```bash
cd SendToFigma && npm run watch
cd ReceiveFromMasterGo && npm run watch
python3 tools/mastergo_relay_server.py
```

Python 中继服务默认监听 `http://127.0.0.1:8765`，用于大文件流式写入本地 zip。

## Coding Style & Naming Conventions

主要代码使用 TypeScript，保持 2 空格缩进、显式类型、早返回和小函数。文件名沿用现有 camelCase 风格，例如 `nodeSerializer.ts`、`matrixUtils.ts`。序列化逻辑放在 `serializers/`，还原逻辑放在 `appliers/`；跨端复用逻辑优先放入 `shared/`。避免在业务代码中散落 magic number，应集中到配置或命名常量。

## Testing Guidelines

仓库使用 Node 内置测试运行器，现有测试位于 `tools/tests/*.test.js`（原生 MG 解码、v2 包校验、发送端 SVG 渐变语义）；在仓库根运行 `node --test tools/tests/*.test.js`，其中 SVG 测试依赖 `SendToFigma/node_modules/esbuild`。功能代码提交前至少运行两个插件的 `npm run build`，并按变更方向手动验证：MasterGo 端导出 zip、Figma 端导入 zip、大文件场景使用本地中继服务。涉及原生 `.mg` 解码逻辑的改动，优先用 `node tools/compare_mg_import.js [file.mg] [baseline.zip]`（不传参时默认取仓库根目录最新的 `.mg` 和 `mastergo2figma-*.zip`）与已知基准 zip 比对，而不是仅凭肉眼检查。纯文档改动无需重新生成插件产物，检查文档引用与 `git diff --check` 即可。新增可自动化测试时，优先沿用现有 `tools/tests/*.test.js`，并优先覆盖矩阵、矢量、文本、容器和 connector 转换逻辑。

### `.mg` 解码逆向经验（血泪教训，务必遵守）

- **看 `Deep prop mismatches`，不要只看那一排具名计数。** `compare_mg_import.js` 里的 `deepDiffProps` 会递归比对每个节点的**全部** `props` 字段（0.015 数值容差）并计入退出码。历史上曾把具名计数全打到零就判定“完成”，结果 `strokeAlign` / `strokeCap` / `textAutoResize` / `isMask` 等一整族未被具名检查的属性全错、只有在 Figma 里肉眼才发现——基准里有、工具没显式比的字段等于没测。加新解码时如果引入了工具没覆盖的新属性，先确认 deep-diff 能看到它。
- **逆向新字段用“已知答案交叉表”，别盲猜。** 基准 zip 给出每个节点的精确期望值：把节点按期望值分组，再把原生记录里的候选字节交叉制表，看哪个 tag 的取值与分组完全对齐。`strokeAlign` 就是这样从被误读为“paint 引用计数”的 `13` 上定位出来的。
- **顺序步进解析，别用正则找 tag。** `.mg` 的 twisted-float 载荷里会自然出现 tag 样字节（`0x1c` 曾害得 `case 4` 整个子树丢失）。标量区/尾部/容器对象都改成从固定锚点顺序消费字段（见 `mgWalkScalarFields` / `mgParseTrailer` / `mgParseContainerMeta`）。
- **区分“字段缺失”和“字段值为 0”。** MasterGo 大量“省略即默认”：padding/itemSpacing 字段缺失=默认 10、strokeWeight 缺失=1、sizing 字段缺失=AUTO、blendMode 缺失=PASS_THROUGH。语义完全不同，不能一律当 0。
- 改 `mgPackage.js` 前先读 `docs/MG_DECODER.md`（字段规格），破解手法与踩坑史见 `docs/MG_DECODER_JOURNAL.md`；有进展时两者都要同步。

## Architecture Notes

### SendToFigma（导出链路）

`src/code.ts` 是插件入口，通过 `mg.ui.onmessage` 处理 `start-export`、`resize`、传输 ack 等消息。`nodeTraverser.ts` 遍历 MasterGo 文档树；`nodeSerializer.ts` 按 `SendStrategy`（见 `shared/types.ts`）把节点分发到 `serializers/{universal,container,shapes,text,vector,connector}.ts`。`transferStream.ts` 实现两种传输模式：`direct-zip`（在插件 UI 内存里直接打包）和 `local-json-stream`（流式发给本地中继）——之所以需要中继，是因为 MasterGo 插件主线程没有 `fetch`，数据必须先通过 `mg.ui.postMessage` 传给 `ui.html` 再转发给本地 Python 服务。`exportConfig.ts` / `imageExporter.ts` 处理导出选项与图片资源；`layerRules.ts` 加载 `shared/layerRulesConfig.ts` 中的图层规则；`state.ts` 保存导出进行中的状态。

### ReceiveFromMasterGo（导入/还原链路）

接收端有两套运行环境：UI iframe 负责文件解析与传输，Figma 主线程负责创建节点；排查时先确定问题在哪一层。

1. `ui-src/App.tsx` 管理 idle / parsed / importing / success / error / lab 视图、选页与设置；`engine.js` 负责解压、解析、进度和消息通信。设置经主线程存入 `figma.clientStorage`。
2. `engine.js::parseFiles()` 将原生 `.mg` 经 `src/ui/mgPackage.js` 转成内存中的 v2 entries，再由 `src/ui/packageValidation.js` 校验；zip 直接走相同校验。多文件合并时为页面、记录、样式、资源引用加命名空间，修改引用字段时要同步检查 `prepareRecordForImport()`（包括混合文字的 `textStyleRanges[].styleRef`）。
3. `streamImportPayload()` 先开启会话、发送样式，再逐页准备数据并发送所需图片与图层：`import-session-start` → `import-styles`（可选）→ 每页 assets / page-start / page-chunk / page-end → `import-session-complete`。开始/结束请求等待 `import-ack`，chunk 不逐块等待 ACK；`transferId` 隔离会话，`requestId` 关联应答。旧 `start-import` 消息已被拒绝。
4. `src/code.ts` 的 `startImportSession()` 初始化会话，`restoreImportPageData()` 创建 Figma Page；根节点按组件依赖顺序还原，之后恢复原始根顺序。`restoreImportedNode()` 配合 `nodeCreator.ts`、`appliers/container.ts` 处理普通节点、Group、Boolean、ComponentSet 与真实 Instance；暂时无法关联的实例在每页节点齐全后重试；母版在后续页时，队列须保留该实例的覆盖子树到后续页收尾，不能提前清空，也不要持有整页记录。
5. `propertyApplier.ts` 分发属性：`appliers/universal.ts` 应用通用属性，`appliers/{vector,text,connector}.ts` 处理专属属性。Group、Boolean、ComponentSet 需要在子节点完成后 finalize；样式创建和绑定、实例 override 仍由 `code.ts` 协调。
6. **逐页**收尾：重试实例关联 → `deferredLayout.ts::applyDeferredLayoutRestores()` → 实例子层布局 override → 清理容器 shell → 单子节点 `SPACE_BETWEEN` 修正。布局分节点自身、作为子项、固定尺寸/transform 三轮处理；完成后释放页面级布局与 Group offset 缓存。不要把这些步骤误移到整场会话结束，也不要提前释放跨页引用。
7. **会话**收尾：deferred connector → 缺失字体恢复 → 再确认实例子层布局 → `paintFilledMaskTwins()` → 移除临时外部库 master → 定位视口、发送完成通知。`libraryMaster` 与 `maskRendersFill` 会影响画布增删，不能只看 props 比较结果。
8. `handleImportRequest()` 与会话完成阶段的错误处理会调用 `rollbackImportSession()`，删除本次已创建页面并尝试恢复原页面。排查失败还原时同时检查 UI 的 ACK/超时与主线程错误；不要假设回滚涵盖创建的样式等所有副作用。

字体加载、匹配和缓存位于 `fontLoader.ts`，文字恢复位于 `appliers/text.ts`。插件的「刷新字体」通过 `refreshMissingFontsInDocument()` 对现有文档重试恢复缺失字体，不必为了字体匹配修改一律要求重新导入。

性能排查先看 `engine.js` 的 UI timing、`code.ts` 的 import performance summary 和 `state.ts` 的还原统计。当前按页惰性准备数据、发出 chunk 后释放 UI 记录副本；但文件解压与 MG 转换仍会持有内存数据，不能把消息分块理解成端到端流式解码。UI 转 MG 时启用 `slimInstanceDescendants: true`，CLI/compare 默认保留完整属性；修改实例精简逻辑须同时验证实际插件路径与完整解码路径。

`src/ui/mgPackage.js` 是原生 `.mg` 二进制解码器（不仅是 v2-JSON 透传），能直接解码 MasterGo 专有的二进制 node/paint/text record，让没有内嵌 v2-JSON 的页面也能正确导入；它通过 `build-ui.js` 内联进 `ui.html`（见上文构建说明），也被 `pythonParser/mg_to_zip.py` 复用。**改动原生格式解码逻辑前必须先读 `docs/MG_DECODER.md`**——它是逆向出的 `.mg` 二进制格式的活文档（数值/tag 编解码、node record 语法、paint/text/instance 解码细节、已知缺口），修改 `mgPackage.js` 时要同步更新它。

### `.agents` 技能与接收端排查入口

`.agents/skills/mg-import-fix/SKILL.md` 是带 `.mg` / zip / Figma 样例的还原修复流程，实际处理 case 时先读完整技能。核心约束：

- `_image` 是 MasterGo 渲染基准，`_zip` 是导出结构基准，`_mg` 是修复对象。只有 mg 错时查解码器；mg/zip 同错且相关记录一致时转查 importer，停止盲目 hexdump。
- 外部组件母版可能存在于 `.mg` 中却没有画布排序 code。按实际实例引用补齐依赖，标记临时 `libraryMaster`，不要把所有带 libraryKey 的画布组件都当临时母版；跨页重复依赖必须重编号并同步引用。0906 的实例可见性另有 `instanceRef` 默认规则，见 `docs/MG_DECODER.md`。
- compare 的 deep diff 覆盖 `props`，不覆盖 `libraryMaster`、`maskRendersFill`、`instanceScale`、`mainComponentId`、styleRef 等 record 级语义，也看不到 importer 在画布上的增删。涉及这些字段要检查实际节点树和渲染。
- Figma 取证每轮重新列页面 ID；用 `use_figma` 读取真实树，调用前遵守对应 Figma 技能。不要把历史页面 ID 或截断的 metadata 当作当前完整文档。
- 回归 fixture 和历史残差查 `docs/MG_ZIP_PARITY_STATUS.md`，数字不是本次运行结果；A/B 用独立 worktree，不用 `git stash`，避免干扰用户 GitHub Desktop。
- 辅助脚本从仓库根运行：`node .agents/skills/mg-import-fix/scripts/dump_records.js <file.mg> <baseline.zip> <outDir>` 与 `node .agents/skills/mg-import-fix/scripts/hexdump_record.js <file.mg> <recordId> [bytes]`。

`ui-src/imageAssets.js` 在传输前将 HEIC/HEIF 本地转 PNG（内联 `heic-to/csp`，许可见接收端 `THIRD_PARTY_NOTICES.md`）；普通图片直接传输。单图转换/拼接/创建失败应记缺图并释放资源，不能中断页面；单个 paint 赋值失败也不能丢掉同层其他填充。

### 已知限制

MasterGo 插件桥（`mg.ui.postMessage`）没有零拷贝/流式 API，即使用了本地中继，超大或多页连续导出仍可能在宿主侧 OOM——中继只避免了"打包 zip"这一步的内存峰值，无法避免"大量 chunk 传输"阶段的桥接开销。缩小导出范围只是权宜之计，不是根本修复；动手"根治"大文件 OOM 前，先读 `README.md` 里的「OOM 和 MasterGo 限制说明」一节。

## Commit & Pull Request Guidelines

Git 历史使用简短动词短语，允许中文或英文，例如 `Improve large MG import streaming`、`修复 bug，抽象 ui 中的逻辑`。提交信息应说明用户可见行为或修复点，避免只写 `update`。Pull Request 需包含变更摘要、构建结果、手动验证步骤；涉及 UI 或图层还原效果时附截图或示例 zip。若修复已知问题，请关联 issue 或在描述中列出复现路径。

## Security & Configuration Tips

不要提交包含私有设计内容的大型 `.mg`、导出 zip 或本地 relay 输出，除非它们是明确脱敏的测试样例。修改 `manifest.json`、插件权限或本地服务端口时，在 PR 中说明原因和兼容影响。
