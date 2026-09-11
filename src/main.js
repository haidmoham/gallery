import './style.css';
import works from './works.json';

const root = document.querySelector('#gallery');
const room = document.querySelector('.room');
const artwork = document.querySelector('#artwork');
const frame = document.querySelector('.frame');
const dialog = document.querySelector('#information');
const overview = document.querySelector('#overview');
const frameCredits = document.querySelector('#frame-credits');
const collection = document.querySelector('#collection');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const initialRoute = location.hash.slice(1).split('/');
let selected = Math.max(0, works.findIndex(work => work.id === initialRoute[0]));
let paused = reducedMotion.matches;
try {
  const savedMotion = sessionStorage.getItem('art-motion');
  if (savedMotion) paused = savedMotion !== 'play';
} catch { /* System preference remains the default when storage is unavailable. */ }
let original = false;
let immersive = initialRoute[1] === 'immersive';
let spatial = null;
let spatialReady = false;
let selectionRequest = 0;
let lastSwipe = 0;
const cache = new Map();
const imageURL = work => `/art/${work.file}`;
const thumbnailURL = work => `/art/thumbs/${work.file}`;

function load(work) {
  if (cache.has(work.id)) {
    const cached = cache.get(work.id);
    cache.delete(work.id);
    cache.set(work.id, cached);
    return cached;
  }
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { cache.delete(work.id); reject(new Error('Artwork could not load')); };
    image.src = imageURL(work);
  });
  cache.set(work.id, promise);
  while (cache.size > 3) cache.delete(cache.keys().next().value);
  return promise;
}

function updateMotion() {
  root.classList.toggle('paused', paused);
  root.classList.toggle('motion-active', !paused && !original);
  root.classList.toggle('original', original);
  spatial?.setMotion(!paused && !original);
  spatial?.setOriginal(original);
  const button = document.querySelector('[data-action="motion"]');
  button.setAttribute('aria-label', paused ? 'Resume motion' : 'Pause motion');
  button.setAttribute('aria-pressed', String(paused));
  document.querySelector('[data-action="original"]').setAttribute('aria-pressed', String(original));
}

function updateRoute() {
  history.replaceState(null, '', `#${works[selected].id}${immersive ? '/immersive' : ''}`);
  frame.setAttribute('aria-label', `${immersive ? 'Return to framed gallery' : 'Open immersive view'}: ${works[selected].title}`);
}

async function select(index) {
  const request = ++selectionRequest;
  const next = (index + works.length) % works.length;
  root.classList.remove('loaded');
  document.querySelector('.error-message').hidden = true;
  try {
    const image = await load(works[next]);
    if (request !== selectionRequest) return;
    selected = next;
    const work = works[selected];
    artwork.src = image.src;
    artwork.alt = `${work.title}, ${work.year}, by Yusuke Nakamura. ${work.description}`;
    root.style.setProperty('--accent', work.color);
    root.style.setProperty('--art-ratio', Math.min(work.width / work.height, 1.18));
    document.querySelector('.peripheral-left img').src = thumbnailURL(works[(selected + works.length - 1) % works.length]);
    document.querySelector('.peripheral-right img').src = thumbnailURL(works[(selected + 1) % works.length]);
    collection.querySelectorAll('button').forEach((button, i) => {
      button.setAttribute('aria-current', String(i === selected));
      if (i === selected) button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: paused ? 'instant' : 'smooth' });
    });
    if (spatialReady) spatial.select(selected);
    updateRoute();
    root.classList.add('loaded');
    load(works[(selected + 1) % works.length]).catch(() => {});
  } catch {
    if (request !== selectionRequest) return;
    document.querySelector('.error-message').hidden = false;
    root.classList.add('loaded');
  }
}

function setMode(value) {
  immersive = value;
  root.classList.toggle('immersive', immersive);
  spatial?.setMode(immersive);
  document.querySelector('[data-action="museum"]').setAttribute('aria-pressed', String(!immersive));
  document.querySelector('[data-action="immersive"]').setAttribute('aria-pressed', String(immersive));
  updateRoute();
}

