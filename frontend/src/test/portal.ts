import { expect } from 'vitest';

/**
 * A modal fixed-positioned inside a page wrapper with a CSS transform
 * (e.g. .animate-fade-in / .animate-slide-in) breaks its own `position: fixed`,
 * because the transformed ancestor becomes the containing block. Modals must
 * render via createPortal(..., document.body) instead of nesting inside the
 * page's render tree.
 */
export function expectPortaledToBody(node: HTMLElement, pageContainer: HTMLElement) {
  expect(document.body.contains(node)).toBe(true);
  expect(pageContainer.contains(node)).toBe(false);
}
