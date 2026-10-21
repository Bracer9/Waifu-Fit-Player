# 当前实现核对（2026-10-21）

核对基线：`sol61 @ 0e5c061` 加调查开始时已有的 10 个未提交文件。结论来自源码、Git diff 和可定位的历史记录。下表的“已实现”表示存在对应实现路径与测试定义，不表示本轮已在浏览器重新验收。未读取个人浏览器曲库或视频授权，未启动服务。

## 项目结构与运行架构

- `src/App.tsx`：五个模式 `home / albums / songs / player / editor`，持有作品、history reducer、实际 MediaController、视频来源与授权、发布／草稿上下文、选曲和倒计时状态。
- `src/model.ts / editing.ts / timing.ts / recording.ts`：谱面契约、迁移校验、编辑变换、网格和按键录谱。轨道 ID `punch` 在 UI 对应 ARMS，不可按旧名字认定只有拳击。
- `src/views/`：Home、LibraryMenu、Player、Editor；`components/` 与 `use*.ts` 拆出局部输入、视觉、媒体准备及音频逻辑。
- React 19、TypeScript 5.9、Vite 7；Mediabunny 为 BPM Worker 提供音轨读取；Lucide 图标、本地字体。依赖范围取自 package.json，安装解析由 package-lock.json 固定。
- 无业务后端、账号或云同步。**有 Node/Vite 本地只读文件桥接**：`vite.config.ts` 注册 `scripts/maps-library.ts`，dev 与 preview 都提供 maps 索引和受限资源路由。仅复制 `dist/` 到普通静态主机不会获得本机 maps 扫描能力。
- `maps/`：用户曲包／视频，Git 忽略。`public/art/`、`src/assets/`：运行素材；BGM、SE、专辑插画随源码管理。`references/` 与旧交接目录是设计来源，不是规范。`artifacts/`、`dist/`、测试报告是忽略的本机产物。
- `npm start` 先执行 build，再在 127.0.0.1:5173 提供 preview；`prebuild / predev` 会运行 prepare-demo，写演示媒体产物。本次没有执行它们，避免调查过程影响既有服务和产物。

## 按功能核对

