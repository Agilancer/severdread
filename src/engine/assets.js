// Asset loading: the generated manifest, images (cached), and GL texture
// handles that can be used immediately and fill in once their image loads.

const imageCache = new Map();

export function loadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + url));
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

export async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Failed to load ' + url);
  return r.json();
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// A texture handle: {tex, w, h, ready, image}. `tex` is null until loaded;
// the renderer falls back to a white texture so draws never fail.
export class TextureStore {
  constructor(renderer) {
    this.r = renderer;
    this.handles = new Map();
  }

  fromURL(url, opts) {
    let h = this.handles.get(url);
    if (h) return h;
    h = { tex: null, w: 1, h: 1, ready: false, image: null, url };
    this.handles.set(url, h);
    h.promise = loadImage(url).then((img) => {
      h.tex = this.r.createTexture(img, opts);
      h.w = img.naturalWidth; h.h = img.naturalHeight; h.image = img; h.ready = true;
      return h;
    }).catch((e) => { console.warn(e.message); h.failed = true; return h; });
    return h;
  }

  fromCanvas(key, canvas, opts) {
    let h = this.handles.get(key);
    if (h && h.ready) return h;
    h = { tex: this.r.createTexture(canvas, opts), w: canvas.width, h: canvas.height, ready: true, image: canvas, key };
    h.promise = Promise.resolve(h);
    this.handles.set(key, h);
    return h;
  }

  get(key) { return this.handles.get(key); }

  release(key) {
    const h = this.handles.get(key);
    if (h && h.tex) this.r.deleteTexture(h.tex);
    this.handles.delete(key);
  }
}

// Cut a rectangle out of an image into its own canvas.
export function cropToCanvas(img, x, y, w, h, outW = w, outH = h) {
  const c = makeCanvas(outW, outH);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, x, y, w, h, 0, 0, outW, outH);
  return c;
}
