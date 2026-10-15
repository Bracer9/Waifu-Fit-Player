# 跟练场景素材记录

日期：2026-10-16。此轮将参考图里的舞台灯、反光地板、粉色与炭黑色运动垫作为本地背景素材；可交互的专辑、五轨、视频、控制条、文字与水壶由 React / CSS / SVG 单独渲染。

## 素材与来源

- 用户提供的参考图：`references/ui-references/uiref-1.png`。
- 生成方式：内置 `image_gen` 编辑模式，以上述参考图为输入；无外部 API 或运行时生成。
- 项目内素材：`public/art/studio-scene-v2.png`（1672 × 941，约 1.96 MB）。原始生成结果直接复制，未二次改图。
- 原始输出：`C:/Users/ASUS/.codex/generated_images/01a13f52-d208-7f53-b2b5-7fd8018e2aa7/exec-9afb08d8-a351-406a-adc0-0477a079d709.png`。
- 水壶：`src/components/PracticeArtwork.tsx` 中的本地 SVG，渐变瓶身、瓶盖握纹、高光、接触阴影与 01 印字。独立前景层避免被书页遮挡，不接收鼠标事件。
- 垫子文字是 CSS 排版；运动垫织纹、厚边、反光与灯具已包含在背景素材中。

背景是装饰场景，随窗口宽高映射以保留顶部灯具与底部运动垫。真实视频独立使用 16:9 / contain，视频和音符不会随背景拉伸。小于 1000px 的窄屏保留上下页布局并隐藏前景装饰，优先保证操作区域。

## 最终生成提示词

```text
Use case: precise-object-edit. Create a clean, high-quality 16:9 background plate for a real interactive rhythm-fitness game, by editing the supplied reference image. Keep its physical 3D studio art direction, cream/cyan/hot pink/charcoal palette, camera angle, overhead theatrical lighting, glossy studio floor and premium textured fitness mats. Remove ALL existing UI, the entire video screen and its character, all score/notes/tracks, all wall typography and logos, and remove the water bottle (it will be a separate foreground asset). Replace those removed central elements with a clean empty cream/cyan/pink geometric folded studio backdrop. The game UI will be rendered separately over the middle 75 percent of the image, so do not paint any screen, frame, placeholder, character, game UI, button or text into this image. Preserve and enhance the material richness of the reference bottom: the bottom 24 percent is a polished pale blush floor with soft cyan and pink reflections, subtle tile seams, two dense finely pebbled rubber fitness mats in strong foreshortening, pink mat on the lower left extending towards center, charcoal mat on lower right with two pink edge stripes, real visible 4mm thickness, bevels and contact shadows. Mats must be large enough to appreciate the microtexture, blank with NO text. Preserve the reference's 2 to 3 physically modeled black metal cylindrical stage spotlights hanging at the top around x=34 to 45 percent, clearly visible housings, glass lenses and mounting yokes, warm-white lit lenses and very subtle soft illumination of the environment. Keep broad central negative space. Render as a premium physically based 3D product scene, tactile materials, soft bounced light, realistic highlights and ambient occlusion; not a flat vector illustration, not a dashboard. No watermark. Wide 16:9, high resolution.
```

## 版本边界

- 最初 UI 前：`main` / `91f3630` / `checkpoint/pre-album-ui-20261016`。
- 第一版折页 UI：`693afe7` / `checkpoint/album-pass1-20261016`。
- 本轮继续在 `ui/album-stage` 开发；上述提交和标签不变。可在工作区干净时使用 `git switch --detach checkpoint/album-pass1-20261016` 对照上一版，再用 `git switch ui/album-stage` 回来。
