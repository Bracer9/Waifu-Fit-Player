import type { AlbumCoverDetail } from '../album-cover-detail';
import vinylDisc from '../assets/album-effects/vocaloid-disc.png';
import vinylForeground from '../assets/album-effects/vocaloid-foreground-mask.png';
import allDisc from '../assets/album-effects/all-disc.png';

const prepared = new Map<AlbumCoverDetail, Promise<void>>();
export function prepareAlbumEffect(kind: AlbumCoverDetail) {
  let task = prepared.get(kind);
  if (!task) {
    const sources =
      kind === 'vinyl' ? [vinylDisc, vinylForeground] : kind === 'all-record' ? [allDisc] : [];
    task = Promise.all(
      sources.map(async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
      }),
    )
      .then(() => {})
      .catch((error: unknown) => {
        prepared.delete(kind);
        throw error;
      });
    prepared.set(kind, task);
  }
  return task;
}

export const persistentAlbumEffect = (kind: AlbumCoverDetail) =>
  kind === 'vinyl' || kind === 'all-record';
export const albumEffectViewBox = (kind: AlbumCoverDetail) =>
  kind === 'vinyl'
    ? '0 0 2200 715'
    : kind === 'sunset-window'
      ? '0 0 2048 578'
      : kind === 'sunset'
        ? '0 0 2048 585'
        : '0 0 2345 670';

function RecordFace({
  src,
  id,
  collection = false,
}: {
  src?: string;
  id: string;
  collection?: boolean;
}) {
  const cx = collection ? 1500 : 1100,
    cy = collection ? 428 : 178;
  const ry = collection ? 440 : 330;
  return (
    <>
      <defs>
        <clipPath id={`${id}-disc`}>
          <ellipse cx={cx} cy={cy} rx="440" ry={ry} />
        </clipPath>
        {collection ? (
          <mask
            id={`${id}-foreground`}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="2345"
            height="670"
          >
            {/* Exact original ribbon centreline: keep its pixels above the rotating record. */}
            <path
              d="M1000 470C1110 437 1200 447 1300 478S1670 582 1890 640"
              fill="none"
              stroke="white"
              strokeWidth="18"
            />
          </mask>
        ) : (
          <mask
            id={`${id}-foreground`}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="2200"
            height="715"
            style={{ maskType: 'alpha' }}
          >
            <image href={vinylForeground} width="2200" height="715" preserveAspectRatio="none" />
          </mask>
        )}
      </defs>
      <g clipPath={`url(#${id}-disc)`}>
        <ellipse cx={cx} cy={cy} rx="440" ry={ry} fill="#232730" />
        <g transform={`translate(${cx} ${cy}) scale(1 ${ry / 440}) translate(${-cx} ${-cy})`}>
          <g className="album-vinyl-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <image
              className="album-vinyl-disc"
              href={collection ? allDisc : vinylDisc}
              x={cx - 440}
              y={cy - 440}
              width="880"
              height="880"
            />
          </g>
        </g>
        <image
          className="album-vinyl-foreground"
          href={src}
          width={collection ? 2345 : 2200}
          height={collection ? 670 : 715}
          mask={`url(#${id}-foreground)`}
        />
      </g>
    </>
  );
}

const waveHeights = [5, 7, 10, 17, 28, 44, 78, 132, 102, 182, 210, 155, 82, 66, 40, 15, 8, 5];
function CollectionWaveform() {
  return (
    <g className="album-all-waveform">
      <path d="M1954 298H2345V491L1954 520Z" fill="#222329" />
      {waveHeights.map((height, index) => (
        <rect
          className="album-wave-bar"
          key={index}
          x={1958 + index * 22}
          y={410 - height / 2}
          width="11"
          height={height}
          rx="5.5"
        />
      ))}
    </g>
  );
}

