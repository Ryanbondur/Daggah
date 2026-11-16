import { FOOT_PAD } from './footPad';

/**
 * The one shared ground line for every Phaser stage actor: camp props, the hero,
 * Clan Raid / 4v4 fighters, and every mob / elite / boss. Fraction of the stage
 * height (0 = top, 1 = bottom), so it holds across screen sizes. Sprites are
 * anchored by their feet, so this is where their soles touch.
 */
export const GROUND_LINE = 0.933;

/** Pixel Y of the shared ground line for a stage of height `H`. */
export function groundLineY(H: number): number {
  return GROUND_LINE * H;
}

/** Texture keys whose file name differs from the loaded key. */
const TEXTURE_STEM: Readonly<Record<string, string>> = {
  camp: 'camp-tent-fire',
  'hero-sleep': 'hero-sleeping',
};

/** Fraction of the texture height below the sprite's feet (0 when unknown). */
export function footPad(textureKey: string): number {
  return FOOT_PAD[TEXTURE_STEM[textureKey] ?? textureKey] ?? 0;
}

/**
 * Phaser origin Y that puts the sprite's feet (not its transparent bottom edge)
 * on the sprite's `y`. Pair with `setPosition(x, groundLineY(H))`.
 */
export function footOriginY(textureKey: string): number {
  return 1 - footPad(textureKey);
}

/** Screen Y of the top edge of a foot-anchored sprite of display height `h`. */
export function spriteTopY(feetY: number, h: number, textureKey: string): number {
  return feetY - h * footOriginY(textureKey);
}
