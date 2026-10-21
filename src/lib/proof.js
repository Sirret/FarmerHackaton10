// Proof photos for shipments, stored as image data URLs (small enough for IndexedDB and
// the seed JSON). Real photos are downscaled in the browser; the demo can use a drawn
// weigh slip instead of a camera. Named SVG colours only (the theme owns the hex values).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A drawn "photo" of the weighed bags and the weigh slip, as an SVG data URL. Pure. */
export function sampleProofPhoto({ kafo, crop, kg, date, slip }) {
  const bags = Math.max(1, Math.min(6, Math.ceil(kg / 25)));
  const bagShapes = Array.from({ length: bags }, (_, i) => {
    const x = 20 + i * 46;
    return `<path d="M${x} 150 q4 -42 18 -46 h10 q14 4 18 46 z" fill="tan" stroke="saddlebrown" stroke-width="2"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
<rect width="320" height="200" fill="darkseagreen"/><rect y="150" width="320" height="50" fill="dimgray"/>
${bagShapes}
<g transform="rotate(-4 250 70)"><rect x="196" y="18" width="112" height="108" fill="white" stroke="black"/>
<text x="204" y="38" font-family="monospace" font-size="11" fill="black">WEIGH SLIP ${esc(slip ?? '')}</text>
<text x="204" y="56" font-family="monospace" font-size="10" fill="black">${esc(kafo).slice(0, 16)}</text>
<text x="204" y="72" font-family="monospace" font-size="10" fill="black">${esc(crop)}</text>
<text x="204" y="94" font-family="monospace" font-size="16" font-weight="bold" fill="black">${esc(kg)} kg</text>
<text x="204" y="114" font-family="monospace" font-size="10" fill="black">${esc(date)}</text></g>
<text x="10" y="190" font-family="sans-serif" font-size="11" fill="white">Demo proof photo</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Downscale a camera/gallery photo to a JPEG data URL (longest side `max` px). Browser only. */
export function photoToDataUrl(file, max = 640) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a photo')); };
    img.src = url;
  });
}
