// Minimal Chrome DevTools helpers for taking the pitch screenshots (port 9555 only).
import { writeFileSync } from 'node:fs';
export const PORT = 9555;
export const BASE = 'https://sirret.github.io/FarmerHackaton10';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function attach(webSocketDebuggerUrl, id) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let n = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++n; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.result?.exceptionDetails) return 'EVAL ERROR: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  return { id, evalJs, send, errors, close: () => ws.close() };
}

export async function newTab(url = BASE + '/') {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const t = await res.json();
  return attach(t.webSocketDebuggerUrl, t.id);
}
export async function tabs() { return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }

export async function waitFor(tab, expr, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await tab.evalJs(expr);
    if (v && !String(v).startsWith('EVAL ERROR')) return v;
    await sleep(250);
  }
  return null;
}

export const H = `
window.$btn = (txt, root = document) => [...root.querySelectorAll('button')].find(b => b.innerText.trim().replace(/\\s+/g, ' ').startsWith(txt));
window.$click = (txt, root) => { const b = $btn(txt, root); if (!b) return 'NO BUTTON ' + txt; b.click(); return 'ok'; };
window.$set = (el, v) => { if (!el) return 'NO EL'; const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return 'set'; };
window.$notices = () => [...document.querySelectorAll('[role=status]')].map(n => n.innerText).join(' || ');
window.$phone = () => document.querySelector('.overflow-y-auto');
window.$tab = (label) => { [...$phone().querySelectorAll('nav button')].find(x => x.innerText.includes(label)).click(); return 'tab'; };
window.$key = (k) => { const b = document.querySelector('button[aria-label="' + k + '"]'); if (!b) return 'NO KEY ' + k; b.click(); return k; };
window.$screen = () => document.querySelector('[data-screen]')?.innerText.replace(/\\n+/g, ' | ');
window.$idb = (store) => new Promise(ok => { const r = indexedDB.open('kafo-signal'); r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).getAll(); q.onsuccess = () => { ok(q.result); r.result.close(); }; }; });
true`;

export async function viewport(tab, mobile) {
  await tab.send('Emulation.setDeviceMetricsOverride', mobile
    ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
    : { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
}

export async function goto(tab, path, role, id) {
  await tab.evalJs(`localStorage.setItem('ks.voice.fast', '1'); ${role ? `localStorage.setItem('ks.session.${role}', '${id}');` : ''} window.__stale = true; location.href = '${BASE}${path}'; true`);
  await sleep(1000);
  await tab.evalJs('window.__stale = true; location.reload(); true');
  const t = Date.now();
  while (Date.now() - t < 40000) {
    if ((await tab.evalJs("!window.__stale && document.readyState === 'complete'")) === true) break;
    await sleep(300);
  }
  await sleep(1200);
  await tab.evalJs(H);
}

// Screenshot; selectorExpr = JS expression returning an element to clip to (optional).
export async function shot(tab, file, selectorExpr, pad = 0) {
  let clip;
  if (selectorExpr) {
    const r = await tab.evalJs(`(() => { const el = ${selectorExpr}; if (!el) return null; el.scrollIntoView({block:'nearest'}); const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    if (r && typeof r === 'object') clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 };
    else console.log('clip element not found for', file);
  }
  await sleep(500);
  const res = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) });
  writeFileSync(file, Buffer.from(res.result.data, 'base64'));
  console.log('saved', file, clip ? `clip ${Math.round(clip.width)}x${Math.round(clip.height)}` : '');
}
