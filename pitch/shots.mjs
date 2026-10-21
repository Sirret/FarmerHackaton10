// Takes the Section 4 screenshots from the live site. Usage: node shots.mjs <step...>
// Steps (in order): reset ussd leader buyer rain order
import { newTab, goto, waitFor, viewport, shot, sleep } from './cdp-lib.mjs';
const OUT = 'screenshots/';
const steps = process.argv.slice(2);
const t = await newTab(); await sleep(4000);
const PHONE = `document.querySelector('[data-screen]').parentElement.parentElement`;
const KAFO = `$phone().parentElement`;
const say = (...a) => console.log(...a);

async function key(k) { await t.evalJs(`$key(${JSON.stringify(k)})`); await sleep(150); }
async function dial(code) { await key('End'); await key('Key 1'); for (const c of code) await key('Key ' + c); await key('Call'); }

for (const step of steps) {
  say('==', step);
  if (step === 'reset') {
    await viewport(t, false);
    await goto(t, '/admin#demo');
    await waitFor(t, `!!$btn('Add 3 pest reports')`, 60000);
    say(await t.evalJs(`[...document.querySelectorAll('button')].filter(b => /reset/i.test(b.innerText)).map(b => b.innerText.trim() + '#' + b.id).join(' | ')`));
    say(await t.evalJs(`window.confirm = () => true; const b = [...document.querySelectorAll('button')].filter(b => /reset demo/i.test(b.innerText)).pop(); b ? (b.click(), 'clicked') : 'none'`));
    await sleep(4000);
    say(await t.evalJs(`Promise.all(['orders','sms','plantings','payments'].map(s => $idb(s).then(r => s + '=' + r.length))).then(a => a.join(' '))`));
  }
  if (step === 'ussd') {
    await viewport(t, true);
    await goto(t, '/farmer', 'farmer', 'user_awa');
    await waitFor(t, `!!document.querySelector('[data-screen]')`, 60000);
    await dial('*1234#');
    say(await waitFor(t, `/1\\s*What to plant/i.test($screen()||'') && $screen()`, 20000) || await t.evalJs('$screen()'));
    await shot(t, OUT + '01-ussd-menu.png', PHONE, 16);
    await key('Key 1'); await key('OK');
    say(await waitFor(t, `/PLANT NOW/i.test($screen()||'') && $screen()`, 20000) || await t.evalJs('$screen()'));
    say('overflow', await t.evalJs(`(() => { const s = document.querySelector('[data-screen]'); const lcd = s.parentElement; return [s.scrollHeight, s.clientHeight, lcd.scrollHeight, lcd.clientHeight].join(','); })()`));
    await shot(t, OUT + '02-ussd-answer.png', PHONE, 16);
    await key('Down'); await sleep(300);
    say('after down', await t.evalJs('$screen()'));
    await shot(t, OUT + '02b-ussd-answer-scrolled.png', PHONE, 16);
  }
  if (step === 'leader') {
    await viewport(t, true);
    await goto(t, '/kafo', 'leader', 'user_fatou');
    await waitFor(t, `document.body.innerText.includes('Signals')`, 60000);
    await sleep(1500);
    say(await t.evalJs(`[...$phone().querySelectorAll('li')].slice(0,8).map(l => l.innerText.replace(/\\n+/g,' ')).join(' || ')`));
    // scroll the signals heading to the top of the app scroller
    say(await t.evalJs(`(() => { const p = $phone(); const li = [...p.querySelectorAll('li')].find(l => l.innerText.includes('Tomato') && l.innerText.includes('PLANT')); const hd = p.querySelector('header') || p.firstElementChild; p.scrollTop += li.getBoundingClientRect().top - hd.getBoundingClientRect().bottom - 12; return hd.tagName + ' ' + p.scrollTop; })()`));
    await shot(t, OUT + '04-leader-plant-tiles.png', KAFO, 10);
    await t.evalJs(`$tab('Sell')`);
    const card = `[...$phone().querySelectorAll('li')].find(l => l.innerText.includes('150 kg okra'))`;
    say(await waitFor(t, `${card}?.innerText.replace(/\\n+/g,' ')`, 20000));
    await shot(t, OUT + '05-leader-sell-card.png', KAFO, 10);
  }
  if (step === 'buyer') {
    await viewport(t, false);
    await goto(t, '/buyer#outlook', 'buyer', 'user_coastal_hotel');
    await waitFor(t, `/Harvest outlook/i.test(document.body.innerText)`, 60000);
    await sleep(2000);
    await shot(t, OUT + '06-buyer-dashboard.png');
    await t.evalJs(`location.hash = '#post'; true`);
    await waitFor(t, `!!document.querySelector('form')`, 20000); await sleep(1500);
    await shot(t, OUT + '06b-buyer-post-order.png');
  }
  if (step === 'rain') {
    await viewport(t, false);
    await goto(t, '/admin#demo');
    await waitFor(t, `!!$btn('Trigger heavy rain in Brikama')`, 60000);
    await t.evalJs(`$click('Trigger heavy rain in Brikama')`);
    say(await waitFor(t, `$notices().includes('Heavy rain alert sent') && $notices()`, 30000));
    await viewport(t, true);
    await goto(t, '/farmer', 'farmer', 'user_binta');
    await waitFor(t, `!!document.querySelector('[data-screen]')`, 60000);
    await key('End'); await key('Key 2'); await sleep(500); await key('OK');
    say(await waitFor(t, `/ACT NOW/i.test($screen()||'') && $screen()`, 20000) || await t.evalJs('$screen()'));
    await shot(t, OUT + '03-sms-alert.png', PHONE, 16);
  }
  if (step === 'order') {
    await viewport(t, true);
    await goto(t, '/kafo', 'leader', 'user_fatou');
    await waitFor(t, `document.body.innerText.includes('Signals')`, 60000);
    await t.evalJs(`$tab('Sell')`);
    const card = `[...$phone().querySelectorAll('li')].find(l => l.innerText.includes('150 kg okra'))`;
    await waitFor(t, `!!${card}`, 20000);
    say(await t.evalJs(`$click('Accept 150 kg', ${card})`));
    say(await waitFor(t, `$notices().includes('Accepted') && $notices()`, 20000));
    await t.evalJs(`$tab('Plant')`); await sleep(800);
    await t.evalJs(`[...$phone().querySelectorAll('button')].find(b => b.innerText.includes('Okra') && b.getAttribute('aria-pressed') !== null).click(); true`); await sleep(300);
    await t.evalJs(`$set($phone().querySelector('input[placeholder="20"]'), '40')`); await sleep(200);
    say(await t.evalJs(`(() => { const s = [...$phone().querySelectorAll('select')].find(s => [...s.options].some(o => o.text.includes('150 kg'))); if (!s) return 'no order select'; const o = [...s.options].find(o => o.text.includes('150 kg')); return $set(s, o.value); })()`)); await sleep(200);
    await t.evalJs(`$click('Save planting', $phone())`);
    say(await waitFor(t, `$notices().includes('Saved 40 beds') && $notices()`, 20000) || await t.evalJs('$notices()'));
    await t.evalJs(`$tab('Sell')`); await sleep(800);
    const oc = `[...$phone().querySelectorAll('li')].find(l => l.innerText.includes('150 kg okra for'))`;
    say('order card', await waitFor(t, `${oc}?.innerText.replace(/\\n+/g,' ')`, 20000));
    say(await t.evalJs(`$click('Record delivery', ${oc})`)); await sleep(600);
    say(await t.evalJs(`(() => { const ls = [...$phone().querySelectorAll('label')].filter(l => l.querySelector('input') && l.querySelector('span')); const names = ls.map(l => l.querySelector('span').innerText); let left = 150; const out = []; for (const l of ls) { const n = l.querySelector('span').innerText; let v = n === 'Awa Jatta' ? 38 : 0; out.push([l, n, v]); } left -= 38; for (const o of out) { if (o[1] !== 'Awa Jatta' && left > 0) { o[2] = Math.min(56, left); left -= o[2]; } } for (const [l, n, v] of out) if (v) $set(l.querySelector('input'), String(v)); return out.map(o => o[1] + '=' + o[2]).join(', '); })()`)); await sleep(400);
    await t.evalJs(`[...$phone().querySelectorAll('button')].find(b => b.innerText.trim() === 'Save').click(); true`);
    say(await waitFor(t, `$notices().includes('weighed') && $notices()`, 20000) || await t.evalJs('$notices()'));
    // buyer confirms + pays
    await viewport(t, false);
    await goto(t, '/buyer#orders', 'buyer', 'user_coastal_hotel');
    const bc = `[...document.querySelectorAll('li')].find(li => li.querySelector('[role=progressbar]') && li.innerText.includes('150 kg okra'))`;
    say('buyer card', await waitFor(t, `${bc}?.innerText.replace(/\\n+/g,' ').slice(0,300)`, 30000));
    say(await t.evalJs(`$click('Confirm collection', ${bc})`));
  }
  if (step === 'order' || step === 'pay') {
    await viewport(t, false);
    await goto(t, '/buyer#orders', 'buyer', 'user_coastal_hotel');
    const bc = `[...document.querySelectorAll('li')].find(li => li.querySelector('[role=progressbar]') && li.innerText.includes('150 kg okra'))`;
    await waitFor(t, `!!$btn('Pay D', ${bc})`, 30000);
    say(await t.evalJs(`$click('Pay D', ${bc})`));
    say(await waitFor(t, `$notices().includes('PAID') && $notices()`, 30000) || await t.evalJs('$notices()'));
    await sleep(1500);
    say(await t.evalJs(`${bc}?.innerText.replace(/\\n+/g,' ')`));
    await shot(t, OUT + '07-payment-confirmed.png', bc, 16);
    // Awa's phone: PAID SMS
    await viewport(t, true);
    await goto(t, '/farmer', 'farmer', 'user_awa');
    await waitFor(t, `!!document.querySelector('[data-screen]')`, 60000);
    await key('End'); await key('Key 2'); await sleep(500); await key('OK');
    say(await waitFor(t, `/PAID/.test($screen()||'') && $screen()`, 20000) || await t.evalJs('$screen()'));
    await shot(t, OUT + '07b-farmer-paid-sms.png', PHONE, 16);
  }
}
say('page errors:', t.errors.slice(0, 5));
t.close();
