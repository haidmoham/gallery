import * as THREE from 'three';

const GLASS_VERTEX = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const GLASS_FRAGMENT = `precision mediump float;
varying vec2 vUv; uniform float uTime; uniform vec2 uPointer; uniform float uStrength;
void main(){float line=vUv.x*.8+vUv.y*.38+uPointer.x*.025+sin(uTime*.16)*.012;
float broad=smoothstep(.4,.61,line)*(1.-smoothstep(.61,.91,line));
float edge=exp(-pow((line-.61)/.0018,2.));
gl_FragColor=vec4(.96,.94,.86,(broad*.025+edge*.032)*uStrength);}`;

function stoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(256, 256);
  let seed = 8317;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 128 + (seed / 4294967296 - .5) * 22;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 6);
  return texture;
}

function aperture(width, height, inset) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-width / 2 + inset, -height / 2 + inset);
  hole.lineTo(-width / 2 + inset, height / 2 - inset);
  hole.lineTo(width / 2 - inset, height / 2 - inset);
  hole.lineTo(width / 2 - inset, -height / 2 + inset);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

/** Quiet physical gallery; UI and captions remain the caller's responsibility. */
export class SpatialGallery {
  constructor(canvas, { onSelect, onActivate, onLayout } = {}) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.onActivate = onActivate;
    this.onLayout = onLayout;
    this.motion = true;
    this.original = false;
    this.immersive = false;
    this.index = 0;
    this.time = 0;
    this.zoom = 1;
    this.pointers = new Map();
    this.previousCursor = canvas.style.cursor;
    this.previousTouchAction = canvas.style.touchAction;
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    this.groups = [];
    this.targets = [];
    this.ownedTextures = new Set();
    this.fullTextures = new Map();
    this.fullRequests = new Map();
    this.wantedFull = new Set();
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.destination = new THREE.Vector3(0, 0, 6);
    this.raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene();
    this.wallColor = new THREE.Color('#d0cbc1');
    this.darkColor = new THREE.Color('#242622');
    this.scene.background = this.wallColor.clone();
    this.camera = new THREE.PerspectiveCamera(37, 1, .1, 100);
    this.camera.position.copy(this.destination);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#a7a49b', 2.5));
    this.key = new THREE.DirectionalLight('#fffaf2', 2.1);
    this.key.position.set(-4, 7, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: .1, far: 35 });
    this.key.shadow.bias = -.00015;
    this.key.shadow.normalBias = .015;
    this.key.shadow.radius = 4;
    this.scene.add(this.key, this.key.target);
    this.stone = stoneTexture();
    this.ownedTextures.add(this.stone);
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: '#c9c4b9', roughness: .98, bumpMap: this.stone, bumpScale: .006 });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 15), this.wallMaterial);
    this.wall.position.set(0, 0, -.19);
    this.wall.receiveShadow = true;
    this.scene.add(this.wall);
    // A narrow floor is visible only at wider camera distances; the wall remains the interface.
    this.floorMaterial = new THREE.MeshStandardMaterial({ color: '#bdb8ae', roughness: .93 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.25, 9.8);
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(60, .028, .024), new THREE.MeshStandardMaterial({ color: '#a29e94', roughness: 1 }));
    skirting.position.set(0, -2.23, -.16);
    this.scene.add(skirting);
    this.skirting = skirting;
    this.onResize = () => this.resize();
    this.onVisibility = () => { if (document.hidden) this.stop(); else this.start(); };
    this.onPointer = event => {
      const bounds = canvas.getBoundingClientRect();
      this.pointerTarget.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      if (this.pointers.has(event.pointerId)) {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size >= 2) {
          const [a, b] = [...this.pointers.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.pinch) {
            const x = this.camera.position.x;
            this.zoom = THREE.MathUtils.clamp(this.pinch.zoom * distance / this.pinch.distance, 1, 2.4);
            this.fit();
            this.camera.position.set(x, 0, this.destination.z);
            this.destination.x = x;
          }
          this.dragged = true;
        } else if (this.down) {
          const dx = event.clientX - this.down.x;
          if (Math.hypot(dx, event.clientY - this.down.y) > 9) this.dragged = true;
          if (this.dragged) {
            const x = this.clampX(this.down.cameraX - dx * this.down.worldPerPixel);
            const now = performance.now();
            const dt = Math.max(.008, (now - this.down.lastTime) / 1000);
            this.velocity = THREE.MathUtils.lerp(this.velocity || 0, (x - this.camera.position.x) / dt, .45);
            this.down.lastTime = now;
            this.camera.position.x = this.destination.x = x;
          }
        }
      }
      this.start();
    };
    this.onLeave = () => { this.pointerTarget.set(0, 0); this.start(); };
    this.onDown = event => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      clearTimeout(this.settleTimer);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      if (this.pointers.size === 1) {
        this.dragged = false;
        this.velocity = 0;
        this.down = { x: event.clientX, y: event.clientY, cameraX: this.camera.position.x, worldPerPixel: this.worldPerPixel(), lastTime: performance.now() };
        this.destination.x = this.camera.position.x;
      } else {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom };
        this.dragged = true;
      }
    };
    this.onUp = event => {
      if (!this.pointers.has(event.pointerId)) return;
      const dragged = this.dragged || (this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 9);
      this.pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (this.pointers.size) {
        const [point] = this.pointers.values();
        this.down = { ...point, cameraX: this.camera.position.x, worldPerPixel: this.worldPerPixel(), lastTime: performance.now() };
        this.pinch = null;
        this.velocity = 0;
        return;
      }
      const lastDragTime = this.down?.lastTime || 0;
      this.down = null;
      this.pinch = null;
      canvas.style.cursor = 'grab';
      if (dragged) {
        const fresh = performance.now() - lastDragTime < 100;
        this.snapToNearest(this.motion && fresh ? THREE.MathUtils.clamp(this.velocity || 0, -12, 12) * .12 : 0);
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      const point = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      this.raycaster.setFromCamera(point, this.camera);
      const hit = this.raycaster.intersectObjects(this.targets, false)[0];
      if (!hit) return;
      const index = hit.object.userData.index;
      if (index === this.index) this.onActivate?.(index);
      else { this.select(index); this.onSelect?.(index); }
    };
    this.onCancel = event => {
      if (!this.pointers.has(event.pointerId)) return;
      for (const pointerId of this.pointers.keys()) {
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      }
      this.pointers.clear();
      this.down = null;
      this.pinch = null;
      canvas.style.cursor = 'grab';
      this.snapToNearest();
    };
    this.onWheel = event => {
      if (event.ctrlKey || !this.groups.length) return;
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.width : 1;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const x = this.clampX(this.camera.position.x + delta * units * this.worldPerPixel() * .85);
      this.camera.position.x = this.destination.x = x;
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => this.snapToNearest(), 160);
      this.start();
    };
    this.onLost = event => { event.preventDefault(); this.contextLost = true; this.stop(); };
    this.onRestore = () => { this.contextLost = false; this.start(); };
    canvas.addEventListener('pointermove', this.onPointer);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestore);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  async setWorks(works) {
    const generation = (this.generation || 0) + 1;
    this.generation = generation;
    for (const controller of this.fullRequests.values()) controller.abort();
    this.fullRequests.clear();
    const loader = new THREE.TextureLoader();
    const thumbnails = new Array(works.length);
    let next = 0;
    // Six tiny images at a time. Original images never participate in gallery startup.
    await Promise.all(Array.from({ length: Math.min(6, works.length) }, async () => {
      while (!this.destroyed && this.generation === generation && next < works.length) {
        const index = next++;
        const work = works[index];
        try {
          thumbnails[index] = await loader.loadAsync(work.thumbnail || `/art/thumbs/${work.file}`);
        } catch {
          const placeholder = new THREE.DataTexture(new Uint8Array([219, 214, 200, 255]), 1, 1);
          placeholder.needsUpdate = true;
          thumbnails[index] = placeholder;
        }
      }
    }));
    if (this.destroyed || this.generation !== generation) { thumbnails.forEach(texture => this.releaseTexture(texture)); return; }
    this.clearWorks();
    this.works = works;
    let x = 0;
    for (let i = 0; i < works.length; i++) {
      const work = works[i];
      const texture = this.configureTexture(thumbnails[i]);
      this.ownedTextures.add(texture);
      const height = 2.45;
      const width = height * work.width / work.height;
      const mat = .145, rail = .055;
      const outerWidth = width + 2 * (mat + rail);
      const outerHeight = height + 2 * (mat + rail);
      if (i > 0) x += this.groups[i - 1].userData.width / 2 + outerWidth / 2 + 1.0;
      const group = new THREE.Group();
      group.position.x = x;
      group.userData = { width: outerWidth, height: outerHeight, x, texture };
      const charcoal = new THREE.MeshStandardMaterial({ color: '#292a25', roughness: .66, metalness: .22 });
      const brass = new THREE.MeshStandardMaterial({ color: '#9b8d62', roughness: .48, metalness: .5 });
      const addRail = (w, h, px, py) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, .16), charcoal);
        mesh.position.set(px, py, -.007);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      };
      addRail(outerWidth, rail, 0, (outerHeight - rail) / 2);
      addRail(outerWidth, rail, 0, -(outerHeight - rail) / 2);
      addRail(rail, outerHeight - rail * 2, (outerWidth - rail) / 2, 0);
      addRail(rail, outerHeight - rail * 2, -(outerWidth - rail) / 2, 0);
      const rim = new THREE.Mesh(aperture(outerWidth - rail * .65, outerHeight - rail * .65, .008), brass);
      rim.position.z = .077;
      group.add(rim);
      const matMesh = new THREE.Mesh(aperture(width + mat * 2, height + mat * 2, mat), new THREE.MeshStandardMaterial({ color: '#f1ebdb', roughness: .99, metalness: 0 }));
      matMesh.position.z = .036;
      matMesh.receiveShadow = true;
      group.add(matMesh);
      const bevel = new THREE.Mesh(aperture(width + .025, height + .025, .015), new THREE.MeshStandardMaterial({ color: '#bdb5a5', roughness: 1 }));
      bevel.position.z = .029;
      group.add(bevel);
      const living = new THREE.Group();
      const print = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
      print.position.z = .027;
      print.userData.index = i;
      group.userData.print = print;
      living.add(print);
      this.targets.push(print);
      const glassMaterial = new THREE.ShaderMaterial({
        vertexShader: GLASS_VERTEX, fragmentShader: GLASS_FRAGMENT,
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uPointer: { value: new THREE.Vector2() }, uStrength: { value: 1 } },
      });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glassMaterial);
      glass.position.z = .031;
      living.add(glass);
      group.add(living);
      group.userData.living = living;
      group.userData.glass = glassMaterial;
      this.groups.push(group);
      this.scene.add(group);
    }
    this.index = Math.min(this.index, Math.max(0, this.groups.length - 1));
    const wallWidth = Math.max(30, x + 24);
    for (const surface of [this.wall, this.floor, this.skirting]) {
      surface.position.x = x / 2;
      surface.scale.x = wallWidth / 60;
    }
    this.stone.repeat.x = wallWidth / 3;
    this.fit();
    this.camera.position.copy(this.destination);
    this.promoteNearby();
    this.start();
  }

  configureTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    return texture;
  }

  releaseTexture(texture) {
    if (!texture) return;
    texture.dispose();
    const image = texture.source?.data;
    if (image instanceof HTMLCanvasElement) image.width = image.height = 1;
    image?.close?.();
    if (texture.source) texture.source.data = null;
    this.ownedTextures.delete(texture);
  }

  async loadFullTexture(work, signal) {
    const response = await fetch(`/art/${work.file}`, { signal });
    if (!response.ok) throw new Error(`Artwork returned ${response.status}`);
    const blob = await response.blob();
    let image;
    let objectURL;
    try {
      if (typeof createImageBitmap === 'function') image = await createImageBitmap(blob);
      else {
        objectURL = URL.createObjectURL(blob);
        image = new Image();
        image.src = objectURL;
        await image.decode();
      }
      if (signal.aborted || this.destroyed) throw new DOMException('Cancelled', 'AbortError');
      const maxSize = this.canvas.getBoundingClientRect().width < 700 ? 1536 : 2048;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const source = document.createElement('canvas');
      source.width = Math.max(1, Math.round(image.width * scale));
      source.height = Math.max(1, Math.round(image.height * scale));
      const context = source.getContext('2d');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, source.width, source.height);
      return this.configureTexture(new THREE.CanvasTexture(source));
    } finally {
      image?.close?.();
      if (objectURL) URL.revokeObjectURL(objectURL);
    }
  }

  promoteNearby() {
    const generation = this.generation;
    this.wantedFull = new Set([this.index, this.index - 1, this.index + 1].filter(index => this.groups[index]));
    for (const [index, controller] of this.fullRequests) {
      if (!this.wantedFull.has(index)) { controller.abort(); this.fullRequests.delete(index); }
    }
    for (const [index, texture] of this.fullTextures) {
      if (!this.wantedFull.has(index)) {
        const data = this.groups[index]?.userData;
        if (data) data.print.material.map = data.texture;
        this.fullTextures.delete(index);
        this.releaseTexture(texture);
      }
    }
    for (const index of this.wantedFull) {
      if (this.fullTextures.has(index) || this.fullRequests.has(index)) continue;
      const controller = new AbortController();
      this.fullRequests.set(index, controller);
      this.loadFullTexture(this.works[index], controller.signal).then(texture => {
        if (this.destroyed || generation !== this.generation || controller.signal.aborted || !this.wantedFull.has(index)) {
          this.releaseTexture(texture);
          return;
        }
        this.fullTextures.set(index, texture);
        this.ownedTextures.add(texture);
        this.groups[index].userData.print.material.map = texture;
        this.start();
      }).catch(() => {
        // Keep the thumbnail when the high-resolution request fails or is cancelled.
      }).finally(() => {
        if (this.fullRequests.get(index) === controller) this.fullRequests.delete(index);
      });
    }
  }

  fit() {
    const group = this.groups[this.index];
    if (!group) return;
    const bounds = this.canvas.getBoundingClientRect();
    const mobile = bounds.width < 700;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const widthFraction = mobile ? (this.immersive ? .91 : .84) : (this.immersive ? .76 : .64);
    // Reserve the top and bottom for the small controls; the canvas covers the room.
    const heightFraction = this.immersive ? .80 : .68;
    const heightDistance = group.userData.height / (2 * tan * heightFraction);
    const widthDistance = group.userData.width / (2 * tan * this.camera.aspect * widthFraction);
    this.destination.set(group.userData.x, 0, Math.max(heightDistance, widthDistance) / this.zoom + .08);
    if (!this.motion) this.camera.position.copy(this.destination);
  }

  select(index) {
    clearTimeout(this.settleTimer);
    if (!this.groups.length) { this.index = Math.max(0, index); return; }
    this.index = ((index % this.groups.length) + this.groups.length) % this.groups.length;
    this.promoteNearby();
    this.fit();
    this.start();
  }

  setMode(immersive) { this.immersive = Boolean(immersive); this.fit(); this.start(); }
  setMotion(motion) { this.motion = Boolean(motion); this.fit(); this.start(); }
  setOriginal(original) { this.original = Boolean(original); this.start(); }

  worldPerPixel() {
    return 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.max(1, this.canvas.getBoundingClientRect().height);
  }

  clampX(x) {
    return THREE.MathUtils.clamp(x, this.groups[0]?.userData.x || 0, this.groups.at(-1)?.userData.x || 0);
  }

  snapToNearest(momentum = 0) {
    if (!this.groups.length || this.destroyed) return;
    const x = this.clampX(this.camera.position.x + momentum);
    let nearest = 0;
    this.groups.forEach((group, index) => {
      if (Math.abs(group.userData.x - x) < Math.abs(this.groups[nearest].userData.x - x)) nearest = index;
    });
    const changed = nearest !== this.index;
    this.select(nearest);
    if (changed) this.onSelect?.(nearest);
  }

  zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 1, 2.4);
    this.fit();
    this.start();
  }

  resetView() { this.zoom = 1; this.pointerTarget.set(0, 0); this.fit(); this.start(); }

  resize() {
    if (this.destroyed) return;
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 2));
    const shadowSize = width < 700 ? 1024 : 2048;
    if (this.key.shadow.mapSize.x !== shadowSize) {
      this.key.shadow.mapSize.set(shadowSize, shadowSize);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fit();
    this.start();
  }

  start() {
    if (this.raf || this.destroyed || this.contextLost || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(now => this.tick(now));
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = null; }

  tick(now) {
    this.raf = null;
    if (this.destroyed || this.contextLost || document.hidden) return;
    const dt = Math.min((now - this.last) / 1000, .05);
    this.last = now;
    const blend = this.motion ? 1 - Math.exp(-dt * 5.5) : 1;
    this.camera.position.lerp(this.destination, blend);
    // Camera orientation is fixed. The viewer moves along the wall, not around the art.
    this.camera.rotation.set(0, 0, 0);
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 3));
    const alive = this.motion && !this.original;
    if (alive) this.time += dt;
    for (let i = 0; i < this.groups.length; i++) {
      const data = this.groups[i].userData;
      const active = i === this.index && alive;
      data.living.position.y = active ? Math.sin(this.time * .42) * .005 : 0;
      data.living.rotation.y = active ? this.pointer.x * .003 + Math.sin(this.time * .24) * .001 : 0;
      data.living.rotation.x = active ? -this.pointer.y * .002 : 0;
      data.glass.uniforms.uTime.value = this.time;
      data.glass.uniforms.uPointer.value.copy(this.pointer);
      data.glass.uniforms.uStrength.value = this.original ? 0 : (this.immersive ? .65 : 1);
    }
    const colorTarget = this.immersive ? this.darkColor : this.wallColor;
    const oldColor = this.scene.background.clone();
    this.scene.background.lerp(colorTarget, blend);
    this.wallMaterial.color.copy(this.scene.background);
    this.floorMaterial.color.copy(this.scene.background).multiplyScalar(.88);
    this.key.intensity = THREE.MathUtils.lerp(this.key.intensity, this.immersive ? 1.15 : 2.1, blend);
    this.key.position.x = this.camera.position.x - 4;
    this.key.target.position.x = this.camera.position.x;
    this.renderer.render(this.scene, this.camera);
    if (this.onLayout) {
      const bounds = this.canvas.getBoundingClientRect();
      this.onLayout(this.groups.map((group, index) => {
        const data = group.userData;
        const bottom = new THREE.Vector3(data.x, -data.height / 2, .08).project(this.camera);
        const left = new THREE.Vector3(data.x - data.width / 2, 0, .08).project(this.camera);
        const right = new THREE.Vector3(data.x + data.width / 2, 0, .08).project(this.camera);
        const x = (bottom.x + 1) * bounds.width / 2;
        const y = (1 - bottom.y) * bounds.height / 2 + 12;
        const width = (right.x - left.x) * bounds.width / 2;
        return { index, x, y, width, visible: bottom.z > -1 && bottom.z < 1 && x > 32 && x < bounds.width - 32 && y >= 0 && y < bounds.height - 18 && width >= 80 };
      }));
    }
    const moving = this.camera.position.distanceToSquared(this.destination) > .000001;
    const fading = Math.abs(oldColor.r - colorTarget.r) + Math.abs(oldColor.g - colorTarget.g) + Math.abs(oldColor.b - colorTarget.b) > .001;
    if (alive || moving || fading) this.raf = requestAnimationFrame(next => this.tick(next));
  }

  disposeTree(object) {
    const materials = new Set();
    object.traverse(child => {
      child.geometry?.dispose();
      if (child.material) (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => materials.add(material));
    });
    materials.forEach(material => material.dispose());
  }

  clearWorks() {
    for (const controller of this.fullRequests.values()) controller.abort();
    this.fullRequests.clear();
    for (const texture of this.fullTextures.values()) this.releaseTexture(texture);
    this.fullTextures.clear();
    this.wantedFull.clear();
    for (const group of this.groups) {
      this.scene.remove(group);
      this.disposeTree(group);
      this.releaseTexture(group.userData.texture);
    }
    this.groups = [];
    this.targets = [];
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    clearTimeout(this.settleTimer);
    for (const pointerId of this.pointers.keys()) {
      if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    }
    this.pointers.clear();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointermove', this.onPointer);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestore);
    this.clearWorks();
    this.disposeTree(this.scene);
    this.ownedTextures.forEach(texture => texture.dispose());
    this.key.shadow.map?.dispose();
    this.renderer.dispose();
    this.canvas.style.cursor = this.previousCursor;
    this.canvas.style.touchAction = this.previousTouchAction;
  }
}
