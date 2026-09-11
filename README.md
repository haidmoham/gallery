# nakamura gallery

A non-commercial fan gallery of illustrations by **Yusuke Nakamura**. Built out of admiration for his work. This is an independent fan project, not an official exhibition or an artist-endorsed site. No artwork is offered for sale.

**[Visit the gallery](https://wintery.shin86.dev)** · **[Support Nakamura through his official shop](https://yusuke-nakamura.stores.jp/)** · **[Official exhibition](https://www.yn-ex.com/)**

## Copy the gallery code

You are welcome to copy, fork, adapt, and reuse the original gallery code under the [MIT License](LICENSE), including in commercial software. The non-commercial description applies to this fan gallery, not an extra restriction on the MIT-licensed code.

**The artwork is not MIT-licensed.** The license excludes all third-party illustrations, covers, images, trademarks, and derived thumbnails in `public/art/`. It grants no right to reuse those materials. Use your own art or obtain the required permissions for any fork. Dependencies keep their own licenses.

## Credits and image fidelity

Illustration credit belongs to **Yusuke Nakamura**. Cover designers, authors, publishers, labels, and source notices are recorded separately where the sources establish them. The gallery does not replace publisher or label notices with a blanket artist copyright claim.

Each displayed work has a published title, an illustrator link, and a source link. The information panel includes work-specific credits and known design credits. See [the collection metadata](src/works.json) and [the source records](public/art/art-sources.json) for evidence and attribution limits.

Images are published digital reproductions, **not verified archival scans**. The active selection uses sources at least 1400 pixels on their longest edge. No AI replacement artwork or locally upscaled image files are used. Published cover typography can differ from exhibition prints. Titles normally identify the album, single, book, or commission; dates identify the publication or release rather than an independently established creation date.

Rights remain with the respective holders. Reproduction permission has not been established. Attribution, public availability, and non-commercial intent do not establish that permission. This project is not affiliated with Yusuke Nakamura, the publishers, labels, exhibitions, or Smithsonian.

## Run

Requires Node.js and npm.

```sh
npm install
npm run dev -- --port 5173
```

```sh
npm run build
npm run preview
```

Vite serves the interface. Three.js renders the physical frames and gallery wall. The production build includes only artwork in the reviewed active collection, its thumbnails, and source metadata. Research alternatives are not deployed.

## Navigate

- Drag with a mouse or finger to move along the wall. Release to settle at a work.
- Use the wheel or trackpad, arrow buttons, thumbnails, or the overview grid.
- Use Left/Right and Home/End on a keyboard.
- Tap the selected art or use the view toggle for a closer presentation.
- Pinch or use the magnifiers to zoom. Use +, -, and 0 for zoom and reset.
- Pause motion, or use the eye control to remove optical effects.

The system's reduced-motion preference starts animation paused. An explicit play/pause choice is retained for the browser session. Rendering stops in hidden tabs. If WebGL is unavailable, the framed HTML gallery remains available.

For phones, thumbnails load first. At most three nearby full textures are retained, with a lower GPU texture limit on small screens. Original source files remain unchanged.

## Collection maintenance

Add a source-backed record to `src/works.json`, preserve the corresponding evidence in `public/art/art-sources.json`, and place the authentic source file in `public/art/`. Run `npm run thumbnails` to validate its recorded dimensions and generate navigation images. Review attribution before publication. Do not infer that a source or a fan disclaimer licenses reproduction.
