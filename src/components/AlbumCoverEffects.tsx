import type { AlbumCoverDetail } from '../album-cover-detail';
import vinylDisc from '../assets/album-effects/vocaloid-disc.png';
import vinylForeground from '../assets/album-effects/vocaloid-foreground-mask.png';
import allDisc from '../assets/album-effects/all-disc.png';
import ribbonPlate from '../assets/album-effects/touhou-clean.png';
import ribbon from '../assets/album-effects/touhou-ribbon.png';

const prepared = new Map<AlbumCoverDetail, Promise<void>>();
export function prepareAlbumEffect(kind: AlbumCoverDetail) {
  let task = prepared.get(kind);
  if (!task) {
    const sources =
      kind === 'vinyl'
        ? [vinylDisc, vinylForeground]
        : kind === 'all-record'
          ? [allDisc]
          : kind.startsWith('moon-')
            ? [ribbonPlate, ribbon]
            : [];
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
  kind === 'vinyl' || kind === 'all-record' || kind.startsWith('moon-');
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

function MoonScene({ src, id, mirrored }: { src?: string; id: string; mirrored: boolean }) {
  return (
    <g transform={mirrored ? 'translate(2345 0) scale(-1 1)' : undefined}>
      <defs>
        <clipPath id={`${id}-night`}>
          <rect x="0" y="88" width="2345" height="505" />
        </clipPath>
        <mask
          id={`${id}-tail-zone`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="2345"
          height="670"
        >
          <path
            d="M0 146C200 212 365 250 505 243M505 263C514 403 375 545 224 596"
            fill="none"
            stroke="white"
            strokeWidth="90"
          />
        </mask>
        <filter
          id={`${id}-pink-alpha`}
          x="-3%"
          y="-3%"
          width="106%"
          height="106%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 4 -4 0 0 -.7" />
          <feMorphology operator="dilate" radius="4" />
        </filter>
        <mask
          id={`${id}-old-tail`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="2345"
          height="670"
          style={{ maskType: 'alpha' }}
        >
          <g mask={`url(#${id}-tail-zone)`}>
            <image
              href={src}
              transform={mirrored ? 'translate(2345 0) scale(-1 1)' : undefined}
              width="2345"
              height="670"
              filter={`url(#${id}-pink-alpha)`}
            />
          </g>
        </mask>
        <clipPath id={`${id}-tail-top`}>
          <rect width="1897" height="274" />
        </clipPath>
        <clipPath id={`${id}-tail-bottom`}>
          <rect y="270" width="1897" height="559" />
        </clipPath>
        <clipPath id={`${id}-knot`}>
          <ellipse cx="505" cy="245" rx="119" ry="62" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-night)`}>
        <image
          href={ribbonPlate}
          x="0"
          y="-53"
          width="2345"
          height="782"
          preserveAspectRatio="none"
          mask={`url(#${id}-old-tail)`}
        />
        <g className="album-ribbon-sway">
          <g transform="translate(0 73) scale(.7426 .63)">
            <image href={ribbon} width="1897" height="829" clipPath={`url(#${id}-tail-top)`} />
          </g>
          <g transform="translate(126.5 47.6) scale(.5566 .7237)">
            <image href={ribbon} width="1897" height="829" clipPath={`url(#${id}-tail-bottom)`} />
          </g>
        </g>
        <g clipPath={`url(#${id}-knot)`}>
          <image
            href={src}
            transform={mirrored ? 'translate(2345 0) scale(-1 1)' : undefined}
            width="2345"
            height="670"
          />
        </g>
        <g className="album-ambient">
          <ellipse className="album-moon-halo" cx="1780" cy="278" rx="251" ry="232" />
          <ellipse className="album-moon-water" cx="1780" cy="509" rx="174" ry="13" />
        </g>
      </g>
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
  if (kind === 'moon-left' || kind === 'moon-right')
    return <MoonScene src={src} id={id} mirrored={kind === 'moon-left'} />;
  if (kind === 'idol-stage') return <IdolStage id={id} />;
  return (
    <g
      transform={kind === 'sunset-window' ? 'translate(1347 405)' : 'translate(1740 406) scale(.7)'}
    >
      <ellipse className="album-sunset-aura" rx="205" ry="100" />
      <ellipse className="album-sunset-glow" rx="106" ry="70" />
      <ellipse className="album-sunset-ray" cy="18" rx="220" ry="7" />
      <ellipse className="album-sunset-water" cy="65" rx="87" ry="17" />
    </g>
  );
}
