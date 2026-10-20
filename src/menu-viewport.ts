export const MENU_DESIGN = { width: 1920, height: 1080 } as const;

export type MenuViewport = {
  width: number;
  height: number;
  scale: number;
  x: number;
  y: number;
  scaled: boolean;
};

/** Keep existing large-window layouts; fit the desktop composition into smaller windows. */
export function fitMenuViewport(width: number, height: number, enabled = true): MenuViewport {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const scale = enabled ? Math.min(1, width / MENU_DESIGN.width, height / MENU_DESIGN.height) : 1;
  const scaled = scale < 1;
  return {
    width: scaled ? MENU_DESIGN.width : width,
    height: scaled ? MENU_DESIGN.height : height,
    scale,
    x: scaled ? (width - MENU_DESIGN.width * scale) / 2 : 0,
    y: scaled ? (height - MENU_DESIGN.height * scale) / 2 : 0,
    scaled,
  };
}

let enabled = true;

export function menuViewport() {
  return fitMenuViewport(innerWidth, innerHeight, enabled);
}

/** Apply before first paint and on resize only; music/gameplay never drives this work. */
export function syncMenuViewport(active: boolean) {
  enabled = active;
  const viewport = menuViewport();
  const root = document.getElementById('root')!;
  if (viewport.scaled) {
    document.documentElement.dataset.menuFit = '';
    root.style.setProperty('--menu-vw', `${MENU_DESIGN.width / 100}px`);
    root.style.setProperty('--menu-vh', `${MENU_DESIGN.height / 100}px`);
    root.style.setProperty('--menu-scale', String(viewport.scale));
    root.style.setProperty('--menu-offset-x', `${viewport.x}px`);
    root.style.setProperty('--menu-offset-y', `${viewport.y}px`);
  } else {
    delete document.documentElement.dataset.menuFit;
    for (const property of [
      '--menu-vw',
      '--menu-vh',
      '--menu-scale',
      '--menu-offset-x',
      '--menu-offset-y',
    ])
      root.style.removeProperty(property);
  }
}

export function pointInMenu(point: { x: number; y: number }, viewport = menuViewport()) {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}

/** DOM rectangles are physical viewport coordinates; animation geometry is in design pixels. */
export function menuRect(node: Element) {
  const rect = node.getBoundingClientRect();
  const viewport = menuViewport();
  const point = pointInMenu(rect, viewport);
  return new DOMRect(point.x, point.y, rect.width / viewport.scale, rect.height / viewport.scale);
}

/** Keep overlays in one containing block across mode changes and window resizing. */
export function menuPortalRoot() {
  return document.getElementById('root')!;
}
