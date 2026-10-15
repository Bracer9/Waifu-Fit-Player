import { ArrowUpRight, FolderOpen, Plus, Music2, Play, ArrowRight } from 'lucide-react';
import type { Chart } from '../model';
export function Home({
  chart,
  hasMedia,
  hasDraft,
  onDemo,
  onNew,
  onOpen,
  onResume,
  onRecover,
}: {
  chart: Chart;
  hasMedia: boolean;
  hasDraft: boolean;
  onDemo: () => void;
  onNew: () => void;
  onOpen: () => void;
  onResume: () => void;
  onRecover: () => void;
}) {
  return (
    <div className="home-content">
      <section className="home-hero">
        <div className="hero-tag">
          <span /> A LITTLE MOVEMENT. A LOT OF JOY.
        </div>
        <h1>
          把喜欢的旋律，
          <br />
          变成<span>你的节奏。</span>
          <i>✳</i>
        </h1>
        <p>
          打开舞蹈视频，写下动作提示。
          <br />
          从第一拍开始，享受属于自己的跟练时间。
        </p>
        <div className="hero-actions">
          <button className="button primary" onClick={onDemo}>
            <Play size={18} fill="currentColor" />
            体验示例作品
            <ArrowUpRight size={19} />
          </button>
          <button className="button light" onClick={onNew}>
            <Plus size={19} />
            创建新谱面
          </button>
        </div>
        <div className="hero-meta">
          <span>本地视频</span>
          <b>＋</b>
          <span>五轨动作</span>
          <b>＋</b>
          <span>自由编谱</span>
        </div>
      </section>
      <section className="record-art" aria-hidden="true">
        <div className="album-back" />
        <div className="vinyl">
          <div className="vinyl-label">
            WFP<span>33⅓ / MOVE</span>
            <i />
          </div>
        </div>
        <div className="album-cover">
          <span className="album-index">VOL. 01 / YOUR PRIVATE STAGE</span>
          <strong>
            MOVE
            <br />
            <em>WITH</em>
            <br />
            MUSIC.
          </strong>
          <div className="album-arrow">↗</div>
          <div className="album-bottom">
            <span>
              FEEL THE BEAT
              <br />
              FIND YOUR FLOW
            </span>
            <span>✦</span>
          </div>
        </div>
        <div className="album-sticker">
          PLAY
          <br />
          YOUR WAY ♡
        </div>
      </section>
      <section className="workspace-cards">
        <button className="workspace-card" onClick={onOpen}>
          <FolderOpen />
          <div>
            <strong>打开已有作品</strong>
            <p>打开作品，自动载入关联视频和谱面</p>
          </div>
          <ArrowUpRight />
        </button>
        {hasMedia ? (
          <button className="workspace-card accent" onClick={onResume}>
            <Music2 />
            <div>
              <strong>继续：{chart.title}</strong>
              <p>{chart.notes.length} 个动作提示 · 当前工作区</p>
            </div>
            <ArrowRight />
          </button>
        ) : (
          <button className="workspace-card accent" onClick={hasDraft ? onRecover : onNew}>
            <Music2 />
            <div>
              <strong>{hasDraft ? '恢复上次的本地草稿' : '为下一首喜欢的歌做谱'}</strong>
              <p>{hasDraft ? '一起恢复谱面与关联视频' : '边播放边按键，也可以点击时间轴'}</p>
            </div>
            <ArrowRight />
          </button>
        )}
      </section>
      <div className="home-footer">
        <span>01 — SQUAT</span>
        <span>02 — CALF RAISE</span>
        <span>03 — PUNCH</span>
        <span>04 — SIDE CRUNCH</span>
        <b>MADE FOR YOUR HAPPY PLACE. ♡</b>
      </div>
    </div>
  );
}
