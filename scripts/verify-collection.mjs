import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const works = JSON.parse(await readFile(new URL('../src/works.json', import.meta.url), 'utf8'));
const provenance = JSON.parse(await readFile(new URL('../public/art/art-sources.json', import.meta.url), 'utf8'));
const ids = new Set();
for (const work of works) {
  assert(!ids.has(work.id), `Duplicate artwork ID: ${work.id}`);
  ids.add(work.id);
  assert(work.title && work.titleType, `Published title and type required: ${work.id}`);
  assert(work.illustrator === 'Yusuke Nakamura', `Illustrator missing: ${work.id}`);
  assert(work.credit.includes('Yusuke Nakamura'), `Visible illustrator credit missing: ${work.id}`);
  assert(Math.max(work.width, work.height) >= 1400, `Below active image-quality floor: ${work.id}`);
  assert(/^https:\/\//.test(work.artistUrl) && /^https:\/\//.test(work.sourceUrl), `Invalid source link: ${work.id}`);
  const record = provenance.works.find(entry => entry.id === work.id);
  assert(record, `Missing provenance: ${work.id}`);
  assert(record.credit === work.credit, `Visible and provenance credits differ: ${work.id}`);
  if (work.coverDesigner) {
    assert(work.credit.includes(work.coverDesigner), `Known cover designer missing from visible credit: ${work.id}`);
    assert(work.designCreditSource, `Missing designer source: ${work.id}`);
  }
  await access(new URL(`../public/art/${work.file}`, import.meta.url));
  await access(new URL(`../public/art/thumbs/${work.file}`, import.meta.url));
}
const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
assert(license.includes('MIT License') && license.includes('It does not cover the illustrations'), 'Artwork must be excluded from the code license');
console.log(`Collection checks passed for ${works.length} works: IDs, titles, credits, role consistency, provenance, quality floor, assets, and code-license boundary.`);
