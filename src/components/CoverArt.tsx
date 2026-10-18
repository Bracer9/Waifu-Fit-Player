export function CoverArt({ src, eager = false }: { src?: string; eager?: boolean }) {
  return src ? (
    <img
      className="cover-art"
      src={src}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  ) : (
    <span className="cover-placeholder" aria-hidden="true">
      <b>
        WAIFU
        <br />
        <em>FIT</em>
        <br />
        PLAYER
      </b>
      <i>↗</i>
    </span>
  );
}
