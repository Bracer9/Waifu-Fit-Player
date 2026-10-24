# 音乐与 Fitness 编排的关系

4首音轨只读解码，按人工 BPM／锚点对齐 8 小节窗口，比较起音节奏及音量变化的归一化指纹，同时比较同区间人工动作序列的完全重复与左右镜像。它不识别旋律或歌词，不能据此直接宣布主歌／副歌。本页仅是重新学习的一项包络对照，不代替曲式／频谱／持续负荷的复合分析，也未接入正式生成器。

{
  "pairs": 336,
  "repeatedOrMirroredMovement": 7,
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

完整片段能量、所有配对证据见 [分析数据](music-study-v3.json)。积木的音乐能量分位特征保存在 bricks-study.json 的 musicProfile。

## 对照结论

- 相似音乐不等于必须相同动作，重复和镜像的反例必须保留；0.88是旧启发式阈值，不是已校准的通用准确率。
- 不能用四轨占比、八小节切窗或包络相关度代替结构与负荷规划。
- 本表的different只指序列非完全一致，不代表人工编排质量差；相似度不能直接判断主副歌。
