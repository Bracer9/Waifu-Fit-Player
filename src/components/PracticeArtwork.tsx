import { ArrowLeft, Heart } from 'lucide-react';

export function PracticeBackdrop() {
  return (
    <div className="practice-backdrop" aria-hidden="true">
      <img className="studio-scene" src="/art/studio-scene-v2.png" alt="" />
    </div>
  );
}

export function PracticeForeground() {
  return (
    <div className="practice-foreground" aria-hidden="true">
      <div className="mat-lettering mat-lettering-pink">
        Sweat
        <br />
        <span>Beats</span>
        <br />
        <span>Smiles ♡</span>
      </div>
      <div className="mat-lettering mat-lettering-dark">
        BETTER
        <br />
        STRONGER
        <br />
        CUTER ♡
      </div>
      <svg className="studio-bottle" viewBox="0 0 96 220">
        <defs>
          <linearGradient id="bottle-body" x1="0" x2="1">
            <stop stopColor="#087d8d" />
            <stop offset=".09" stopColor="#1ac3d3" />
            <stop offset=".28" stopColor="#67e0e4" />
            <stop offset=".43" stopColor="#2ac6d3" />
            <stop offset=".82" stopColor="#22b4c5" />
            <stop offset="1" stopColor="#0a8396" />
          </linearGradient>
          <linearGradient id="bottle-cap" x1="0" x2="1">
            <stop stopColor="#10151a" />
            <stop offset=".25" stopColor="#55555a" />
            <stop offset=".55" stopColor="#292d32" />
            <stop offset="1" stopColor="#121a20" />
          </linearGradient>
          <linearGradient id="bottle-glint" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#e4ffff" stopOpacity=".9" />
            <stop offset="1" stopColor="#b4ffff" stopOpacity=".16" />
          </linearGradient>
          <radialGradient id="bottle-shadow">
            <stop stopColor="#16252d" stopOpacity=".5" />
            <stop offset="1" stopColor="#16252d" stopOpacity="0" />
          </radialGradient>
          <pattern id="bottle-grip" width="4" height="24" patternUnits="userSpaceOnUse">
            <path d="M1 0V24" stroke="#ffffff" strokeOpacity=".14" />
            <path d="M3 0V24" stroke="#000000" strokeOpacity=".28" />
          </pattern>
        </defs>
        <ellipse cx="48" cy="207" rx="48" ry="12" fill="url(#bottle-shadow)" />
        <path
          d="M26 49Q16 58 16 70V194Q16 207 46 207Q76 207 76 194V70Q76 58 66 49Z"
          fill="url(#bottle-body)"
          stroke="#158b9a"
          strokeWidth="1.5"
        />
        <path d="M25 72Q27 66 34 65V196Q28 195 25 192Z" fill="url(#bottle-glint)" />
        <path
          d="M68 72V192Q68 198 60 200"
          fill="none"
          stroke="#caffff"
          strokeOpacity=".55"
          strokeWidth="2"
        />
        <path
          d="M25 59Q45 67 67 59"
          fill="none"
          stroke="#caffff"
          strokeOpacity=".8"
          strokeWidth="3"
        />
        <path d="M24 199Q46 207 68 199" fill="none" stroke="#baffff" strokeOpacity=".35" />
        <path
          d="M55 26L70 15Q76 12 77 19V31Q77 36 69 39"
          fill="none"
          stroke="#181b21"
          strokeWidth="6"
        />
        <path d="M56 25L70 16Q74 15 75 19" fill="none" stroke="#717378" strokeWidth="1.5" />
        <rect x="23" y="32" width="47" height="23" rx="5" fill="url(#bottle-cap)" />
        <rect x="24" y="34" width="45" height="19" rx="3" fill="url(#bottle-grip)" />
        <ellipse cx="46.5" cy="32" rx="23.5" ry="5" fill="#42444b" stroke="#1b1d24" />
        <path d="M33 31V16Q45 11 55 16V31" fill="url(#bottle-cap)" />
        <ellipse cx="44" cy="15" rx="14" ry="4" fill="#272a31" stroke="#68666b" />
        <text
          x="47"
          y="139"
          textAnchor="middle"
          fill="#12313a"
          fontFamily="'Barlow Condensed', sans-serif"
          fontSize="48"
          fontWeight="900"
          transform="skewY(-8)"
        >
          01
        </text>
        <path
          d="M32 157L47 149L61 153M32 168L47 160L61 164"
          fill="none"
          stroke="#12313a"
          strokeWidth="5"
        />
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
