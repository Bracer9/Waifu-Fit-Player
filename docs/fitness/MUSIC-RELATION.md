# 音乐与 Fitness 编排的关系

三首音轨只读解码，按人工 BPM／锚点对齐 8 小节窗口，比较起音节奏及音量变化的归一化指纹，同时比较同区间人工动作序列的完全重复与左右镜像。它不识别旋律或歌词，不能据此直接宣布主歌／副歌。

{
  "pairs": 216,
  "repeatedOrMirroredMovement": 6,
  "strongMusicMatches": 7,
  "strongMatchesWithRepeatedOrMirroredMovement": 3
}

## 最相似的段落对

| 曲目 | 起始小节对 | 音乐相似度 | 动作关系 |
|---|---|---:|---|
| LOVELY ♥ CAVITY | 57 / 105 | 0.953 | repeat |
| LOVELY ♥ CAVITY | 9 / 57 | 0.94 | different |
| LOVELY ♥ CAVITY | 49 / 97 | 0.938 | different |
| LOVELY ♥ CAVITY | 9 / 105 | 0.926 | different |
| LOVELY ♥ CAVITY | 41 / 89 | 0.924 | different |
| sugar ★ mellowcle | 17 / 41 | 0.892 | repeat |
| sugar ★ mellowcle | 9 / 33 | 0.888 | repeat |
| LOVELY ♥ CAVITY | 41 / 57 | 0.877 | different |
| LOVELY ♥ CAVITY | 9 / 41 | 0.871 | different |
| LOVELY ♥ CAVITY | 57 / 89 | 0.871 | different |
| LOVELY ♥ CAVITY | 89 / 105 | 0.866 | different |
| LOVELY ♥ CAVITY | 41 / 105 | 0.863 | different |
| LOVELY ♥ CAVITY | 9 / 89 | 0.86 | different |
| LOVELY ♥ CAVITY | 49 / 57 | 0.856 | repeat |
| LOVELY ♥ CAVITY | 49 / 105 | 0.841 | repeat |
| LOVELY ♥ CAVITY | 57 / 97 | 0.841 | different |
| LOVELY ♥ CAVITY | 97 / 105 | 0.833 | different |
| LOVELY ♥ CAVITY | 1 / 49 | 0.829 | different |
| LOVELY ♥ CAVITY | 9 / 49 | 0.828 | different |
| LOVELY ♥ CAVITY | 9 / 97 | 0.822 | different |

完整片段能量、所有配对证据见 [music-study.json](music-study.json)。积木的音乐能量分位特征保存在 bricks.json 的 musicProfile。

## 用于初版生成的规则

- 相似音乐段落优先复用之前的动作组合；只有高相似度匹配才强制保持相同积木。0.88 是保守启发式阈值，不是三首数据足以校准出的通用准确率。
- 相似段落未必有相同动作；对照中的 different 是重要反例，不允许声称已学到音乐到动作的唯一映射。
- 音乐发生变化时允许换积木，同时用四轨覆盖和连续负荷约束避免一直重复同一部位。
- 镜像由积木自身的左右训练量决定：不对称积木成对交替，对称积木不无故翻转。乐句再次出现时复用这个完整配对结构，而不是打乱内部动作。
- 用参考片段的相对能量分位辅助匹配，跨曲目不比较绝对响度。
- 下一轮用用户对生成谱的逐段反馈修订规则，不把自动草稿宣称为专业训练处方。
