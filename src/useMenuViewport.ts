import { useLayoutEffect } from 'react';
import { syncMenuViewport } from './menu-viewport';

export function useMenuViewport(enabled: boolean) {
  useLayoutEffect(() => {
    const update = () => syncMenuViewport(enabled);
    update();
    // Run before the existing transition/slot resize handlers read their geometry.
    window.addEventListener('resize', update, true);
    return () => window.removeEventListener('resize', update, true);
  }, [enabled]);
}