| 功能                         | 当前状态／边界                                                                                                                             | 源码与验证入口                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 工作台创建、打开、视频重定位 | 已实现；先预检与校验，再一起安装谱面和视频；失败不先清空原作品                                                                             | App `installProject/openProject`；local-media；project.spec.ts                                                                             |
| 媒体时间与编辑历史           | 已实现；单一 video.currentTime；媒体订阅不写入 history；通知最多 60Hz，非帧率承诺                                                          | media.ts、timing.ts、editing.ts；media.test.ts、core.test.ts                                                                               |
| 五轨与手脚语义               | 已实现；ARMS → STEP → SIDE CRUNCH → SQUAT → CALF RAISE；STEP／侧收腹 foot 与方向分离；双臂展开按两颗音符保存、单标记呈现                   | model.ts:28、armDisplay.ts、editing.ts、recording.ts；arms-spread.spec.ts、crunch-edit.spec.ts                                             |
| 鼠标与键盘编谱               | 已实现 TAP/HOLD/SWAY/FOLLOW/FREE SWAY、跨轨、复制、撤销、N/B、A/B 循环定位                                                                 | Editor.tsx、TimelineLoop.tsx、recording.ts；editor-shortcuts.spec.ts、editor-loop.spec.ts                                                  |
| FITNESS / DANCE 草稿和成品   | 已实现；每曲每类型各一草稿和一发布快照；Normal→fitness、Hard→dance；同类型发布才替换成品                                                   | library.ts:12、chart-types.ts、useLibrary.ts；library.test.ts、chart-types.spec.ts                                                         |
| “谱面类型”下拉               | 已实现为**复制当前谱面到目标类型**，已有目标草稿会确认覆盖；不是无损打开另一份现有草稿的标签切换                                           | App.tsx `updatePublication`；继续已有草稿走本地作品 → 对应类型；旧方案撤回见决策 D18                                                       |
| 游玩区间                     | 已实现；绝对视频区间，工作台保留全谱；跨边界长条阻止发布；音游、统计与试听使用区间                                                         | play-range.ts、library.ts:53、media.ts `setPlaybackRange`；play-range.spec.ts                                                              |
| 自动 BPM                     | 已实现；Worker 本机分析当前段音轨，最多 90 秒、55–220 BPM；失败保留原值，可撤销                                                            | bpm.ts、bpm.worker.ts、BpmDetectButton.tsx；bpm-detection.spec.ts                                                                          |
| 专辑／单曲菜单、耳机与设置   | 已实现；唯一输入高亮、三路音量、FFT、预览淡入淡出、原几何展开、音乐面板固定                                                                | useCardHighlight、useMenuMusic、MenuMusic、MenuSettings；menu-* 与 settings-keyboard.spec.ts                                               |
| 专辑播放器与插槽             | 已实现**长按**约 960ms／松开退回，Shift+Enter 420ms 自动；只响完成卡扣声。最新“单击 Enter 普通插入”**未实现**                              | LibraryMenu.tsx:328、useAlbumInsertion.ts、AlbumDeck.tsx；album-deck.spec.ts:208 仍断言 requires a hold                                    |
| 开始确认与开场               | 已实现；真实已发布谱面统计，1150ms 长按、180ms 回退、420ms 完成；Shift+Enter 快捷；黑场、资源准备／实际绘制预热、房间通电、倒计时、GO 播放 | start-briefing.ts、StartBriefing、GameEntrance、usePlayer*Preparation、GameStartCountdown；start-briefing.spec.ts、ready-countdown.spec.ts |
| 暂停／恢复／工作室           | 已实现；Esc/Back 菜单，Space 只切媒体；BACK TO SELECT / RESTART / EDIT IN STUDIO；恢复和重开倒计时，拖动不倒计时                           | App.tsx:625 起、PracticePause.tsx；practice-pause.spec.ts、ready-countdown.spec.ts                                                         |
| 连击、卡路里与特效           | 已实现；自动 FULL COMBO，非玩家输入判定；热量按当前谱面时间重算，非累计运动日志；普通／侧收腹／SPECIAL 用预烘焙素材                        | combo.ts、calories.ts、Player、NoteImpact、CrunchImpact、SpecialEffect；combo/calories/special 单测与相关 specs                            |
| 曲包自动识别与导出           | 已实现；song.json + 资源相对路径；解压后扫描，不在应用内解压 ZIP；本地编辑／隐藏优先；导出仅发布版，STORE ZIP <4GB                         | maps-library.ts、song-pack.ts、map-library.ts、export-song-pack.ts、zip.ts；song-packs.spec.ts、song-pack.test.ts                          |
| 小窗口与 Retina              | 已实现“小于设计舞台时缩小”与统一坐标／portal；大窗口沿用响应式；工作台独立紧凑布局。非所有视口锁死 1920×1080、非所有比例无留边             | menu-viewport.ts、useMenuViewport、menu-viewport.css、workbench-viewport.css；game-viewport.spec.ts、menu-viewport.spec.ts                 |
| 工作台明暗                   | 已实现局部 light/dark 偏好；不等于第二套全游戏主题                                                                                         | App.tsx:251、data-workbench-theme、styles.css / workbench-viewport.css；workbench-ui.spec.ts                                               |

## 未提交改动与性能证据

源码 3 个文件：MenuMusic 将每帧继承变量从 body/menu 根移至实际视觉节点；StartBriefing 将充能变量限定到按钮并批量读取完成姿态；CSS 初始变量位置相应调整。7 个测试文件适配变量位置、插槽进入步骤和测量时机。基线 diff：90 新增／33 删除；恢复收尾已核对 221 个功能／配置／测试文件未变，原 diff 数量一致。

旧对话 A181（JSONL L13886）报告 37%–40% 样式计算降幅；本机 `artifacts/briefing-performance/README.md`、before-isolated.json 和 after.json 存在，与改动一致。环境是 **Windows Chrome，1470×956 CSS 视口、DPR 2、CPU slowdown 4x**，并非真机 M3 或 Safari；模拟 charge 样式耗时约 1604→1009ms，complete 1230→738ms；p95 帧间隔仍约 58.3／50.3ms，不能宣布稳定 60fps。采样包含自动化与 tracing 开销，完成采样延迟游戏交接，不代表完整真实流程耗时。原采样保留于本机 `artifacts/briefing-performance/`；关键指标已记录于本文。

