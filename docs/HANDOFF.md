# 新 session 交接 — 2026-10-19

这是本次交接快照，不是每次改动都要追加的日志。先读 [HLD](HLD.md)，使用与命令见 [README](../README.md)；旧 `Waifu-Fit-Player_Codex_Handoff/`、`decisions.md`、`verification.md` 只供历史追溯。

## 接手状态

- 本次文档整理前基线为 `63a05d6 chore: add more bgm file`，工作区干净，分支为 `main`。此次仅整理文档，不切分支、不 push；用户自己安排试用 6.1sol 的分支。
- 最近需求已完成：三个菜单的卡片流光只认**最晚实际操作的目标**；进入单曲页默认高亮当前曲目，Enter 可以确认开始。实现提交 `8d7a0cb`，没有需要继续补做的已知需求。
- 本地 `maps/` 和视频不进 Git；BGM 在 `src/assets/menu-bgm/`，SE 在 `src/assets/menu-sfx/`，这些是随 Git 走的游戏素材，不要当临时文件清理。

## 易回退的约定

- **数据**：FITNESS / 健身与 DANCE / 舞蹈各自有 draft 和 released 快照。健身由作者标注低／中／高运动强度，舞蹈保留数值难度。IndexedDB v2 原子迁移旧 Normal→fitness、Hard→dance；旧 JSON 在模型入口兼容，无类型默认 dance。旧数值保存在 `danceDifficulty`，不推断 `intensity`。音符、区间、视频关联、曲绘和更新时间保持原样，上次草稿指针在恢复时迁移。编辑不影响成品，发布只替换所选类型；撤下保留草稿，彻底删除也不删除用户磁盘原视频。入口在 `chart-types.ts`、`library.ts`、`useLibrary.ts`、`LibraryControls.tsx`。
- **游戏**：共享 video 是唯一媒体时钟；音符是绝对毫秒，`chartTime = videoTime + videoOffsetMs`。节拍段 offset 只管网格，不能拿来移动音轨。菜单／编辑器样式调整不能误伤游戏画面和音画性能。MP4 录屏导出已被用户明确废弃并删除，不要恢复。
- **音乐**：菜单 BGM、游戏／视频、SE 是三个独立音量，SE 默认 50%。试听直接用 MP4 音轨。当前 BGM 的完整压缩文件保留为 Blob URL，试听期间不释放；这是修复停留约 20～25 秒后返回无声的关键。菜单两个 Audio 共用一个 AudioContext／Analyser，只有一个音源在播放；不要把单曲页误判为应暂停 AudioContext。
- **视觉**：主页两张卡片自行规律悬浮，不跟 BGM；背景粉／蓝色块跟随当前音乐，单曲页跟试听。转场必须先完整遮住旧页，再换页、揭幕。延续现有 Pop Art，不擅自加功能区或换风格。
- **选择**：`useCardHighlight.ts` 维护唯一视觉高亮，`CoverTrace.tsx` 画流光；不要重新用独立 `:hover` 与 `:focus-visible` 同时点亮多张卡。停住的鼠标不能抢键盘高亮。悬停不等于更换居中曲目／试听。`MenuControls.tsx` 的返回按钮、Backspace、Esc 都必须有效。
- **卡路里**：按音符权重和持续时间估算，统一系数；0.1 kcal 是显示精度，不是固定增量。`calories.ts` 已预编译累计索引，别改成逐帧全谱扫描。

## 验证与工作方式

- 用户偏好：直接完成小范围修改，简短汇报，不反复确认、不顺手重构、不跑与改动无关的长测。按功能合理拆 commit，使用 `fix:`、`feat:`、`docs:` 等前缀；未经要求不 push。
- 正式入口 `npm start`：先 build，再在 `http://127.0.0.1:5173/` 提供产物。源码改动不会热更新到已运行的正式版。开发用 `npm run dev`。
- 常用检查：`npm run check`（类型＋单测）、`npm run build`；浏览器测试只选相关 spec。全量 E2E 约 8 分钟，不为小 UI 改动默认跑全套。
- 当前本机有被 Git 忽略的 `artifacts/practice-qa.config.ts`（preview 4179）和 `artifacts/menu-music-qa.config.ts`（dev 4180）。例如：`npx playwright test -c artifacts/practice-qa.config.ts tests/menu-highlight.spec.ts`，preview 测试前先 build。新 checkout 若没有这些文件，可另配独立端口，`reuseExistingServer: false`；不要动用户的 5173 服务。
- `tests/menu-music.spec.ts` 临时写入 BGM 测试 WAV，需要 dev 服务；**不要与 build 并行**，避免测试音频混入产物。测试结束只清理自己启动的进程。
- 浏览器曲库与视频授权按 origin 隔离：`127.0.0.1:5173`、`localhost`、其他端口互不共用。不要为了测试清理用户站点存储。
- 最近代码已验证 build、菜单导航／动效及流光交互测试；本次仅修改文档，不重复运行游戏测试。后续修改按实际影响选测，不沿用旧报告当新验证。
