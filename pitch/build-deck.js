// Builds pitch/kafo-signal-deck.pptx from kafo-signal-deck-guide.md.  Run: node build-deck.js
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require("./apply_theme.js");

const OUT = path.join(__dirname, "kafo-signal-deck.pptx");
const SHOTS = path.join(__dirname, "screenshots");

const HEX = {
  dark: "14402F", green: "2E9E4F", yellow: "F2B705", red: "D93B30",
  text: "1B1B1B", muted: "5F6B66", surface: "F1F5F2", white: "FFFFFF",
};
const THEME = {
  name: "Kafo Signal",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: HEX.text, lt1: HEX.white, dk2: HEX.dark, lt2: HEX.surface,
    accent1: HEX.green, accent2: HEX.yellow, accent3: HEX.red, accent4: HEX.muted,
    accent5: HEX.dark, accent6: HEX.green, hlink: HEX.green, folHlink: HEX.muted,
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.title = "Kafo Signal";
pres.author = "Linear Growth";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const S = pres.SchemeColor;
const C = {
  dark: S.text2, green: S.accent1, yellow: S.accent2, red: S.accent3, text: S.text1,
  muted: S.accent4, surface: S.background2, white: S.background1,
};
const HEAD = "+mj-lt"; // theme heading font (Cambria)
const W = 13.333, M = 0.6, CW = W - 2 * M;

// ---------- helpers ----------
const shadow = () => ({ type: "outer", color: "000000", opacity: 0.18, blur: 8, offset: 3, angle: 90 });

async function icon(Comp, colorHex, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + colorHex, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}
// icon inside a filled circle
async function iconCircle(slide, Comp, x, y, d, fill = C.green, iconHex = HEX.white, name = "icon") {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: name + " circle" });
  const pad = d * 0.25;
  slide.addImage({ data: await icon(Comp, iconHex), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, objectName: name });
}
// signal pill: shape + word (works in black-and-white)
const SIG = {
  good: { sym: "✓", word: "GOOD", fill: C.green, txt: C.white },
  careful: { sym: "!", word: "CAREFUL", fill: C.yellow, txt: C.text },
  avoid: { sym: "✕", word: "AVOID", fill: C.red, txt: C.white },
};
function pill(slide, text, x, y, w, h, fill, color, size = 14, name = "pill") {
  slide.addText(text, {
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: h / 2, x, y, w, h, fill: { color: fill }, line: { type: "none" },
    color, fontSize: size, bold: true, align: "center", valign: "middle", margin: 0, objectName: name,
  });
}
function sigPill(slide, kind, x, y, w, h, size = 14, label) {
  const s = SIG[kind];
  pill(slide, `${s.sym}  ${label || s.word}`, x, y, w, h, s.fill, s.txt, size, `${kind} pill`);
}
// three-dot traffic light, horizontal
function dots(slide, x, y, d, gap, name = "traffic light dots") {
  [C.red, C.yellow, C.green].forEach((c, i) =>
    slide.addShape(pres.shapes.OVAL, { x: x + i * (d + gap), y, w: d, h: d, fill: { color: c }, line: { type: "none" }, objectName: `${name} ${i + 1}` }));
}
function tag(slide, kind) {
  const t = kind === "demo"
    ? { text: "Prototype · simulated", fill: C.surface, color: C.dark }
    : { text: "Going live · after the hackathon", fill: C.dark, color: C.white };
  const w = kind === "demo" ? 2.5 : 3.3;
  slide.addText(t.text, {
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.2, x: W - M - w, y: 0.12, w, h: 0.36,
    fill: { color: t.fill }, line: { color: C.dark, width: 1 }, color: t.color, fontSize: 12, bold: true,
    align: "center", valign: "middle", margin: 0, objectName: "status tag",
  });
}
function text(slide, t, o) { slide.addText(t, { isTextBox: true, margin: 0, color: C.text, fontSize: 15, valign: "top", ...o }); }
function card(slide, x, y, w, h, o = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: o.fill || C.surface },
    line: o.line ? o.line : { type: "none" }, shadow: o.shadow ? shadow() : undefined, objectName: o.name || "card",
  });
}
function arrow(slide, x1, y1, x2, y2, color = C.muted, name = "arrow") {
  slide.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width: 2, endArrowType: "triangle" }, objectName: name });
}
const CUT = path.join(__dirname, "build"); // phone shots with transparent corners (cutout.py)
function shotPath(file) { return fs.existsSync(path.join(CUT, file)) ? path.join(CUT, file) : path.join(SHOTS, file); }
function isCutout(file) { return fs.existsSync(path.join(CUT, file)); }
function hasShot(file) { return fs.existsSync(shotPath(file)); }
// image (or grey labelled placeholder if the screenshot file is missing)
function image(slide, file, x, y, w, h, name) {
  if (hasShot(file)) {
    slide.addImage({ path: shotPath(file), x, y, w, h, shadow: isCutout(file) ? undefined : shadow(), objectName: name || file, altText: name || file });
  } else {
    slide.addText(`Missing screenshot:\n${file}`, {
      shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.1, x, y, w, h, fill: { color: "D9D9D9" }, line: { color: "A6A6A6", width: 1 },
      color: "595959", fontSize: 12, align: "center", valign: "middle", objectName: "placeholder " + file,
    });
  }
}
// browser frame: rounded window with a title bar (three dots) and the screenshot below
function browser(slide, file, x, y, w, imgRatio, name) {
  const bar = 0.32, ih = w / imgRatio;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: ih + bar, rectRadius: 0.1, fill: { color: "E3E8E5" }, line: { color: "C9D1CD", width: 0.75 }, shadow: shadow(), objectName: name + " browser frame" });
  dots(slide, x + 0.15, y + 0.1, 0.12, 0.07, name + " window dots");
  if (hasShot(file)) slide.addImage({ path: shotPath(file), x, y: y + bar, w, h: ih, objectName: name, altText: name });
  else image(slide, file, x, y + bar, w, ih, name);
  return ih + bar;
}
async function callout(slide, Comp, head, body, x, y, w, o = {}) {
  const d = o.d || 0.6;
  await iconCircle(slide, Comp, x, y, d, o.fill || C.green, HEX.white, head + " icon");
  text(slide, [
    { text: head, options: { bold: true, fontSize: o.headSize || 17, color: C.dark, breakLine: true } },
    { text: body, options: { fontSize: o.bodySize || 15, color: C.text } },
  ], { x: x + d + 0.25, y: y - 0.02, w: w - d - 0.25, h: o.h || 0.95 });
}
function caption(slide, t, x, y, w, align = "center") {
  text(slide, t, { x, y, w, h: 0.3, fontSize: 11, color: C.muted, align });
}

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "Title dark",
  background: { color: HEX.dark },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 2.2, w: 7.4, h: 1.0, fontSize: 40, bold: true, color: C.white, align: "left", valign: "middle", margin: 0 }, text: "" } }],
});
pres.defineSlideMaster({
  title: "Content",
  background: { color: HEX.white },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.5, w: CW, h: 0.85, fontSize: 36, bold: true, color: C.dark, align: "left", valign: "middle", margin: 0 }, text: "" } }],
  slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.muted, align: "right" },
});
pres.defineSlideMaster({
  title: "Closing dark",
  background: { color: HEX.dark },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.5, w: 9.5, h: 0.85, fontSize: 40, bold: true, color: C.white, align: "left", valign: "middle", margin: 0 }, text: "" } }],
});

