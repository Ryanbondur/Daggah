import type { HeroClass } from '../data/types';

/** Natural pixel size of each `sprites/hero-<class>.webp` (checked against the files in tests). */
export const HERO_SPRITE_SIZE: Record<HeroClass, { w: number; h: number }> = {
  Warrior: { w: 360, h: 342 },
  Mage: { w: 317, h: 360 },
  Ranger: { w: 350, h: 360 },
  Rogue: { w: 333, h: 360 },
};

/**
 * Where the face/head sits in each full-body sprite, as fractions of the image
 * (`cx`/`cy`), and how much of the image width the circular header avatar shows
 * (`span`). Sprites differ in aspect and pose, so one shared crop cannot frame them all.
 */
export const PORTRAIT_FRAMING: Record<HeroClass, { cx: number; cy: number; span: number }> = {
  Warrior: { cx: 0.62, cy: 0.43, span: 0.62 },
  Mage: { cx: 0.58, cy: 0.38, span: 0.56 },
  Ranger: { cx: 0.43, cy: 0.28, span: 0.56 },
  Rogue: { cx: 0.48, cy: 0.28, span: 0.58 },
};

/** Width / height of the class sprite, for undistorted display sizing. */
export function heroSpriteAspect(heroClass: HeroClass): number {
  const s = HERO_SPRITE_SIZE[heroClass];
  return s.w / s.h;
}

/**
 * Percent offsets for an `<img>` absolutely positioned inside a square avatar
 * (`max-width: none`), so the class's head lands at the circle's centre.
 */
export function portraitImgBox(heroClass: HeroClass): {
  width: number;
  left: number;
  top: number;
} {
  const { cx, cy, span } = PORTRAIT_FRAMING[heroClass];
  const aspect = heroSpriteAspect(heroClass);
  const width = 100 / span;
  // `top` percentages resolve against the (square) container's height, i.e. its width.
  const left = 50 - cx * width;
  const top = 50 - (cy / aspect) * width;
  return { width, left, top };
}

export function portraitImgStyle(heroClass: HeroClass): string {
  const b = portraitImgBox(heroClass);
  return `width:${b.width.toFixed(2)}%;left:${b.left.toFixed(2)}%;top:${b.top.toFixed(2)}%`;
}