function IdolStage({ id }: { id: string }) {
  return (
    <>
      <defs>
        <clipPath id={`${id}-stage`}>
          <rect width="2345" height="620" />
        </clipPath>
      </defs>
      <g className="album-ambient" clipPath={`url(#${id}-stage)`}>
        <g className="album-stage-light pink">
          <path d="M2180 105L2198 105 2060 557 1985 551Z" />
          <path d="M1960 236L2345 151V445L1890 563Z" />
          <circle cx="2190" cy="108" r="27" />
        </g>
        <g className="album-stage-light cyan">
          <path d="M2036 149L2056 156 1833 385 1762 384Z" />
          <path d="M1878 197L1896 206 1760 350 1728 327Z" />
          <circle cx="2045" cy="157" r="25" />
        </g>
        <g className="album-glowsticks pink" fill="none" strokeLinecap="round">
          <path d="M245 408 152 610M411 477 470 620M896 567 931 620M1935 585 1958 549M2301 587 2284 620" />
        </g>
        <g className="album-glowsticks cyan" fill="none" strokeLinecap="round">
          <path d="M86 384 0 532M599 463 680 613M1170 585 1194 620M2098 492 2061 620" />
        </g>
        <g transform="translate(1598 245)">
          <g className="album-earring-glint">
            <circle className="album-earring-halo" r="18" />
            <path d="M0-28C2-6 5-3 18 0C5 3 2 6 0 28C-2 6-5 3-18 0C-5-3-2-6 0-28Z" />
          </g>
        </g>
      </g>
    </>
  );
}

/** Additive veiling glare and soft lens ghosts, all tied to the photographed sun. */
function SunsetLens({ id, window }: { id: string; window: boolean }) {
  const x = window ? 1347 : 1740;
  const y = window ? 405 : 406;
  const angle = window ? 20 : 9;
  return (
    <>
      <defs>
        <radialGradient id={`${id}-sunlight`}>
          <stop offset="0" stopColor="#fff5d2" stopOpacity=".8" />
          <stop offset=".25" stopColor="#ffdb9c" stopOpacity=".42" />
          <stop offset=".6" stopColor="#ffb878" stopOpacity=".16" />
          <stop offset="1" stopColor="#ffb878" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-lens-veil`}>
          <stop offset="0" stopColor="#ffe8ba" stopOpacity=".48" />
          <stop offset=".36" stopColor="#ffc598" stopOpacity=".25" />
          <stop offset=".7" stopColor="#ffb685" stopOpacity=".09" />
          <stop offset="1" stopColor="#ffb685" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-lens-corona`}>
          <stop offset="0" stopColor="#ffbc83" stopOpacity="0" />
          <stop offset=".56" stopColor="#ffbc83" stopOpacity="0" />
          <stop offset=".67" stopColor="#ff936e" stopOpacity=".04" />
          <stop offset=".75" stopColor="#ffc28c" stopOpacity=".28" />
          <stop offset=".82" stopColor="#fff2c7" stopOpacity=".1" />
          <stop offset=".94" stopColor="#fff2c7" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-lens-ghost`}>
          <stop offset="0" stopColor="#cce9b7" stopOpacity=".13" />
          <stop offset=".48" stopColor="#f4e1a2" stopOpacity=".18" />
          <stop offset=".74" stopColor="#ffcba3" stopOpacity=".26" />
          <stop offset=".9" stopColor="#ffd9ac" stopOpacity=".08" />
          <stop offset="1" stopColor="#ffd9ac" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="album-sun-lens" transform={`translate(${x} ${y})`}>
        <g className="album-lens-source">
          <ellipse cx="170" cy="-95" rx="700" ry="440" fill={`url(#${id}-lens-veil)`} />
          <ellipse rx="255" ry="165" fill={`url(#${id}-sunlight)`} />
          <ellipse rx="870" ry="9" fill={`url(#${id}-sunlight)`} />
        </g>
        <g className="album-lens-ghost near">
          <ellipse cx="45" cy="-20" rx="665" ry="475" fill={`url(#${id}-lens-corona)`} />
          <g transform={`rotate(${angle})`}>
            <circle cx="-190" r="17" fill={`url(#${id}-sunlight)`} />
            <ellipse cx="-350" rx="65" ry="48" fill={`url(#${id}-lens-ghost)`} />
            <circle cx="-505" r="23" fill={`url(#${id}-sunlight)`} />
          </g>
        </g>
        <g transform={`rotate(${angle})`}>
          <g className="album-lens-ghost far">
            <ellipse cx="-720" rx="115" ry="93" fill={`url(#${id}-lens-ghost)`} />
            <circle cx="-1050" r="175" fill={`url(#${id}-lens-ghost)`} />
          </g>
        </g>
      </g>
    </>
  );
}

export function AlbumCoverEffects({
  kind,
  src,
  id,
}: {
  kind: AlbumCoverDetail;
  src?: string;
  id: string;
}) {
  if (kind === 'vinyl') return <RecordFace src={src} id={id} />;
  if (kind === 'all-record')
    return (
      <>
        <RecordFace src={src} id={id} collection />
        <CollectionWaveform />
      </>
    );
  if (kind === 'idol-stage') return <IdolStage id={id} />;
  return <SunsetLens id={id} window={kind === 'sunset-window'} />;
}
