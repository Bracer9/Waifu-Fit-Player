# 跟练场景素材记录

当前使用 v4 场景：硬边几何地板、舞台灯、粉色与炭黑色运动垫。专辑、五轨、视频、控制条与墙面蓝色花纹由 React / CSS / SVG 单独渲染。下方保留各轮素材来源和提示词。

## v4：墙面蓝色花纹移到左上方（2026-10-18）

- 内置 `image_gen` 编辑 v3，移除右墙的两块蓝色花纹，输出复制为 `public/art/studio-scene-v4.png`。
- 左上方三角形和竖条改用两个静态 SVG 多边形；与 NOW PLAYING、WORKBENCH 蓝底共用 `--album-cyan: #32c6d3`。不增加动画或逐帧计算。
- 生成提示词：

```text
Use case: precise-object-edit. This is an existing game background plate, NOT a request to redesign it. Edit only the TWO CYAN GEOMETRIC PAINTED SHAPES on the rear RIGHT WALL: the large cyan right-pointing triangle (approximately x47%-72%, y5%-58%) and the vertical cyan rectangle (approximately x77%-85%, y0%-60%). REMOVE BOTH shapes and continue the surrounding warm cream wall naturally through those two regions. Keep the pink geometric wall stripes EXACTLY as they are, and keep the ceiling pink region, two black spotlights, central wall corner, floor's cyan and pink geometric planes, pink left mat, charcoal right mat with two pink stripes, texture, lighting, shadows, framing and perspective unchanged. No new cyan shapes on either wall: those will be added by the UI separately. No lettering, icons, furniture, UI, characters, bottles, or other additions. Preserve the original 1672x941 framing and all objects as closely as possible. Output the entire clean background plate with only those two right-wall cyan shapes removed, otherwise identical.
```

## v3：硬边几何场景

- 对照图：`references/idea.jpg`（目标）和 `references/current.png`（用户提供的修改前画面）。
- 生成方式：内置 `image_gen` 编辑模式；以 v2 背景为编辑目标，idea 为几何配色参考。
- 历史素材：`public/art/studio-scene-v3.png`（1672 × 941，约 1.85 MB），直接复制原始结果，保留 v2 便于对照。
- 地板改成奶油白、青蓝、粉色的大面积多边形，保留垫子纹理、边缘厚度、局部光照和接触阴影；没有向背景内绘制游戏界面或角色。
- 专辑采用共享透视空间，左右页分别围绕中央连接边旋转 35° / −32°；整体不再沿 Z 轴倾斜。背板位于纸面后方 9px，外缘高光和底部厚边与页面一起投影。
- SWAY 使用完整时长对应的 SVG 贝塞尔曲线；播放时仅在判定线裁切，不重新拉伸剩余波形。HOLD 使用同一套细光带；方向符号、STEP L/R/C/L2/R2、动作状态继续由原谱面数据驱动。
- 卡路里显示 `— KCAL` 占位，暂未计算；FULL COMBO 默认按全部命中显示已经过的音符数，跳转后重新从媒体时间求值。
- 本轮修改前回退点：`76d6ea2` / `checkpoint/pre-vfold-notes-20261016`。

### v3 最终提示词