function externalLink(url, label) {
  const link = document.createElement('a');
  link.href = url;
  link.textContent = label;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function showInfo() {
  const work = works[selected];
  const content = document.querySelector('#info-content');
  content.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = work.title;
  const credit = document.createElement('p');
  credit.className = 'credits-role';
  credit.textContent = work.credit;
  const details = document.createElement('p');
  details.textContent = `Publication / release: ${work.year}. Digital reproduction: ${work.width} × ${work.height} pixels. Titles identify the published work or commission, unless the source names a standalone illustration.`;
  const note = document.createElement('p');
  note.textContent = ['feedback-file-2', 'sol-fa', 'dialogue'].includes(work.id)
    ? 'This composition was identified from the reference prints. The small Sol-fa print is a strong visual match; its edition is unconfirmed. Cover typography differs from the exhibition prints. These are published digital reproductions, not verified archival scans.'
    : 'An expanded selection of Nakamura’s published illustrations. This is a digital reproduction, not a verified archival scan. Source dimensions do not establish the resolution of the artist’s original master.';
  const links = document.createElement('p');
  links.className = 'info-links';
  links.append(externalLink(work.artistUrl, 'Nakamura’s official shop ↗'), externalLink(work.sourceUrl, 'Source publication ↗'), externalLink('/art/art-sources.json', 'Full image provenance'));
  if (work.designCreditSource) links.append(externalLink(work.designCreditSource, 'Design credit source ↗'));
  const rights = document.createElement('small');
  rights.textContent = 'Independent, non-commercial fan gallery. No work is offered for sale. This site is not affiliated with or endorsed by Yusuke Nakamura, the publishers, labels, exhibitions, or Smithsonian. Rights remain with their respective holders. Reproduction permission has not been established; attribution and non-commercial intent do not grant it.';
  content.append(title, credit, details, note, links, document.createElement('hr'), rights);
  dialog.showModal();
}

works.forEach((work, index) => {
  const button = document.createElement('button');
  button.className = 'specimen';
  button.setAttribute('aria-label', `View ${work.title}`);
  button.setAttribute('aria-current', String(index === selected));
  const image = document.createElement('img');
  image.src = thumbnailURL(work);
  image.alt = '';
  button.append(image);
  button.addEventListener('click', () => select(index));
  collection.append(button);

  const plaque = document.createElement('div');
  plaque.className = 'frame-credit';
  plaque.hidden = true;
  const titleLink = externalLink(work.sourceUrl, work.title);
  const plaqueTitle = document.createElement('h2');
  plaqueTitle.className = 'work-title';
  plaqueTitle.append(titleLink);
  const byline = externalLink(work.artistUrl, 'Illustration by Yusuke Nakamura ↗');
  byline.className = 'work-credit';
  plaque.append(plaqueTitle, byline);
  if (work.coverDesigner) {
    const design = document.createElement('span');
    design.className = 'work-credit';
    design.textContent = `Cover design: ${work.coverDesigner}`;
    plaque.append(design);
  }
  frameCredits.append(plaque);

  const card = document.createElement('article');
  card.className = 'overview-card';
  const choose = document.createElement('button');
  choose.setAttribute('aria-label', `Visit ${work.title}`);
  const preview = document.createElement('img');
  preview.src = thumbnailURL(work);
  preview.alt = `${work.title}. Illustration by Yusuke Nakamura.`;
  preview.loading = 'lazy';
  choose.append(preview);
  choose.addEventListener('click', () => { overview.close(); select(index); });
  const name = document.createElement('h2');
  name.textContent = work.title;
  const cardCredit = document.createElement('p');
  cardCredit.textContent = work.credit;
  const cardLinks = document.createElement('p');
  cardLinks.className = 'source-links';
  cardLinks.append(externalLink(work.artistUrl, 'Artist ↗'), externalLink(work.sourceUrl, 'Source ↗'));
  card.append(choose, name, cardCredit, cardLinks);
  document.querySelector('#overview-grid').append(card);
});

function layoutCredits(positions) {
  for (const position of positions) {
    const plaque = frameCredits.children[position.index];
    if (!plaque) continue;
    plaque.hidden = !position.visible || position.y > innerHeight - 115;
    if (plaque.hidden) continue;
    plaque.style.left = `${position.x}px`;
    plaque.style.top = `${position.y}px`;
    plaque.style.maxWidth = `${Math.min(330, position.width)}px`;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  switch (button.dataset.action) {
    case 'prev': select(selected - 1); break;
    case 'next': select(selected + 1); break;
    case 'museum': setMode(false); break;
    case 'immersive': setMode(true); break;
    case 'zoom-in': spatial?.zoomBy(1.2); break;
    case 'zoom-out': spatial?.zoomBy(1 / 1.2); break;
    case 'reset-view': spatial?.resetView(); break;
    case 'overview': overview.showModal(); break;
    case 'close-overview': overview.close(); break;
    case 'motion':
      paused = !paused;
      try { sessionStorage.setItem('art-motion', paused ? 'pause' : 'play'); } catch {}
      updateMotion();
      break;
    case 'original': original = !original; updateMotion(); break;
    case 'info': showInfo(); break;
    case 'close-info': dialog.close(); break;
    case 'reload': select(selected); break;
  }
});

frame.addEventListener('click', () => {
  if (performance.now() - lastSwipe > 400) setMode(!immersive);
});
frame.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMode(!immersive); }
});
document.addEventListener('keydown', event => {
  if (dialog.open || overview.open) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); select(selected + 1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); select(selected - 1); }
  if (event.key === 'Escape' && immersive) setMode(false);
  if (event.key === 'Home') { event.preventDefault(); select(0); }
  if (event.key === 'End') { event.preventDefault(); select(works.length - 1); }
  if (event.key === '+' || event.key === '=') spatial?.zoomBy(1.2);
  if (event.key === '-') spatial?.zoomBy(1 / 1.2);
  if (event.key === '0') spatial?.resetView();
});

