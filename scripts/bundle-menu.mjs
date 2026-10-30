import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const compiled = await build({ entryPoints: ['services/sheet.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { fetchCocktailsFromSheet } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const cocktails = await fetchCocktailsFromSheet();
if (cocktails.length < 20) throw new Error('Menu download was incomplete; keeping the previous offline menu.');
await fs.mkdir('public/images/cocktails', { recursive: true });
await fs.mkdir('data', { recursive: true });
for (const cocktail of cocktails) {
  const destination = `images/cocktails/${cocktail.id}.webp`;
  if (!cocktail.imageUrl.startsWith('https://')) throw new Error(`Missing remote photo: ${cocktail.name}`);
  const response = await fetch(cocktail.imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Photo download failed: ${cocktail.name} (${response.status})`);
  await sharp(Buffer.from(await response.arrayBuffer())).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join('public', destination));
  cocktail.imageUrl = `/${destination}`;
}
await fs.writeFile('data/menu.json', JSON.stringify(cocktails, null, 2) + '\n');
console.log(`Bundled ${cocktails.length} cocktails with local photos.`);
