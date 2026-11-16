import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_CLASSES } from '../data/types';
import { heroSprite } from './assets';
import { HERO_SPRITE_SIZE, PORTRAIT_FRAMING, portraitImgBox, portraitImgStyle } from './portrait';

function webpSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  expect(b.toString('ascii', 12, 16)).toBe('VP8X');
  return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
}

describe('class portrait framing', () => {
  it('has framing and sprite size for every class', () => {
    for (const c of HERO_CLASSES) {
      expect(PORTRAIT_FRAMING[c]).toBeDefined();
      expect(HERO_SPRITE_SIZE[c]).toBeDefined();
    }
  });

  it('sprite size table matches the shipped hero art', () => {
    for (const c of HERO_CLASSES) {
      const rel = heroSprite(c).replace(/^\//, 'public/');
      expect(webpSize(resolve(__dirname, '../..', rel))).toEqual(HERO_SPRITE_SIZE[c]);
    }
  });

  it('places the head anchor exactly at the avatar centre and keeps the avatar filled', () => {
    for (const c of HERO_CLASSES) {
      const { cx, cy, span } = PORTRAIT_FRAMING[c];
      const { width, left, top } = portraitImgBox(c);
      const aspect = HERO_SPRITE_SIZE[c].w / HERO_SPRITE_SIZE[c].h;
      expect(left + cx * width).toBeCloseTo(50, 6);
      expect(top + (cy / aspect) * width).toBeCloseTo(50, 6);
      expect(width * span).toBeCloseTo(100, 6);
      // Circle (radius 50) must stay inside the sprite: no empty background in the avatar.
      const imgH = width / aspect;
      expect(left).toBeLessThanOrEqual(0.001);
      expect(top).toBeLessThanOrEqual(0.001);
      expect(left + width).toBeGreaterThanOrEqual(99.999);
      expect(top + imgH).toBeGreaterThanOrEqual(99.999);
    }
  });

  it('emits an inline style per class', () => {
    expect(portraitImgStyle('Mage')).toMatch(/^width:[\d.]+%;left:-?[\d.]+%;top:-?[\d.]+%$/);
    expect(portraitImgStyle('Mage')).not.toBe(portraitImgStyle('Warrior'));
  });
});
