# 菜单音效

与 `../menu-bgm/` 一样随 Git 打包；均为本项目合成的原创电子短音，无外部素材依赖。

- `mode.wav`：主菜单音游／创作卡片。
- `album.wav`：进入专辑。
- `song.wav`：点击单曲或打开开始确认。
- `settings.wav`：打开设置。

44.1 kHz、16-bit 单声道，85–180 ms，四段合计约 49 KB。跟随菜单 BGM 音量，额外降低至 45%；快速连点会中断上一段，避免叠加。没有运行时合成或音效动画循环。

需要调音色时修改 `scripts/generate-menu-sfx.mjs`，执行 `node scripts/generate-menu-sfx.mjs` 重新生成，也可以直接用同名 WAV 替换。
