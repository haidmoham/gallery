import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const works = JSON.parse(await readFile(path.join(root, 'src/works.json'), 'utf8'));
const destination = path.join(root, 'public/art/thumbs');
await mkdir(destination, { recursive: true });
for (const work of works) {
  const source = path.join(root, 'public/art', work.file);
  const metadata = await sharp(source).metadata();
  if (metadata.width !== work.width || metadata.height !== work.height) {
    throw new Error(`Source dimensions disagree for ${work.id}: ${metadata.width}×${metadata.height}`);
  }
  await sharp(source).resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(destination, work.file));
}
console.log(`Verified ${works.length} source dimensions and generated ${works.length} navigation thumbnails.`);
