import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';

// Ship only the reviewed collection. Research alternatives remain local.
export default defineConfig({
  plugins: [{
    name: 'reviewed-gallery-assets',
    apply: 'build',
    config() { return { publicDir: false }; },
    async generateBundle() {
      const works = JSON.parse(await readFile(new URL('./src/works.json', import.meta.url), 'utf8'));
      const assets = ['favicon.svg', 'art/art-sources.json', ...works.flatMap(work => [`art/${work.file}`, `art/thumbs/${work.file}`])];
      for (const fileName of assets) {
        const source = await readFile(new URL(`./public/${fileName}`, import.meta.url));
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  }],
});