let touchStart = null;
room.addEventListener('touchstart', event => {
  if (spatialReady) return;
  if (event.touches.length === 1) touchStart = [event.changedTouches[0].clientX, event.changedTouches[0].clientY];
  else touchStart = null;
}, { passive: true });
room.addEventListener('touchend', event => {
  if (spatialReady) return;
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart[0];
  const dy = event.changedTouches[0].clientY - touchStart[1];
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    lastSwipe = performance.now();
    select(selected + (dx < 0 ? 1 : -1));
  }
  touchStart = null;
}, { passive: true });
room.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });

dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
reducedMotion.addEventListener('change', event => { paused = event.matches; updateMotion(); });

async function initialize() {
  updateMotion();
  setMode(immersive);
  await select(selected);
  try {
    const { SpatialGallery } = await import('./spatial-gallery.js');
    spatial = new SpatialGallery(document.querySelector('#spatial-gallery'), {
      onSelect: index => select(index),
      onLayout: layoutCredits,
      onActivate: () => { if (performance.now() - lastSwipe > 400) setMode(!immersive); },
    });
    spatial.setMotion(!paused && !original);
    await spatial.setWorks(works);
    spatialReady = true;
    spatial.select(selected);
    spatial.setMode(immersive);
    spatial.setOriginal(original);
    root.classList.add('spatial-ready');
    const surface = document.querySelector('#spatial-gallery');
    surface.addEventListener('webglcontextlost', () => root.classList.remove('spatial-ready'));
    surface.addEventListener('webglcontextrestored', () => root.classList.add('spatial-ready'));
  } catch (error) {
    spatial?.destroy();
    spatial = null;
    console.warn('Using static framed gallery:', error.message);
  }
}
initialize();
