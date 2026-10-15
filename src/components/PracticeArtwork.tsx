import { ArrowLeft, Heart } from 'lucide-react';

export function PracticeBackdrop() {
  return (
    <div className="practice-backdrop" aria-hidden="true">
      <div className="studio-wall" />
      <div className="studio-floor" />
      <div className="studio-mat pink-mat" />
      <div className="studio-mat dark-mat" />
      <svg className="studio-bottle" viewBox="0 0 64 160">
        <ellipse cx="33" cy="153" rx="30" ry="6" fill="#261d2530" />
        <path
          d="M18 32Q8 39 9 53V140Q9 151 31 152Q54 152 54 140V53Q54 40 44 32Z"
          fill="#20bfd1"
          stroke="#148e9f"
          strokeWidth="2"
        />
        <path d="M17 52V137Q17 141 21 143V48Z" fill="#b4f8f0" opacity=".65" />
        <rect x="15" y="23" width="33" height="15" rx="3" fill="#23252c" />
        <rect x="18" y="16" width="28" height="9" rx="2" fill="#45474e" />
        <path d="M25 17V8H43V13H34V17" fill="#23252c" />
        <text
          x="30"
          y="107"
          textAnchor="middle"
          fill="#172b32"
          fontFamily="'Barlow Condensed', sans-serif"
          fontSize="36"
          fontWeight="900"
        >
          01
        </text>
        <path d="M23 117L40 110M23 124L40 117" stroke="#172b32" strokeWidth="4" />
      </svg>
    </div>
  );
}

export function PracticeCover({ title }: { title: string }) {
  return (
    <>
      <div className="practice-cover" aria-hidden="true">
        <div className="cover-wordmark">
          <span>WAIFU</span>
          <span>
            <b>FIT</b> PLAYER
          </span>
        </div>
        <span className="cover-edition">
          RHYTHM
          <br />
          MOVES
          <br />A BRIGHTER
          <br />
          YOU <i />
        </span>
      </div>
      <div className="practice-track-info">
        <span className="record-mark" aria-hidden="true">
          <i />
        </span>
        <h1 title={title}>{title}</h1>
        <span className="track-status">NOW PLAYING</span>
      </div>
    </>
  );
}

export function PracticeMasthead({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="practice-masthead">
      <div className="move-lettering" aria-hidden="true">
        Let's
        <br />
        <span>Move!</span>
        <Heart />
      </div>
      <button className="return-workspace" onClick={onReturn}>
        <ArrowLeft size={15} /> WORKBENCH
      </button>
    </div>
  );
}