async function build() {
  // ===== 1. Title =====
  pres.addSection({ title: "Opening" });
  let s = pres.addSlide({ masterName: "Title dark", sectionTitle: "Opening" });
  s.addText("Kafo Signal", { placeholder: "title" });
  text(s, "From farm information to a decision — and a buyer who pays", { x: M, y: 3.3, w: 6.0, h: 1.0, fontSize: 22, color: C.surface });
  text(s, "UTG ITCA Hackathon 2026 · Challenge 02  ·  Linear Growth", { x: M, y: 6.3, w: 7.4, h: 0.4, fontSize: 12, color: C.surface });
  // large traffic light with matching pills
  const hx = 10.1, hy = 0.9, hw = 1.9, hh = 5.7, d = 1.4;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: hx, y: hy, w: hw, h: hh, rectRadius: 0.4, fill: { color: C.text }, line: { type: "none" }, objectName: "traffic light housing" });
  [["avoid", C.red], ["careful", C.yellow], ["good", C.green]].forEach(([k, c], i) => {
    const cy = hy + 0.35 + i * 1.8;
    s.addShape(pres.shapes.OVAL, { x: hx + (hw - d) / 2, y: cy, w: d, h: d, fill: { color: c }, line: { type: "none" }, objectName: `light ${k}` });
    sigPill(s, k, hx - 2.05, cy + d / 2 - 0.22, 1.75, 0.44, 14);
  });
  s.addNotes("Women's garden groups in The Gambia don't lack information. They lack a clear answer and a buyer. Kafo Signal gives both.\n\n(One-line pitch: The Gambia already has price and advice services — what's missing is the step from information to a decision, and from a decision to a buyer who pays. Kafo Signal gives a clear answer and a real order.)");

  // ===== 2. Problem =====
  pres.addSection({ title: "Problem" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
  s.addText("Farmers get numbers, not decisions", { placeholder: "title" });
  const stats = [
    ["1 : 3,000", "extension workers to farmers", "Dept. of Agriculture, 2025"],
    ["22%", "farm households with any market information", "Agricultural Census 2011/12"],
    ["Up to 50%", "of vegetables lost after harvest", "Gambia + Sub-Saharan Africa · AfDB 2026"],
  ];
  const sw = (CW - 0.8) / 3;
  stats.forEach(([big, label, src], i) => {
    const x = M + i * (sw + 0.4);
    card(s, x, 1.7, sw, 3.2, { name: "stat card " + (i + 1) });
    text(s, big, { x: x + 0.35, y: 1.95, w: sw - 0.5, h: 1.1, fontFace: HEAD, fontSize: 46, bold: true, color: i === 2 ? C.red : C.dark, valign: "middle" });
    text(s, label, { x: x + 0.35, y: 3.15, w: sw - 0.7, h: 0.9, fontSize: 18, color: C.text });
    text(s, src, { x: x + 0.35, y: 4.3, w: sw - 0.7, h: 0.35, fontSize: 11, color: C.muted });
  });
  // chain: same crop -> glut -> giveaway prices -> spoilage
  const chain = [
    ["Everyone plants tomato at the same time", C.surface, C.dark],
    ["!  Glut", C.yellow, C.text],
    ["✕  “Giveaway” prices", C.red, C.white],
    ["✕  Spoilage", C.red, C.white],
  ];
  const cws = [4.1, 1.9, 2.7, 1.9];
  let cx = M; const cy2 = 5.55, ch = 0.6;
  chain.forEach(([t, f, c], i) => {
    pill(s, t, cx, cy2, cws[i], ch, f, c, 15, "chain " + (i + 1));
    if (i < chain.length - 1) arrow(s, cx + cws[i] + 0.1, cy2 + ch / 2, cx + cws[i] + 0.4, cy2 + ch / 2);
    cx += cws[i] + 0.5;
  });
  s.addNotes("Women do most vegetable farming; ~41% of adults can't read; women's literacy 47% vs men 67%; Mandinka is almost absent from speech technology.\n\nSources: 1:3,000 extension ratio (DG of Agriculture, May 2025); 22.1% market-information access (Agricultural Census 2011/12); \"up to half\" of vegetables lost (AfDB via AllAfrica, Jun 2026); adult literacy 58.7%.");

  // ===== 3. What exists =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
  s.addText("The pipes exist. The last step is missing", { placeholder: "title" });
  const exist = [
    [fa.FaChartLine, "Marché Kibaroo", "Voice price service · 29 markets · English + 5 local languages"],
    [fa.FaPhoneAlt, "Senenyaa Bantabaa", "Government e-extension phone line · 4 languages"],
    [fa.FaWhatsapp, "Jokkalante", "WhatsApp buyer linkage · needs smartphone + data"],
  ];
  for (let i = 0; i < exist.length; i++) {
    const [ic, name, line] = exist[i]; const y = 1.65 + i * 1.6;
    card(s, M, y, 6.3, 1.35, { name: name + " card" });
    await iconCircle(s, ic, M + 0.3, y + 0.35, 0.65, C.dark, HEX.white, name);
    text(s, [{ text: name, options: { bold: true, fontSize: 18, color: C.dark, breakLine: true } }, { text: line, options: { fontSize: 15 } }],
      { x: M + 1.2, y: y + 0.22, w: 4.9, h: 0.95 });
  }
  arrow(s, 7.2, 4.0, 8.0, 4.0, C.dark, "arrow to gap");
  card(s, 8.3, 1.65, W - M - 8.3, 4.55, { fill: C.white, line: { color: C.red, width: 2.5 }, name: "gap card" });
  sigPill(s, "avoid", 8.65, 2.0, 1.9, 0.45, 14, "THE GAP");
  text(s, [
    { text: "No one turns information into ", options: { fontSize: 20 } },
    { text: "what to do.", options: { fontSize: 20, bold: true, italic: true, color: C.dark, breakLine: true } },
    { text: " ", options: { fontSize: 12, breakLine: true } },
    { text: "No one guarantees a buyer ", options: { fontSize: 20 } },
    { text: "before planting.", options: { fontSize: 20, bold: true, italic: true, color: C.dark } },
  ], { x: 8.65, y: 2.8, w: 3.75, h: 3.0 });
  s.addNotes("We plug into these, we don't compete. Marché Kibaroo prices are a data source for us. All are donor-funded; ROOTS ends ~2027 — so a buyer-funded model matters.\n\n(Existing services have no published usage data.)");

  // ===== 4. Solution =====
  pres.addSection({ title: "Solution" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
  s.addText("One answer everyone understands", { placeholder: "title" });
  const colX = 3.3, colW = (W - M - colX - 0.4) / 3;
  ["good", "careful", "avoid"].forEach((k, i) => sigPill(s, k, colX + i * (colW + 0.2), 1.6, colW, 0.5, 16));
  const rows = [
    [fa.FaSeedling, "What to plant", ["Little competition, buyer waiting", "Many kafos planting", "Glut coming"]],
    [fa.FaStore, "Where to sell", ["Good price or confirmed buyer", "Average — compare or wait", "Price crash, don't travel"]],
    [fa.FaExclamationTriangle, "Risk alert", ["All OK", "Watch out", "Act now"]],
  ];
  for (let r = 0; r < rows.length; r++) {
    const [ic, label, cells] = rows[r]; const y = 2.3 + r * 1.0;
    await iconCircle(s, ic, M, y + 0.13, 0.6, C.dark, HEX.white, label);
    text(s, label, { x: M + 0.8, y, w: 1.9, h: 0.85, fontSize: 17, bold: true, color: C.dark, valign: "middle" });
    cells.forEach((t, i) => {
      card(s, colX + i * (colW + 0.2), y, colW, 0.85, { name: `${label} ${i}` });
      text(s, t, { x: colX + i * (colW + 0.2) + 0.2, y, w: colW - 0.4, h: 0.85, fontSize: 15, valign: "middle" });
    });
  }
  // bottom strip: same answer three ways
  card(s, M, 5.65, CW, 1.05, { fill: C.dark, name: "three ways strip" });
  text(s, "Same answer as", { x: M + 0.3, y: 5.65, w: 1.7, h: 1.05, fontSize: 15, color: C.surface, valign: "middle" });
  const ways = [[fa.FaTh, "Colour tile", "leader app"], [fa.FaMobileAlt, "One word", "basic phone"], [fa.FaVolumeUp, "Spoken sentence", "voice call"]];
  for (let i = 0; i < ways.length; i++) {
    const [ic, a, b] = ways[i]; const x = M + 2.2 + i * 3.3;
    await iconCircle(s, ic, x, 5.87, 0.6, C.green, HEX.white, a);
    text(s, [{ text: a, options: { bold: true, color: C.white, fontSize: 16, breakLine: true } }, { text: b, options: { color: C.surface, fontSize: 13 } }],
      { x: x + 0.75, y: 5.8, w: 2.4, h: 0.75, valign: "middle" });
  }
  s.addNotes("How each answer is decided (rules-based, no AI — transparent, works with little data, and every answer shows its reason, e.g. \"Avoid tomato: 14 kafos are already growing it\"):\n- What to plant? Amount already planted vs. what buyers ordered. Lots planted + few orders → AVOID. Little planted + buyer waiting → GOOD.\n- Where to sell? Market price minus transport, vs. usual price. A confirmed buyer is always GOOD. Old prices are never shown (\"no recent price\").\n- Is anything coming? Farmer reports alone only reach CAREFUL. ACT NOW needs the leader to confirm, or an official warning.\n\nThe same answer reaches each user in their channel: a colour tile in the leader app, one word on the basic phone, a spoken sentence on the voice line.");

  // ===== 5. Season flow =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
  s.addText("The buyer's order comes before planting", { placeholder: "title" });
  const steps = [
    [fa.FaHotel, "Buyer posts order"], [fa.FaMobileAlt, "Farmer asks “what to plant?”"], [fa.FaClipboardCheck, "Leader accepts & logs planting"],
    [fa.FaCloudShowersHeavy, "Alerts while growing"], [fa.FaBalanceScale, "Weigh & deliver"], [fa.FaMoneyBillWave, "Each farmer paid by mobile money"],
  ];
  const gap = 0.35, stw = (CW - 5 * gap) / 6;
  // two bands: before planting / growing & harvest
  card(s, M - 0.1, 1.55, 3 * stw + 2 * gap + 0.2, 3.05, { fill: C.surface, name: "band before planting" });
  card(s, M + 3 * (stw + gap) - 0.1, 1.55, 3 * stw + 2 * gap + 0.2, 3.05, { fill: C.white, line: { color: "D5DDD8", width: 1 }, name: "band growing" });
  text(s, "BEFORE PLANTING", { x: M + 0.1, y: 1.7, w: 3, h: 0.3, fontSize: 12, bold: true, color: C.green, charSpacing: 1 });
  text(s, "GROWING → HARVEST → PAID", { x: M + 3 * (stw + gap) + 0.1, y: 1.7, w: 4, h: 0.3, fontSize: 12, bold: true, color: C.muted, charSpacing: 1 });
  for (let i = 0; i < steps.length; i++) {
    const [ic, label] = steps[i]; const x = M + i * (stw + gap); const dd = 1.05;
    await iconCircle(s, ic, x + (stw - dd) / 2, 2.25, dd, i === 0 ? C.green : C.dark, HEX.white, label);
    pill(s, String(i + 1), x + (stw - dd) / 2 - 0.05, 2.15, 0.38, 0.38, C.yellow, C.text, 12, "step number " + (i + 1));
    text(s, label, { x, y: 3.5, w: stw, h: 1.2, fontSize: 15, align: "center", bold: i === 0, color: C.text });
    if (i < steps.length - 1) arrow(s, x + (stw + dd) / 2 + 0.08, 2.775, x + stw + gap + (stw - dd) / 2 - 0.08, 2.775, C.muted, "flow arrow " + (i + 1));
  }
  card(s, M, 5.35, CW, 1.2, { fill: C.white, line: { color: C.green, width: 1.5 }, name: "key design card" });
  sigPill(s, "good", M + 0.3, 5.73, 2.4, 0.44, 14, "Key design choice");
  text(s, [
    { text: "The order comes first — so ", options: {} },
    { text: "“Okra: GOOD, buyer waiting”", options: { bold: true, color: C.dark } },
    { text: " is real, and not every kafo plants tomato.", options: {} },
  ], { x: M + 3.0, y: 5.35, w: CW - 3.3, h: 1.2, fontSize: 17, valign: "middle" });
  s.addNotes("This order is the key design choice: it's what lets us say \"okra is GOOD, a buyer is waiting\" and stops every kafo planting tomato.\n\nDemo story (\"Fatou's season\"): Hotel posts 150 kg okra in ~10 weeks → farmer dials *1234#, sees Tomato: DON'T PLANT · Okra: GOOD, buyer waiting → leader accepts order, logs 40 beds → insect reports turn okra YELLOW → heavy rain warning: SMS + call \"ACT NOW, harvest early\" → leader weighs each woman's okra → buyer pays each farmer directly by Wave → SMS \"PAID 38 kg okra\".");

  // ===== 6. Demo: farmer =====
  pres.addSection({ title: "Demo (prototype)" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Demo (prototype)" });
  s.addText("Works on any phone, no internet", { placeholder: "title" });
  tag(s, "demo");
  const pr = 560 / 1130; // phone screenshot ratio
  const ph = 5.05, pw = ph * pr;
  image(s, "01-ussd-menu.png", M, 1.5, pw, ph, "Basic phone: *1234# main menu");
  image(s, "02-ussd-answer.png", M + pw + 0.35, 1.5, pw, ph, "Basic phone: what to plant answer");
  const sh3 = 4.1, sw3 = sh3 * pr;
  image(s, "03-sms-alert.png", M + 2 * (pw + 0.35), 1.5 + ph - sh3, sw3, sh3, "Basic phone: ACT NOW heavy-rain SMS");
  caption(s, "Main menu", M, 6.65, pw);
  caption(s, "1 What to plant", M + pw + 0.35, 6.65, pw);
  caption(s, "SMS alert", M + 2 * (pw + 0.35), 6.65, sw3);
  const cX = 8.75, cW = W - M - cX;
  await callout(s, fa.FaHashtag, "*1234#", "Free text menu", cX, 1.9, cW);
  await callout(s, fa.FaPhoneVolume, "*4321#", "Free call-back in her language", cX, 3.35, cW);
  await callout(s, fa.FaSms, "Key word first", "Every message starts with it: GOOD, ACT NOW, PAID", cX, 4.8, cW, { h: 1.2 });
  s.addNotes("USSD runs on 2G with no data bundle. Voice uses pre-recorded clips because speech tech barely supports Mandinka.\n\nWhat the judges see: the on-screen phone simulator from our live demo site (Awa, Brikama kafo). Left: the *1234# main menu. Middle: \"1 What to plant\" — Tomato: DON'T PLANT, Onion: CAREFUL, Pepper: GOOD TO PLANT, Okra: GOOD-buyer waiting (the screen is scrolled one line so the okra answer is complete). Right: Binta's inbox after the admin triggers heavy rain — \"ACT NOW: Heavy rain in 2 days. Harvest ripe crops early.\"\n\nThis is a prototype: USSD/SMS run in a simulator and voice is simulated. The network name shown on the drawn phone is part of the drawing — the demo is not connected to any operator. *1234# / *4321# are placeholder codes until PURA assigns real ones.");

  // ===== 7. Demo: leader =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Demo (prototype)" });
  s.addText("One trusted leader decides for 200 women", { placeholder: "title" });
  tag(s, "demo");
  const lr = 756 / 1466;
  const lh = 5.05, lw = lh * lr;
  image(s, "04-leader-plant-tiles.png", M, 1.5, lw, lh, "Leader app: signal tiles per crop");
  const lh2 = 4.1, lw2 = lh2 * lr;
  image(s, "05-leader-sell-card.png", M + lw + 0.4, 1.5 + lh - lh2, lw2, lh2, "Leader app: hotel order with Accept");
  caption(s, "Home: a tile per crop", M, 6.65, lw);
  caption(s, "Sell: a buyer order", M + lw + 0.4, 6.65, lw2);
  const lX = 6.9, lW = W - M - lX;
  await callout(s, fa.FaTh, "Colour tiles + crop pictures + ♪ audio", "Shape and word on every tile, read aloud on tap", lX, 1.9, lW);
  await callout(s, fa.FaSeedling, "Logs plantings", "Powers the glut warning for every kafo", lX, 3.35, lW);
  await callout(s, fa.FaCheck, "Accept buyer orders in one tap", "Hotel needs 150 kg okra → Accept", lX, 4.8, lW);
  s.addNotes("Only verified leaders record plantings and accept orders, so one wrong entry can't mislead every kafo.\n\nScreens from the leader app (Fatou, Brikama Women's Kafo): tomato ✕ Don't plant (red), onion ! Careful (yellow), pepper and okra ✓ Good to plant (green — okra: \"A buyer is waiting\"). Note: in the app these signal tiles are on the Home tab (the Plant tab is where plantings are logged), so the screenshot shows Home. Right: the Sell tab with the Coastal Hotel (demo) order for 150 kg okra and the Accept 150 kg button. All names, prices and orders are demo data.");

  // ===== 8. Demo: buyer + payment =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Demo (prototype)" });
  s.addText("Buyers see the harvest before it exists", { placeholder: "title" });
  tag(s, "demo");
  const bh = browser(s, "06-buyer-dashboard.png", M, 1.5, 6.25, 2300 / 1800, "Buyer dashboard: harvest outlook");
  caption(s, "Harvest outlook · demo data", M, 1.5 + bh + 0.1, 6.25);
  const rX = 7.3, rW = W - M - rX;
  const ph7 = rW / (2236 / 854);
  image(s, "07-payment-confirmed.png", rX, 1.5, rW, ph7, "Buyer order card: paid to 3 farmers");
  const fph = 3.1, fpw = fph * pr;
  image(s, "07b-farmer-paid-sms.png", rX, 1.5 + ph7 + 0.35, fpw, fph, "Farmer phone: PAID SMS");
  const kX = rX + fpw + 0.35, kW = W - M - kX;
  await callout(s, fa.FaCalendarCheck, "Post orders weeks ahead", "", kX, 3.95, kW, { d: 0.5, h: 0.5, headSize: 15 });
  await callout(s, fa.FaChartBar, "Harvest outlook by crop", "", kX, 4.85, kW, { d: 0.5, h: 0.5, headSize: 15 });
  await callout(s, fa.FaMoneyBillWave, "Each farmer paid directly, SMS receipt", "", kX, 5.75, kW, { d: 0.5, h: 0.8, headSize: 15 });
  s.addNotes("Buyers pay at collection or within 48h; late payers lose their rating. Buyers see the kafo, never individual farmers' names or numbers.\n\nScreens: the buyer website for Coastal Hotel (demo) — the Harvest outlook tab (expected kg per week per crop for the next 8 weeks, from leaders' planting logs). The Post order form is on the next tab (screenshot 06b-buyer-post-order.png is in the screenshots folder if you want to show it). Top right: the 150 kg okra order after delivery — stage Paid, \"Paid D8,250 directly to 3 farmers\". Bottom: Awa's phone receives \"PAID: 38kg okra delivered. D2090 sent to your Wave.\"\n\nPayments are mocked in the prototype — nothing is connected to Wave or any mobile-money provider. Prices are demo data.");

  // ===== 9. Partners =====
  pres.addSection({ title: "Going live" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Going live" });
  s.addText("Who we work with to go live", { placeholder: "title" });
  tag(s, "live");
  const groups = [
    [fa.FaSignal, "Networks & codes", [["Africell · QCell", "host *1234#, two-way SMS, call-back voice line"], ["PURA (regulator)", "licence for the short / USSD code"]]],
    [fa.FaWallet, "Mobile-money payouts", [["Wave Payout API · Modem Pay", "pay each farmer directly by phone number, batch payouts"]]],
    [fa.FaCloudSun, "Prices & weather", [["Marché Kibaroo / MoALFS Planning · DWR · Open-Meteo", "market prices, dekadal agromet bulletins, 7-day forecast"]]],
    [fa.FaHandshake, "Buyers, reach & trust", [["Gambia Hotel Association · WFP Home-Grown School Feeding · ITC", "committed pre-harvest orders"], ["Dept. of Agriculture extension · NACOFAG · ROOTS", "kafo sign-up, leader training"]]],
  ];
  const gw = (CW - 0.3) / 2, gh = 2.5;
  for (let i = 0; i < groups.length; i++) {
    const [ic, head, items] = groups[i];
    const x = M + (i % 2) * (gw + 0.3), y = 1.55 + Math.floor(i / 2) * (gh + 0.3);
    card(s, x, y, gw, gh, { name: head + " card" });
    await iconCircle(s, ic, x + 0.3, y + 0.3, 0.6, C.green, HEX.white, head);
    text(s, head, { x: x + 1.1, y: y + 0.3, w: gw - 1.4, h: 0.6, fontSize: 19, bold: true, color: C.dark, valign: "middle" });
    const runs = [];
    items.forEach(([p, what], j) => {
      runs.push({ text: p, options: { bold: true, breakLine: true } });
      runs.push({ text: what, options: { color: C.muted, breakLine: j < items.length - 1, paraSpaceAfter: 6 } });
    });
    text(s, runs, { x: x + 1.1, y: y + 1.0, w: gw - 1.4, h: gh - 1.15, fontSize: 14 });
  }
  s.addNotes("Real world only — none of these are used in the demo.\n\nInternational SMS providers (BudgetSMS, SMS.to, Infobip) can send one-way alerts to Gambia today for roughly €0.03–0.10 per SMS, but they do not support two-way SMS or short codes in Gambia — so the USSD menu must go through Africell/QCell (or a licensed local value-added-service partner). Africa's Talking is not live in Gambia — we use its simulator only for the demo.\n\nTerms (verified): Africell/QCell — operator revenue-share terms are not public, to negotiate. PURA — D10,000 application + D25,000/yr per code; toll-free number D5,000 + D7,500/yr; social-service numbers can be exempt from annual fees. Wave enables payouts per business after a compliance check; Modem Pay is one API for Wave, QMoney, Afrimoney. Prices & weather — partnership; Open-Meteo is free. Buyers — fee per completed order. Reach & trust — partnership.");

  // ===== 10. Path to launch =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Going live" });
  s.addText("From demo to pilot in 3 steps", { placeholder: "title" });
  tag(s, "live");
  const phases = [
    ["Now — Demo", "On-screen USSD/SMS simulator, mock payments.", "Cost: D0", C.green],
    ["Pilot — 3 kafos in Brikama", "Outbound SMS via gateway · call-back voice via operator partner · real payouts via Modem Pay / Wave sandbox → live", "", C.yellow],
    ["Launch", "Own USSD code on Africell + QCell · Marché Kibaroo price feed · buyers onboarded", "", C.dark],
  ];
  const tlX = M, tlW = 7.9, pw3 = (tlW - 0.6) / 3;
  s.addShape(pres.shapes.LINE, { x: tlX + 0.35, y: 2.0, w: tlW - 0.7 - pw3 + 0.35, h: 0, line: { color: "C9D1CD", width: 3 }, objectName: "timeline line" });
  phases.forEach(([head, body, cost, col], i) => {
    const x = tlX + i * (pw3 + 0.3);
    s.addShape(pres.shapes.OVAL, { x, y: 1.65, w: 0.7, h: 0.7, fill: { color: col }, line: { color: C.white, width: 3 }, objectName: "phase dot " + (i + 1) });
    text(s, String(i + 1), { x, y: 1.65, w: 0.7, h: 0.7, fontSize: 18, bold: true, align: "center", valign: "middle", color: i === 1 ? C.text : C.white });
    text(s, head, { x, y: 2.6, w: pw3, h: 0.75, fontSize: 18, bold: true, color: C.dark });
    text(s, body, { x, y: 3.4, w: pw3, h: 2.6, fontSize: 15 });
    if (cost) pill(s, cost, x, 5.0, 1.4, 0.4, C.surface, C.dark, 14, "phase cost");
  });
  const bx = 8.95, bw = W - M - bx;
  card(s, bx, 1.55, bw, 4.6, { name: "cost box" });
  text(s, [{ text: "Year 1 cost", options: { bold: true, fontSize: 18, color: C.dark, breakLine: true } }, { text: "PURA fees only", options: { fontSize: 12, color: C.muted } }],
    { x: bx + 0.3, y: 1.75, w: bw - 0.6, h: 0.7 });
  const costRow = (label, sum, total, y) => {
    text(s, [{ text: label, options: { bold: true, breakLine: true } }, { text: sum, options: { color: C.muted, fontSize: 13 } }], { x: bx + 0.3, y, w: bw - 1.8, h: 0.75, fontSize: 15 });
    text(s, total, { x: bx + bw - 1.6, y, w: 1.3, h: 0.45, fontSize: 16, bold: true, align: "right", color: C.dark });
  };
  costRow("1 USSD code", "D10,000 + D25,000", "D35,000", 2.65);
  costRow("1 toll-free voice number", "D5,000 + D7,500", "D12,500", 3.55);
  s.addShape(pres.shapes.LINE, { x: bx + 0.3, y: 4.45, w: bw - 0.6, h: 0, line: { color: "C9D1CD", width: 1 }, objectName: "cost divider" });
  text(s, "Total ≈ D47,500", { x: bx + 0.3, y: 4.6, w: bw - 0.6, h: 0.55, fontFace: HEAD, fontSize: 24, bold: true, color: C.dark });
  text(s, "before operator revenue share — or apply for the social-service fee exemption", { x: bx + 0.3, y: 5.2, w: bw - 0.6, h: 0.8, fontSize: 13, color: C.muted });
  s.addNotes("Cost-saving option: use ONE code (*1234#, with \"6 = Call me\") instead of two, which halves code fees. Two alternatives to a full PURA licence: (a) run under an operator's existing code as a partner service, (b) partner with a licensed value-added-service provider (a VAS licence itself is D75,000 + US$10,000 for 5 years — too big for us now).\n\nCheck before presenting: the PURA 2026 fee regulations come into force on a date the Minister gazettes — confirm with PURA that they apply now. PURA may also waive fees for public interest, innovation or small community operators.");

  // ===== 11. Closing =====
  pres.addSection({ title: "Close" });
  s = pres.addSlide({ masterName: "Closing dark", sectionTitle: "Close" });
  s.addText("Free for farmers. Paid by sales", { placeholder: "title" });
  dots(s, W - M - 1.2, 0.72, 0.32, 0.12);
  const colW2 = (CW - 0.3) / 2;
  const darkCard = (x) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.65, w: colW2, h: 3.4, rectRadius: 0.12, fill: { color: C.white, transparency: 90 }, line: { color: C.white, width: 0.75, transparency: 70 }, objectName: "closing card" });
  darkCard(M); darkCard(M + colW2 + 0.3);
  await iconCircle(s, fa.FaCoins, M + 0.35, 1.95, 0.6, C.green, HEX.white, "business model");
  text(s, "Business model", { x: M + 1.15, y: 1.95, w: colW2 - 1.5, h: 0.6, fontSize: 20, bold: true, color: C.white, valign: "middle" });
  text(s, [
    { text: "Buyers pay ~2–3% on each completed order.", options: { bold: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: "Farmer-paid models failed elsewhere (Esoko); business- and sale-funded ones survived.", options: { color: C.surface } },
  ], { x: M + 0.35, y: 2.85, w: colW2 - 0.7, h: 2.2, fontSize: 16, color: C.white });
  const tX = M + colW2 + 0.3;
  await iconCircle(s, fa.FaShieldAlt, tX + 0.35, 1.95, 0.6, C.green, HEX.white, "trust");
  text(s, "Trust built in", { x: tX + 1.15, y: 1.95, w: colW2 - 1.5, h: 0.6, fontSize: 20, bold: true, color: C.white, valign: "middle" });
  const trust = ["Verified leaders & buyers", "Every answer shows its reason", "Each farmer paid directly, with SMS receipt", "Buyers can't cancel after planting"];
  text(s, trust.map((t, i) => ({ text: "✓  " + t, options: { breakLine: i < trust.length - 1, paraSpaceAfter: 6 } })),
    { x: tX + 0.35, y: 2.85, w: colW2 - 0.7, h: 2.2, fontSize: 16, color: C.white });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.6, w: CW, h: 1.1, rectRadius: 0.12, fill: { color: C.white }, line: { type: "none" }, objectName: "ask strip" });
  pill(s, "Our ask", M + 0.3, 5.92, 1.5, 0.46, C.yellow, C.text, 15, "ask pill");
  text(s, "Pilot with 3 kafos in Brikama · Intro to Africell & QCell · PURA social-service exemption · Marché Kibaroo price feed",
    { x: M + 2.05, y: 5.6, w: CW - 2.25, h: 1.1, fontSize: 15, bold: true, color: C.dark, valign: "middle" });
  s.addNotes("Close on Fatou: \"She didn't get more data. She got an answer, a buyer, and her money on her phone.\"\n\n(If asked about data protection: the Personal Data Protection and Privacy Act 2025 requires consent for storing farmer phone and location data — we ask for consent at sign-up.)");

  // ===== Appendix =====
  pres.addSection({ title: "Appendix" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Appendix" });
  s.addText("Appendix: facts we checked", { placeholder: "title" });
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.dark } } });
  const facts = [
    ["Extension workers to farmers", "1 : 3,000", "DG of Agriculture, May 2025"],
    ["Farm households with market information", "22.1%", "Agricultural Census 2011/12"],
    ["Vegetables lost after harvest", "Up to half", "AfDB via AllAfrica, Jun 2026"],
    ["Adult literacy", "58.7% · women 47% vs men 67%", "Team research report"],
    ["PURA short / USSD code", "D10,000 + D25,000/yr; social-service exempt from annual fees", "PURA Unified Fees Regulations 2026"],
    ["PURA toll-free number · VAS licence", "D5,000 + D7,500/yr · D75,000 + US$10,000 (5 yrs)", "PURA Unified Fees Regulations 2026"],
    ["International SMS gateways", "€0.032–0.10 per SMS; no two-way SMS or short codes", "budgetsms.net · sent.dm"],
    ["Africa's Talking", "Gambia not listed → simulator only", "help.africastalking.com"],
    ["Marché Kibaroo", "29 markets · English + 5 local languages", "marchekibaroo.org"],
    ["WFP school feeding (2025)", "167,105 children in 422 schools", "WFP"],
    ["Wave agents in Gambia", "1,900+", "Taptap Send help"],
    ["Phone numbers", "9 digits for Africell/QCell/Comium since 4 Sep 2026", "Twilio · osiris.sn"],
  ];
  const rowsT = [[hdr("Fact"), hdr("Number"), hdr("Source")], ...facts.map((r, i) => r.map((t, j) => ({ text: t, options: { bold: j === 1, color: j === 2 ? C.muted : C.text, fill: { color: i % 2 ? C.white : C.surface } } })))];
  s.addTable(rowsT, { x: M, y: 1.5, w: CW, colW: [3.9, 4.9, CW - 8.8], fontSize: 12, rowH: 0.36, valign: "middle", border: { type: "solid", pt: 0.5, color: "D5DDD8" }, margin: [0.03, 0.1, 0.03, 0.1], objectName: "facts table" });
  s.addNotes("Sources (Section 6 of the build guide):\n- PURA Unified Fees Regulations 2026: https://pura.gm/wp-content/uploads/2026/04/PURA-Unified-Fees-Regulations-2026.pdf\n- Gambia SMS guide (no two-way SMS / short codes; Africell largest share): https://www.sent.dm/en/resources/sms-compliance/gambia-sms-guide\n- SMS gateway prices: https://budgetsms.net/sms-gateway-pricing/gm/gambia\n- Gamcel sender IDs registered in advance: https://d7networks.com/sms/gambia/\n- 9-digit numbering: https://static0.twilio.com/en-us/guidelines/gm/sms · https://osiris.sn/telephonie-la-gambie-annonce-le-passage-aux-numeros-a-neuf-chiffres-pour.html\n- Africa's Talking countries: https://help.africastalking.com/en/articles/2727792-which-countries-are-africa-s-talking-products-in\n- Viamo 3-2-1: https://hifa.org/node/96850142\n- Wave Business API: https://providers.apievangelist.com/providers/wave-mobile-money/ · payouts per business: https://packagist.org/packages/thales/wave · agents: https://help.taptapsend.com/en/receiving-countries/how-can-i-send-money-to-the-gambia\n- Modem Pay: https://vc4a.com/ventures/modem-pay-limited · Afrimoney APIs: https://www.africell.com/?p=939\n- Marché Kibaroo: https://marchekibaroo.org/post/twenty-one-markets-of-the-mis\n- Gambia Hotel Association B2B: https://academicnewsletter.sufe.edu.cn/info/461856\n- WFP school feeding: https://docs.wfp.org/api/documents/WFP-0000172828/download · WFP + ITC women farmers: https://news.fundsforngos.org/2026/09/18/gambia-women-farmers-local-food-schools/\n- Problem stats: team research report and challenge brief.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
}
build().catch((e) => { console.error(e); process.exit(1); });