```text
Use case: precise-object-edit. Edit the first input image, which is the local game studio background plate. The second image is the user's target design reference: use it ONLY for the flat-color Pop Art geometric palette and floor pattern. Preserve the first image's exact wide camera, room layout, two black stage spotlights at the top, two physical fitness mats at the bottom (pink left, charcoal right with two pink stripes), the finely textured rubber, mat thickness and contact shadows. Change the floor and room's BASE COLOR DESIGN to clean solid-color hard-edge geometric planes: cream white #fff1e6, saturated cyan #35c9db, hot pink #f64e93 and charcoal #1d1c21. In particular, the exposed FLOOR between the album position and foreground mats must be a crisp CREAM / CYAN / PINK polygon composition with solid even fills and sharp straight boundaries, NOT broad pastel gradients, NOT a blurry reflective wash, NOT marble. Use a large cyan trapezoid across the middle floor, a cream plane on the left, and a pink geometric wedge on the right, in correct floor perspective. Keep subtle localized physical shadows and lighting around real objects, but do not create soft gradients across the underlying color blocks. The room wall panels should also use crisp clean flat base colors with only restrained corner occlusion. Keep the two mats tactile and realistic, not vector-flat; reduce the excessive bright sparkly sheen on the pink rubber slightly. Keep the central area completely empty because real HTML game UI and real MP4 video are rendered over it later. Do not add a book, a screen, a character, notes, UI, a bottle, lettering, logos or watermarks. Preserve image framing and 16:9 proportions. Output a polished premium contemporary Pop Art studio background plate.
```

## v2 素材与来源

- 用户提供的参考图：`references/ui-references/uiref-1.png`。
- 生成方式：内置 `image_gen` 编辑模式，以上述参考图为输入；无外部 API 或运行时生成。
- 项目内素材：`public/art/studio-scene-v2.png`（1672 × 941，约 1.96 MB）。原始生成结果直接复制，未二次改图。
- 水壶：`src/components/PracticeArtwork.tsx` 中的本地 SVG，渐变瓶身、瓶盖握纹、高光、接触阴影与 01 印字。独立前景层避免被书页遮挡，不接收鼠标事件。
- 垫子文字是 CSS 排版；运动垫织纹、厚边、反光与灯具已包含在背景素材中。

背景是装饰场景，随窗口宽高映射以保留顶部灯具与底部运动垫。真实视频独立使用 16:9 / contain，视频和音符不会随背景拉伸。小于 1000px 的窄屏保留上下页布局并隐藏前景装饰，优先保证操作区域。

## v2 最终生成提示词

```text
Use case: precise-object-edit. Create a clean, high-quality 16:9 background plate for a real interactive rhythm-fitness game, by editing the supplied reference image. Keep its physical 3D studio art direction, cream/cyan/hot pink/charcoal palette, camera angle, overhead theatrical lighting, glossy studio floor and premium textured fitness mats. Remove ALL existing UI, the entire video screen and its character, all score/notes/tracks, all wall typography and logos, and remove the water bottle (it will be a separate foreground asset). Replace those removed central elements with a clean empty cream/cyan/pink geometric folded studio backdrop. The game UI will be rendered separately over the middle 75 percent of the image, so do not paint any screen, frame, placeholder, character, game UI, button or text into this image. Preserve and enhance the material richness of the reference bottom: the bottom 24 percent is a polished pale blush floor with soft cyan and pink reflections, subtle tile seams, two dense finely pebbled rubber fitness mats in strong foreshortening, pink mat on the lower left extending towards center, charcoal mat on lower right with two pink edge stripes, real visible 4mm thickness, bevels and contact shadows. Mats must be large enough to appreciate the microtexture, blank with NO text. Preserve the reference's 2 to 3 physically modeled black metal cylindrical stage spotlights hanging at the top around x=34 to 45 percent, clearly visible housings, glass lenses and mounting yokes, warm-white lit lenses and very subtle soft illumination of the environment. Keep broad central negative space. Render as a premium physically based 3D product scene, tactile materials, soft bounced light, realistic highlights and ambient occlusion; not a flat vector illustration, not a dashboard. No watermark. Wide 16:9, high resolution.
```

## 版本边界

- 最初 UI 前：`main` / `91f3630` / `checkpoint/pre-album-ui-20261016`。
- 第一版折页 UI：`693afe7` / `checkpoint/album-pass1-20261016`。
- 本轮继续在 `ui/album-stage` 开发；上述提交和标签不变。可在工作区干净时使用 `git switch --detach checkpoint/album-pass1-20261016` 对照上一版，再用 `git switch ui/album-stage` 回来。
