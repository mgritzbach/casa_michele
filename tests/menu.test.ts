import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import menu from '../data/menu.json';

describe('first-run offline menu', () => {
  it('ships unique cocktail IDs, recipes and decodable WebP files instead of remote URLs', () => {
    expect(menu.length).toBeGreaterThanOrEqual(41);
    expect(new Set(menu.map(item => item.id)).size).toBe(menu.length);
    for (const item of menu) {
      expect(item.ingredients.length, item.name).toBeGreaterThan(0);
      expect(item.instructions.trim().length, item.name).toBeGreaterThan(5);
      expect(item.imageUrl, item.name).toMatch(/^\/images\/cocktails\/[a-z0-9-]+\.webp$/);
      const photo = readFileSync(resolve('public', item.imageUrl.slice(1)));
      expect(photo.subarray(0, 4).toString(), item.name).toBe('RIFF');
      expect(photo.subarray(8, 12).toString(), item.name).toBe('WEBP');
      expect(photo.length).toBeGreaterThan(1000);
    }
  });
});