历史工具输出实际显示先 **29 passed / 2 failed**，修正旧测试断言后定向 **3 passed**（其中一项复查）。因此“31 项相关检查通过”是按唯一用例汇总，不是原始一次全绿运行。原 JSONL L13857、L13878 分别记录首轮结果及重跑结果。本轮未重跑这些测试。`artifacts/` 被忽略，后续 checkout 不保证存在；不要把这些本机文件当作已提交的可移植基线。

更早 A105–A109 明确承认：预热及普通特效图集只部分改善首次／偶发长帧，约 42ms 残余长帧的最终根因未锁定；GPU 栅格／提交相关性不是对具体驱动、上传、滤镜或合成瓶颈的最终诊断。缓存无容量淘汰，长期多曲内存稳定性仍待测。

## 当前未完成／待决事项

| 编号 | 状态                     | 事项与证据                                                                                                                                                                                                                               |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | 已明确要求、未实现       | 专辑普通 Enter 改单击自动完成原速度／easing；Shift+Enter 不变；更新提示；不影响单曲长按。U246 / U247，L13958 / L13963，随后 L13960 / L13965 为 context_window_exceeded，期间无助手实施记录。鼠标是否同时改成单击未明确，不自行扩大范围。 |
| P2   | 已有本地实现、真机待验   | 充能样式优化的 M3 Chrome 复测；决定是否保留并提交应属于下一轮开发任务，本轮不提交。U238–U239、A181、现有 diff。                                                                                                                          |
| P3   | 方向讨论、未形成实施授权 | 16:10 及略高比例的铺满适配、菜单／舞台留边颜色。U241–U244 只讨论；当前仍留边。没有已实现的新比例布局。                                                                                                                                   |
| P4   | 用户构想、未设计定案     | 打卡、日／周／月热量和时长、第三张横卡／专辑页摘要。U102 明说“不用实装”；A084 的运动记录册、盖章资格、累计防刷、月度封套等是助手建议。代码暂无 records 模式／历史统计表。                                                                |
| P5   | 未解决的验证缺口         | 偶发卡顿最终根因、真机 Mac 性能、长期跨曲内存、OS 文件权限真实操作；不以历史自动化结果补齐这些缺口。                                                                                                                                     |
| P6   | 历史后续便利方向         | 桌面外壳／第二套全游戏主题，未见本线程最终选型或要求本轮实施；不把旧规划当已排期需求。                                                                                                                                                   |

## 文档差异审计

- HLD 已写入很多近期功能：曲包、双臂展开、窗口适配、预热、确认和液体转场等。主要缺口是**现状基线、未提交实现边界、未完成需求及方案撤回链**，不是所有功能均未记载。
- HLD 的“专辑页跟主题 BGM”“专辑↔单曲一律普通转场”过于概括：展开播放器时用试听，插入前进用 AlbumTuning，返回才普通转场；需修正。
- HLD 未明确类型下拉复制语义、编辑器 A/B 临时循环、暂停状态机、纯静态部署不支持扫描等边界；补充契约与流程。
- README 快捷键表仍是旧轨序；分支文字把 main 写成当前；“仅 1080p 以上”与已实现笔记本适配冲突。按代码修正。专辑操作说明保留**当前长按实现**，最新单击需求记在交接待办，不能直接把使用说明改成尚不存在的操作。
- HANDOFF 是 10 月 19 日快照，其中“无待办、干净 main”等不再适用；替换为当前恢复入口与基线，保留旧文件版本可由 Git 查询。
- decisions / verification、旧规划交接和素材历史不滚动改写，继续作为历史来源；不让“四轨”“C 合腿”“Normal/Hard”等旧说明回流成现规范。

## 本轮验证层级

1. 本轮已执行：Git/status/diff/history 只读核对、源码路径核对、原 JSONL 全文件解析与 SHA-256、用户消息逐批审阅与关键助手答复回查、历史测试输出过滤归档、文档链接与内容一致性检查（收尾）。
2. 本轮未执行：编译、功能测试、性能录制、浏览器操作、真实 Mac 验收；本次变动限文档与恢复工具，没有理由重跑可能生成媒体、抢服务或临时写素材的功能套件。
3. 无法从仓库确认：个人浏览器内实际草稿／成品完整性、授权状态、GitHub 当前远端 PR/main 状态。`origin/sol61` 只代表本地远程跟踪引用；本轮没有 fetch/push 或网络读取。
