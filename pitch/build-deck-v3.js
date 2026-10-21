// Builds pitch/kafo-signal-deck-v3.pptx (v2 + plain-language stats + app update: okra order at D105/kg, order step log).  Run: node build-deck-v3.js
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const { applyTheme } = require("./apply_theme.js");

const OUT = path.join(__dirname, process.env.DECK_OUT || "kafo-signal-deck-v3.pptx"); // DECK_OUT lets us write a new file while v2 is open in PowerPoint
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

// slide-number label (manual, so the optional demo divider doesn't shift the guide's numbering)
function num(slide, n, dark = false) {
  text(slide, String(n), { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: dark ? C.surface : C.muted, align: "right" });
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
});
pres.defineSlideMaster({
  title: "Closing dark",
  background: { color: HEX.dark },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: M, y: 0.5, w: 9.5, h: 0.85, fontSize: 40, bold: true, color: C.white, align: "left", valign: "middle", margin: 0 }, text: "" } }],
});

const TIMING = "Timing (7-minute slot):slides 1–6 in 2:30 · live demo 2:30 · slides 10–13 in 2:00. Slides 7–9 only if the live demo fails.";
const RISK_RULE = "Risk: an official alert issued by the admin — e.g. from a DWR bulletin, or from the Open-Meteo 7-day forecast cached in the app, which offers to pre-fill a heavy-rain alert for any day with ≥ 30 mm — or ≥ 3 pest reports from the area within 7 days. Farmer reports alone reach only CAREFUL; ACT NOW needs a leader-confirmed report or an official alert. Alerts count from up to 7 days before they start.";

async function build() {
  // ===== 1. Title =====
  pres.addSection({ title: "Opening" });
  let s = pres.addSlide({ masterName: "Title dark", sectionTitle: "Opening" });
  s.addText("Kafo Signal", { placeholder: "title" });
  text(s, "From farm information to a decision, and a buyer who pays", { x: M, y: 3.3, w: 6.2, h: 1.0, fontSize: 22, color: C.surface });
  text(s, "UTG ITCA Hackathon 2026 · Challenge 02  ·  Linear Growth", { x: M, y: 6.3, w: 7.4, h: 0.4, fontSize: 12, color: C.surface });
  const hx = 10.1, hy = 0.9, hw = 1.9, hh = 5.7, d = 1.4;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: hx, y: hy, w: hw, h: hh, rectRadius: 0.4, fill: { color: C.text }, line: { type: "none" }, objectName: "traffic light housing" });
  [["avoid", C.red], ["careful", C.yellow], ["good", C.green]].forEach(([k, c], i) => {
    const cy = hy + 0.35 + i * 1.8;
    s.addShape(pres.shapes.OVAL, { x: hx + (hw - d) / 2, y: cy, w: d, h: d, fill: { color: c }, line: { type: "none" }, objectName: `light ${k}` });
    sigPill(s, k, hx - 2.05, cy + d / 2 - 0.22, 1.75, 0.44, 14);
  });
  s.addNotes("Opening hook (15 s): \"Every dry season, women in The Gambia's garden groups all plant tomato, the price collapses, and the crop rots. They don't need more information. They need a clear answer and a buyer. That's Kafo Signal.\"\n\nOne-line pitch: The Gambia already has price and advice services. What's missing is the step from information to a decision, and from a decision to a buyer who pays.\n\n" + TIMING + "\n\nTeam: Linear Growth.");

  // ===== 2. Meet Fatou =====
  pres.addSection({ title: "Problem" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
  s.addText("Meet Fatou, kafo leader in Brikama", { placeholder: "title" });
  // illustrated persona (shapes only — a composite, not a real person)
  const px = M, py = 1.55, pw = 4.3, ph = 4.0;
  card(s, px, py, pw, ph, { name: "persona card" });
  const cx = px + pw / 2;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx - 1.05, y: py + 2.05, w: 2.1, h: 1.3, rectRadius: 0.55, fill: { color: C.green }, line: { type: "none" }, objectName: "persona body" });
  s.addShape(pres.shapes.OVAL, { x: cx - 0.5, y: py + 0.95, w: 1.0, h: 1.0, fill: { color: C.dark }, line: { type: "none" }, objectName: "persona head" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx - 0.62, y: py + 0.55, w: 1.24, h: 0.62, rectRadius: 0.3, fill: { color: C.yellow }, line: { type: "none" }, objectName: "persona head wrap" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx + 0.55, y: py + 2.35, w: 0.36, h: 0.62, rectRadius: 0.06, fill: { color: C.text }, line: { color: C.white, width: 1.5 }, objectName: "persona basic phone" });
  s.addShape(pres.shapes.RECTANGLE, { x: cx + 0.6, y: py + 2.42, w: 0.26, h: 0.2, fill: { color: C.surface }, line: { type: "none" }, objectName: "persona phone screen" });
  await iconCircle(s, fa.FaSeedling, px + 0.35, py + 2.6, 0.6, C.white, HEX.green, "persona seedling");
  text(s, "Fatou · composite persona", { x: px, y: py + ph - 0.42, w: pw, h: 0.3, fontSize: 11, color: C.muted, align: "center" });
  const facts = [
    [fa.FaUsers, [{ text: "~200 women", options: { bold: true } }, { text: " share one garden, about 4 beds each" }]],
    [fa.FaMobileAlt, [{ text: "Basic phone", options: { bold: true } }, { text: " · reads little English · speaks Mandinka" }]],
    [fa.FaQuestion, [{ text: "Sells at harvest to " }, { text: "whoever shows up", options: { bold: true } }, { text: ", with no reference price" }]],
  ];
  for (let i = 0; i < facts.length; i++) {
    const y = 1.75 + i * 1.25;
    await iconCircle(s, facts[i][0], 5.45, y, 0.7, C.dark, HEX.white, "fact " + (i + 1));
    text(s, facts[i][1], { x: 6.4, y: y - 0.05, w: W - M - 6.4, h: 0.8, fontSize: 19, valign: "middle" });
  }
  card(s, M, 5.85, CW, 0.9, { fill: C.dark, name: "stat strip" });
  const strip = [["6,600 women", "farm in 33 NEMA community gardens"], ["47% of women", "can read (men: 67%)"], ["76% of women", "own a phone (men: 86%)"]];
  const sx = [M + 0.3, M + 4.75, M + 8.2], swd = [4.3, 3.3, 3.8];
  strip.forEach(([a, b], i) => text(s, [{ text: a + "  ", options: { bold: true, color: C.white } }, { text: b, options: { color: C.surface } }],
    { x: sx[i], y: 5.85, w: swd[i], h: 0.9, fontSize: 14, valign: "middle" }));
  num(s, 2);
  s.addNotes("Fatou is a composite persona built from our research, not a real person. Saruja garden: 200+ women, ~4 beds each, no storage or transport (Gambiana 2020). ROOTS is upgrading 40 gardens and building 30 new ones, so the number of kafos is growing.\n\nStat strip: 6,600 women in 33 NEMA community gardens (IISD/IFAD); women's literacy 47% vs men 67%; phone ownership 76% of women vs 86% of men (team research report).");

  // ===== 3. Problem =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
  s.addText("Farmers get numbers, not decisions", { placeholder: "title" });
  const stats = [
    ["1 adviser", "for every 3,000 farmers", "Govt. extension workers · Dept. of Agriculture, 2025"],
    ["About 1 in 5", "of farm households get any market information at all", "Agricultural Census 2011/12 (22%)"],
    ["Up to half", "of vegetables can be lost after harvest, before they are sold", "Gambia + Sub-Saharan Africa · AfDB 2026"],
  ];
  const sw = (CW - 0.8) / 3;
  stats.forEach(([big, label, src], i) => {
    const x = M + i * (sw + 0.4);
    card(s, x, 1.55, sw, 2.85, { name: "stat card " + (i + 1) });
    text(s, big, { x: x + 0.35, y: 1.75, w: sw - 0.45, h: 1.0, fontFace: HEAD, fontSize: 40, bold: true, color: i === 2 ? C.red : C.dark, valign: "middle" });
    text(s, label, { x: x + 0.35, y: 2.85, w: sw - 0.7, h: 0.85, fontSize: 18 });
    text(s, src, { x: x + 0.35, y: 3.85, w: sw - 0.7, h: 0.35, fontSize: 11, color: C.muted });
  });
  await iconCircle(s, fa.FaBalanceScale, M, 4.72, 0.5, C.yellow, HEX.text, "price gap");
  text(s, [
    { text: "Same week, July 2026: ", options: { bold: true } },
    { text: "onions D1,200/bag in Jarra Soma, D1,400 in Kerr Jatta. No official source told farmers." },
  ], { x: M + 0.7, y: 4.65, w: CW - 0.7, h: 0.65, fontSize: 16, valign: "middle" });
  const chain = [
    ["Everyone plants tomato at the same time", C.surface, C.dark],
    ["!  Glut", C.yellow, C.text],
    ["✕  “Giveaway” prices", C.red, C.white],
    ["✕  Spoilage", C.red, C.white],
  ];
  const cws = [4.1, 1.9, 2.7, 1.9];
  let chx = M; const cy2 = 5.7, ch = 0.6;
  chain.forEach(([t, f, c], i) => {
    pill(s, t, chx, cy2, cws[i], ch, f, c, 15, "chain " + (i + 1));
    if (i < chain.length - 1) arrow(s, chx + cws[i] + 0.1, cy2 + ch / 2, chx + cws[i] + 0.4, cy2 + ch / 2);
    chx += cws[i] + 0.5;
  });
  num(s, 3);
  s.addNotes("76% of farmers lose part of their harvest every year. The 50% loss figure is regional (Gambia + Sub-Saharan Africa), so say it that way. No storage means vegetables must sell within days, which kills bargaining power at glut time.\n\nOnion example: DUBAWA, July 2026 (via our research report). Sources for the cards: 1:3,000 extension ratio (DG of Agriculture, May 2025); 22.1% market-information access (Agricultural Census 2011/12); \"up to half\" lost (AfDB via AllAfrica, Jun 2026).");

  // ===== 4. What exists + what we learned =====
  pres.addSection({ title: "Solution" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
  s.addText("The pipes exist. The last step is missing", { placeholder: "title" });
  const exist = [
    [fa.FaChartLine, "Marché Kibaroo", "Voice price service · 29 markets · English + 5 local languages"],
    [fa.FaPhoneAlt, "Senenyaa Bantabaa", "Government e-extension phone line · 4 languages"],
    [fa.FaWhatsapp, "Jokkalante", "WhatsApp buyer linkage · needs smartphone + data"],
  ];
  for (let i = 0; i < exist.length; i++) {
    const [ic, name, line] = exist[i]; const y = 1.5 + i * 1.02;
    card(s, M, y, 7.0, 0.9, { name: name + " card" });
    await iconCircle(s, ic, M + 0.2, y + 0.18, 0.54, C.dark, HEX.white, name);
    text(s, [{ text: name, options: { bold: true, fontSize: 16, color: C.dark, breakLine: true } }, { text: line, options: { fontSize: 14 } }],
      { x: M + 0.95, y: y + 0.08, w: 5.9, h: 0.75, valign: "middle" });
  }
  arrow(s, 7.75, 2.95, 8.25, 2.95, C.dark, "arrow to gap");
  card(s, 8.45, 1.5, W - M - 8.45, 2.94, { fill: C.white, line: { color: C.red, width: 2.5 }, name: "gap card" });
  sigPill(s, "avoid", 8.75, 1.72, 1.8, 0.42, 13, "THE GAP");
  text(s, [
    { text: "No one turns information into ", options: {} },
    { text: "what to do.", options: { bold: true, italic: true, color: C.dark, breakLine: true } },
    { text: "No one guarantees a buyer ", options: {} },
    { text: "before planting.", options: { bold: true, italic: true, color: C.dark } },
  ], { x: 8.75, y: 2.3, w: W - M - 9.05, h: 2.0, fontSize: 17, paraSpaceAfter: 8 });
  text(s, "WHAT THE EVIDENCE SAYS → WHAT WE DID", { x: M, y: 4.7, w: 8, h: 0.3, fontSize: 12, bold: true, color: C.green, charSpacing: 1 });
  const ev = [
    [[{ text: "Price info alone: farmers got " }, { text: "only 7–10% better prices", options: { bold: true } }, { text: ", and traders can take the gains" }], "We add a committed buyer"],
    [[{ text: "Services grew only through " }, { text: "USSD / operator channels", options: { bold: true } }, { text: " (MLouma, Viamo)" }], "We use USSD + voice, not a farmer app"],
    [[{ text: "Reached " }, { text: "through their groups", options: { bold: true } }, { text: ", women's uptake rose from 10% to 48% (DigiFarm)" }], "We work through the kafo leader"],
  ];
  const ew = (CW - 0.6) / 3;
  ev.forEach(([what, did], i) => {
    const x = M + i * (ew + 0.3);
    card(s, x, 5.1, ew, 1.5, { fill: C.white, line: { color: "D5DDD8", width: 1 }, name: "evidence " + (i + 1) });
    text(s, what, { x: x + 0.2, y: 5.2, w: ew - 0.4, h: 0.85, fontSize: 14 });
    text(s, "→ " + did, { x: x + 0.2, y: 5.95, w: ew - 0.4, h: 0.5, fontSize: 14, bold: true, color: C.green, valign: "middle" });
  });
  num(s, 4);
  s.addNotes("We plug into these services, we don't compete: Marché Kibaroo prices are a data source for us. All are donor-funded; ROOTS ends ~2027, so a buyer-funded model matters.\n\nEvidence: Courtois & Subervie (Ghana/Esoko): about +10% maize, +7% groundnut. Mozambique (Zant 2024): producer prices fell 8–14% while traders gained. Esoko stopped selling farmer-paid price services in 2016 after heavy losses. Services that scaled went through USSD/operator channels (MLouma, Viamo). Women's uptake rose when reached through their groups (DigiFarm: 10% → 48%).\n\nOur improvement is turning information into a decision AND a guaranteed sale.");

  // ===== 5. One answer =====
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
  card(s, M, 5.65, CW, 1.05, { fill: C.dark, name: "three ways strip" });
  text(s, "Same answer as", { x: M + 0.3, y: 5.65, w: 1.7, h: 1.05, fontSize: 15, color: C.surface, valign: "middle" });
  const ways = [[fa.FaTh, "Colour tile", "leader app"], [fa.FaMobileAlt, "One word", "basic phone"], [fa.FaVolumeUp, "Spoken sentence", "voice call"]];
  for (let i = 0; i < ways.length; i++) {
    const [ic, a, b] = ways[i]; const x = M + 2.2 + i * 3.3;
    await iconCircle(s, ic, x, 5.87, 0.6, C.green, HEX.white, a);
    text(s, [{ text: a, options: { bold: true, color: C.white, fontSize: 16, breakLine: true } }, { text: b, options: { color: C.surface, fontSize: 13 } }],
      { x: x + 0.75, y: 5.8, w: 2.4, h: 0.75, valign: "middle" });
  }
  num(s, 5);
  s.addNotes("Why it suits farmers who can't read: colour + shape + one word + a spoken sentence, so it still works in black and white, for colour-blind users, and by ear.\n\nHow each answer is decided (rules, no AI; every answer carries its reason, e.g. \"Avoid tomato: 14 kafos are already growing it\"):\n- Plant: expected supply ÷ buyer demand — below 0.8 GOOD, 0.8–1.3 CAREFUL, above 1.3 AVOID.\n- Sell: (market price − transport) vs the 4-week average; a confirmed order is always GOOD; prices older than 14 days are hidden (\"no recent price\").\n- " + RISK_RULE);

  // ===== 6. Order before planting =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
  s.addText("The buyer's order comes before planting", { placeholder: "title" });
  const steps = [
    [fa.FaHotel, "Buyer posts order"], [fa.FaMobileAlt, "Farmer asks “what to plant?”"], [fa.FaClipboardCheck, "Leader accepts & logs planting"],
    [fa.FaCloudShowersHeavy, "Alerts while growing"], [fa.FaBalanceScale, "Weigh & deliver"], [fa.FaMoneyBillWave, "Each farmer paid by mobile money"],
  ];
  const gap = 0.35, stw = (CW - 5 * gap) / 6;
  card(s, M - 0.1, 1.5, 3 * stw + 2 * gap + 0.2, 2.95, { fill: C.surface, name: "band before planting" });
  card(s, M + 3 * (stw + gap) - 0.1, 1.5, 3 * stw + 2 * gap + 0.2, 2.95, { fill: C.white, line: { color: "D5DDD8", width: 1 }, name: "band growing" });
  text(s, "BEFORE PLANTING", { x: M + 0.1, y: 1.63, w: 3, h: 0.3, fontSize: 12, bold: true, color: C.green, charSpacing: 1 });
  text(s, "GROWING → HARVEST → PAID", { x: M + 3 * (stw + gap) + 0.1, y: 1.63, w: 4, h: 0.3, fontSize: 12, bold: true, color: C.muted, charSpacing: 1 });
  for (let i = 0; i < steps.length; i++) {
    const [ic, label] = steps[i]; const x = M + i * (stw + gap); const dd = 1.0;
    await iconCircle(s, ic, x + (stw - dd) / 2, 2.1, dd, i === 0 ? C.green : C.dark, HEX.white, label);
    pill(s, String(i + 1), x + (stw - dd) / 2 - 0.05, 2.0, 0.38, 0.38, C.yellow, C.text, 12, "step number " + (i + 1));
    text(s, label, { x, y: 3.25, w: stw, h: 1.0, fontSize: 15, align: "center", bold: i === 0 });
    if (i < steps.length - 1) arrow(s, x + (stw + dd) / 2 + 0.08, 2.6, x + stw + gap + (stw - dd) / 2 - 0.08, 2.6, C.muted, "flow arrow " + (i + 1));
  }
  // proof quote
  card(s, M, 4.8, 7.6, 1.75, { fill: C.white, line: { color: C.green, width: 1.5 }, name: "quote card" });
  text(s, "“", { x: M + 0.25, y: 4.75, w: 0.6, h: 0.9, fontFace: HEAD, fontSize: 60, bold: true, color: C.green });
  text(s, "We know we have a buyer before we even plant.", { x: M + 0.95, y: 5.0, w: 6.4, h: 0.8, fontFace: HEAD, fontSize: 22, italic: true, color: C.dark, valign: "middle" });
  text(s, "Kumba Jallow, Jahaur women's group, which supplies school meals weekly (GAFSP, Mar 2026)", { x: M + 0.95, y: 5.85, w: 6.4, h: 0.5, fontSize: 12, color: C.muted });
  text(s, [
    { text: "It works when a project arranges it.", options: { breakLine: true } },
    { text: "Kafo Signal makes it the default for every kafo.", options: { bold: true, color: C.dark } },
  ], { x: 8.65, y: 4.8, w: W - M - 8.65, h: 1.75, fontSize: 18, valign: "middle", paraSpaceAfter: 6 });
  num(s, 6);
  s.addNotes("The order comes first: that's what lets us say \"okra is GOOD, a buyer is waiting\" and stops every kafo planting tomato.\n\nProof it works: the Jahaur women's group supplies school meals weekly — \"We know we have a buyer before we even plant\" (Kumba Jallow, GAFSP, Mar 2026). WFP Home-Grown School Feeding fed 164,194 children in 422 schools in 2025/26 using local suppliers. Hotels met farmers at an ITC / Gambia Hotel Association matchmaking event in early 2026. Demand exists; the problem is coordination.\n\nNext: switch to the live demo.");

  // ===== LIVE DEMO divider (no slide number) =====
  pres.addSection({ title: "Live demo" });
  s = pres.addSlide({ masterName: "Title dark", sectionTitle: "Live demo" });
  s.addText("Live demo: Fatou's season", { placeholder: "title" });
  dots(s, M, 1.6, 0.32, 0.12);
  const demo = ["Buyer posts order", "Farmer: *1234#", "Leader accepts", "Admin triggers rain", "PAID SMS"];
  const dw = (CW - 4 * 0.45) / 5;
  demo.forEach((t, i) => {
    const x = M + i * (dw + 0.45);
    pill(s, `${i + 1}  ${t}`, x, 4.0, dw, 0.62, i === demo.length - 1 ? C.green : C.white, i === demo.length - 1 ? C.white : C.dark, 15, "demo step " + (i + 1));
    if (i < demo.length - 1) arrow(s, x + dw + 0.07, 4.31, x + dw + 0.38, 4.31, C.surface, "demo arrow " + (i + 1));
  });
  text(s, "Prototype · simulated · demo data", { x: M, y: 6.3, w: 6, h: 0.4, fontSize: 12, color: C.surface });
  s.addNotes("Live demo (~2:30) on https://sirret.github.io/FarmerHackaton10/ — start with Admin → Demo → Reset demo.\n1. Buyer (Coastal Hotel) posts the okra order (Post order tab).\n2. Farmer phone: dial *1234#, press 1 → Tomato: DON'T PLANT · Okra: GOOD-buyer waiting.\n3. Leader app (Fatou): Sell → Accept 150 kg; Plant → log okra beds for the order.\n4. Admin → Demo → Trigger heavy rain in Brikama → ACT NOW SMS (+ call farmers with alert).\n5. Leader records the weighed delivery (step log: weighed → sent with proof photo → handed over with a 4-digit buyer code); buyer checks the kg, confirms and pays (mock) → farmer gets \"PAID: 38kg okra…\".\nOptional if time allows: the leader's \"Expected cash\" before accepting (150 kg × D105/kg); the buyer's live forecast (expected kg, harvest date, \"may be short\"); example history of paid orders, one on the road, one waiting for payment.\n\nIf the live demo fails (e.g. no Wi-Fi): skip to slides 7–9, which show the same story as screenshots.\nEverything here runs in our own on-page simulator; nothing is connected to an operator, PURA or a payment provider.");

  // ===== 7. Demo: farmer =====
  pres.addSection({ title: "Demo backup" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Demo backup" });
  s.addText("Works on any phone, no internet", { placeholder: "title" });
  tag(s, "demo");
  const pr = 560 / 1130;
  const ph1 = 5.05, pw1 = ph1 * pr;
  image(s, "01-ussd-menu.png", M, 1.5, pw1, ph1, "Basic phone: *1234# main menu");
  image(s, "02-ussd-answer.png", M + pw1 + 0.35, 1.5, pw1, ph1, "Basic phone: what to plant answer");
  const sh3 = 4.1, sw3 = sh3 * pr;
  image(s, "03-sms-alert.png", M + 2 * (pw1 + 0.35), 1.5 + ph1 - sh3, sw3, sh3, "Basic phone: ACT NOW heavy-rain SMS");
  caption(s, "Main menu", M, 6.65, pw1);
  caption(s, "1 What to plant", M + pw1 + 0.35, 6.65, pw1);
  caption(s, "SMS alert", M + 2 * (pw1 + 0.35), 6.65, sw3);
  const cX = 8.75, cW = W - M - cX;
  await callout(s, fa.FaHashtag, "*1234#", "Free text menu", cX, 1.6, cW, { h: 0.9 });
  await callout(s, fa.FaPhoneVolume, "*4321#", "Free call-back in her language", cX, 2.75, cW, { h: 0.9 });
  await callout(s, fa.FaSms, "Key word first", "GOOD, ACT NOW, PAID", cX, 3.9, cW, { h: 0.9 });
  await callout(s, fa.FaStopwatch, "1–2 key presses to an answer", "Longest screen 128 characters (USSD limit 182)", cX, 5.05, cW, { h: 1.2 });
  num(s, 7);
  s.addNotes("This is our own on-page phone simulator. Africa's Talking is not live in Gambia. USSD runs on 2G with no data bundle. Voice uses pre-recorded clips because speech tech barely supports Mandinka.\n\nScreens (Awa, Brikama kafo): left, the *1234# main menu; middle, \"1 What to plant\" — Tomato: DON'T PLANT, Onion: CAREFUL, Pepper: GOOD TO PLANT, Okra: GOOD-buyer waiting (scrolled one line so the okra answer is complete); right, the ACT NOW heavy-rain SMS. The network name on the drawn phone is part of the drawing — the demo is not connected to any operator. *1234# / *4321# are placeholder codes until PURA assigns real ones.\n\nUX numbers (checked on our seed data with src/lib/ussd.js, all 100 reachable screens for a farmer, also with an active heavy-rain alert): planting advice and alerts are 1 key press from the main menu, the best market 2 (pick the crop); the longest screen is the 128-character main menu, inside the 182-character USSD limit. The longest flow (\"I have produce\": crop, amount, when, confirm) takes 4 presses.");

  // ===== 8. Demo: leader =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Demo backup" });
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
  await callout(s, fa.FaCheck, "Accept buyer orders in one tap", "Sees the expected cash before accepting", lX, 4.8, lW);
  num(s, 8);
  s.addNotes("200 women is sourced: ~6,600 women across 33 gardens ≈ 200 per garden.\n\nNew in the prototype: before accepting, the leader sees the expected cash for the order (the hotel's okra order is 150 kg at D105/kg, the market average). Every order then has a step log: accepted → farmers assigned → growing → ready → harvested → weighed → sent with a proof photo → handed over with a 4-digit buyer code → buyer checks the kg → farmers paid. Losses are tracked too (field losses, a smaller harvest, rejected kg).\n\nNote: these screenshots were taken with earlier demo prices, so do not read the prices in them aloud. Current demo data: the okra order is 150 kg at D105/kg; pepper sells best in Banjul (D448/kg after transport), OK in Sukuta/Serekunda, avoid Brikama.\n\nOnly verified leaders record plantings and accept orders, so one wrong entry can't mislead every kafo.\n\nScreens (Fatou, Brikama Women's Kafo): tomato ✕ Don't plant, onion ! Careful, pepper and okra ✓ Good to plant (okra: \"A buyer is waiting\"). The signal tiles are on the app's Home tab (the Plant tab is where plantings are logged). Right: the Sell tab with the Coastal Hotel (demo) order for 150 kg okra and Accept 150 kg. All names, prices and orders are demo data.");

  // ===== 9. Demo: buyer + payment =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Demo backup" });
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
  num(s, 9);
  s.addNotes("Buyers pay at collection or within 48h; late payers lose their rating. Buyers see the kafo, never individual farmers' names or numbers.\n\nScreens: the buyer website for Coastal Hotel (demo) — Harvest outlook (expected kg per week per crop, next 8 weeks, from leaders' planting logs). Top right: the 150 kg okra order after delivery — stage Paid, each of the 3 farmers paid directly. Bottom: Awa's phone gets her \"PAID: 38kg okra delivered\" SMS. (These two screenshots were taken with an earlier demo price; the current demo order is 150 kg at D105/kg = D15,750, so don't quote the amounts shown in the pictures.)\n\nNew in the prototype: buyers see a live forecast for each order (expected kg, harvest date, \"may be short\" warning) and the kafo leader's contact. Each order has a step log: accepted → farmers assigned → growing → ready → harvested → weighed → sent with a proof photo → handed over with a 4-digit buyer code → buyer checks the kg → farmers paid. The platform already has example history: paid orders, an order on the road and one waiting for payment.\n\nPayments are mocked — Wave/QMoney/Afrimoney are labels only; nothing is connected to a payment provider. Prices are demo data.");

  // ===== 10. Under the hood =====
  pres.addSection({ title: "Technology" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
  s.addText("Simple tech, chosen on purpose", { placeholder: "title" });
  const LX = M, BW = 4.55, RX = W - M - BW, MX = LX + BW + 0.45, MW = RX - 0.45 - MX;
  pill(s, "TODAY · PROTOTYPE", LX, 1.45, BW, 0.4, C.surface, C.dark, 13, "today header");
  pill(s, "GOING LIVE", RX, 1.45, BW, 0.4, C.dark, C.white, 13, "live header");
  const arch = [
    ["Astro + Tailwind static site on GitHub Pages", "Same front end + a small server, cloud host"],
    ["Browser database: Dexie (IndexedDB) + JSON seed", "Hosted database"],
    ["Our own on-page phone simulator (USSD, SMS)", "Operator USSD gateway (session ID → CON / END)"],
    ["Recorded voice clips (*4321#), subtitles if missing", "Same clips on an IVR call-back line"],
    ["Open-Meteo forecast (cached JSON) → admin issues alert", "Open-Meteo + DWR + Marché Kibaroo prices"],
    ["Mock payment (labels only)", "Wave Payout API / Modem Pay with webhooks"],
  ];
  const rh = 0.56, rg = 0.1, ry0 = 2.0;
  arch.forEach(([a, b], i) => {
    const y = ry0 + i * (rh + rg);
    card(s, LX, y, BW, rh, { name: "today box " + (i + 1) });
    card(s, RX, y, BW, rh, { fill: C.white, line: { color: C.dark, width: 1 }, name: "live box " + (i + 1) });
    text(s, a, { x: LX + 0.18, y, w: BW - 0.3, h: rh, fontSize: 14, valign: "middle" });
    text(s, b, { x: RX + 0.18, y, w: BW - 0.3, h: rh, fontSize: 14, valign: "middle" });
    s.addShape(pres.shapes.LINE, { x: LX + BW, y: y + rh / 2, w: MX - LX - BW, h: 0, line: { color: "A9B5AF", width: 1.25 }, objectName: "link today " + (i + 1) });
    s.addShape(pres.shapes.LINE, { x: MX + MW, y: y + rh / 2, w: RX - MX - MW, h: 0, line: { color: "A9B5AF", width: 1.25 }, objectName: "link live " + (i + 1) });
  });
  const engH = 6 * rh + 5 * rg;
  card(s, MX, ry0, MW, engH, { fill: C.green, name: "rules engine box" });
  await iconCircle(s, fa.FaCogs, MX + (MW - 0.7) / 2, ry0 + 0.3, 0.7, C.white, HEX.green, "rules engine icon");
  text(s, [
    { text: "Rules engine", options: { bold: true, fontSize: 18, breakLine: true } },
    { text: "one shared JS module", options: { fontSize: 13, breakLine: true } },
    { text: " ", options: { fontSize: 8, breakLine: true } },
    { text: "plant · sell · risk", options: { fontSize: 13, breakLine: true } },
    { text: "→ tile · USSD word · voice", options: { fontSize: 13 } },
  ], { x: MX + 0.15, y: ry0 + 1.15, w: MW - 0.3, h: 2.4, color: C.white, align: "center" });
  const why = ["Rules, not AI: transparent, works with little data", "No server for the demo: runs on any laptop", "Same rules module in demo and production"];
  const ww = (CW - 0.6) / 3;
  why.forEach((t, i) => pill(s, "✓  " + t, M + i * (ww + 0.3), 6.15, ww, 0.6, C.surface, C.dark, 12, "why " + (i + 1)));
  num(s, 10);
  s.addNotes("Where it happens in the repo (so anyone can answer \"show us\"):\n- Framework: Astro (static output) + Tailwind CSS v4 + Preact islands. Hosting: GitHub Pages via GitHub Actions (.github/workflows/deploy.yml), base path /FarmerHackaton10. `npm run dev` runs locally with no server or backend (only Google Fonts need internet; offline it falls back to system fonts).\n- Rules engine: src/lib/rules.js — pure functions plantSignal / sellSignal / riskSignal. Thresholds in src/data/seed/config.json: plant_green_below 0.8, plant_red_above 1.3; sell compares price minus transport with the 4-week average (price_avg_weeks 4; sell_green_above 1.05, sell_red_below 0.9); prices older than 14 days → \"no recent price\"; report_count 3 within report_window_days 7; unverified reports only reach yellow; red needs a leader-verified report or an admin alert. src/lib/render.js: render(signal, 'tile' | 'ussd' | 'voice') turns one signal into a colour tile, a USSD word or a voice-clip chain.\n- Weather: risk is NOT computed directly from the forecast. `npm run weather` (scripts/fetch-weather.mjs) calls https://api.open-meteo.com/v1/forecast with daily=precipitation_sum,temperature_2m_max, forecast_days=7, timezone Africa/Banjul, for Brikama and Gunjur, and caches it in src/data/weather.json. The admin Alerts tab shows it and offers to pre-fill a heavy-rain alert for any day ≥ 30 mm; the admin's alert (from a template) drives the risk signal (counted from up to 7 days before it starts).\n- Database: Dexie (IndexedDB) in the browser, not sql.js — schema in src/lib/db.js; seed JSON in src/data/seed/*.json; every write goes through src/lib/actions.js; changes sync live across browser tabs.\n- Phone simulator: our own components src/components/farmer/BasicPhone.jsx + FarmerSim.jsx. The USSD menu is data (src/data/ussd/menu.json) run by the state machine src/lib/ussd.js. Voice line *4321#: src/lib/ivr.js + src/data/ivr/flow.json, clips played by src/lib/audio.js from public/audio/<lang>/ (10 Mandinka recordings in public/audio/mnk/ today; unrecorded clips fall back to subtitles + English speech). SMS are simulated rows in the browser database (src/lib/notify.js). Payments are mocked (Wave/QMoney/Afrimoney labels only).\n- Tests: Vitest, 137 tests in tests/*.test.js, including a step-by-step run of the demo story.\n\nUSSD limits we design for: 182 characters per screen, input timeout ~20–60 s, whole session ~180–300 s, so every answer arrives in under 60 s. Going live, each key press reaches our server with the session ID and we reply CON (more) or END (done).");

  // ===== 11. Partners =====
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
  num(s, 11);
  s.addNotes("Real world only — none of these are used in the demo. The demo uses our own on-page phone simulator. Africa's Talking is not live in Gambia.\n\nInternational SMS providers (BudgetSMS, SMS.to, Infobip) can send one-way alerts to Gambia today for roughly €0.03–0.10 per SMS, but they do not support two-way SMS or short codes in Gambia — so the USSD menu must go through Africell/QCell (or a licensed local value-added-service partner).\n\nTerms: Africell/QCell revenue share is not public, to negotiate. PURA: D10,000 application + D25,000/yr per code; toll-free number D5,000 + D7,500/yr; social-service numbers can be exempt from annual fees. Wave enables payouts per business after a compliance check; Modem Pay is one API for Wave, QMoney, Afrimoney. Open-Meteo is free. Buyers: fee per completed order. Reach & trust: partnership.");

  // ===== 12. Launch, pilot, cost =====
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Going live" });
  s.addText("From demo to pilot in 3 steps", { placeholder: "title" });
  tag(s, "live");
  const phases = [
    ["Now — Demo", [{ text: "On-screen USSD/SMS simulator, mock payments. " }, { text: "Cost: D0", options: { bold: true, color: C.dark } }], C.green],
    ["Pilot — 3 kafos in Brikama", [{ text: "Outbound SMS via gateway · call-back voice via operator partner · real payouts via Modem Pay / Wave sandbox → live" }], C.yellow],
    ["Launch", [{ text: "Own USSD code on Africell + QCell · Marché Kibaroo price feed · buyers onboarded" }], C.dark],
  ];
  const tlW = 7.9, pw3 = (tlW - 0.6) / 3;
  s.addShape(pres.shapes.LINE, { x: M + 0.35, y: 1.85, w: 2 * (pw3 + 0.3), h: 0, line: { color: "C9D1CD", width: 3 }, objectName: "timeline line" });
  phases.forEach(([head, body, col], i) => {
    const x = M + i * (pw3 + 0.3);
    s.addShape(pres.shapes.OVAL, { x, y: 1.55, w: 0.6, h: 0.6, fill: { color: col }, line: { color: C.white, width: 3 }, objectName: "phase dot " + (i + 1) });
    text(s, String(i + 1), { x, y: 1.55, w: 0.6, h: 0.6, fontSize: 16, bold: true, align: "center", valign: "middle", color: i === 1 ? C.text : C.white });
    text(s, head, { x, y: 2.3, w: pw3, h: 0.6, fontSize: 16, bold: true, color: C.dark });
    text(s, body, { x, y: 2.95, w: pw3, h: 1.35, fontSize: 14 });
  });
  card(s, M, 4.45, tlW, 2.35, { fill: C.white, line: { color: C.green, width: 1.5 }, name: "pilot measures box" });
  text(s, [{ text: "Pilot success measures  ", options: { bold: true, fontSize: 16, color: C.dark } }, { text: "3 kafos in Brikama · ~600 women · one dry season", options: { fontSize: 12, color: C.muted } }],
    { x: M + 0.25, y: 4.55, w: tlW - 0.5, h: 0.45, valign: "middle" });
  const measures = ["At least 6 in 10 members use *1234# or *4321# every month", "At least half the harvest sold through orders agreed in advance", "On 9 in 10 orders, farmers are paid within 2 days (48 h)", "Farm-gate vs middleman price, measured before and after"];
  const mw = (tlW - 0.75) / 2;
  measures.forEach((t, i) => text(s, "✓  " + t, { x: M + 0.25 + (i % 2) * (mw + 0.25), y: 5.1 + Math.floor(i / 2) * 0.82, w: mw, h: 0.75, fontSize: 14 }));
  const bx = 8.95, bw = W - M - bx;
  card(s, bx, 1.5, bw, 3.75, { name: "cost box" });
  text(s, [{ text: "Year 1 cost", options: { bold: true, fontSize: 17, color: C.dark, breakLine: true } }, { text: "PURA fees only", options: { fontSize: 12, color: C.muted } }],
    { x: bx + 0.3, y: 1.62, w: bw - 0.6, h: 0.65 });
  const costRow = (label, sum, total, y) => {
    text(s, [{ text: label, options: { bold: true, breakLine: true } }, { text: sum, options: { color: C.muted, fontSize: 13 } }], { x: bx + 0.3, y, w: bw - 1.8, h: 0.7, fontSize: 14 });
    text(s, total, { x: bx + bw - 1.6, y, w: 1.3, h: 0.4, fontSize: 15, bold: true, align: "right", color: C.dark });
  };
  costRow("1 USSD code", "D10,000 + D25,000", "D35,000", 2.35);
  costRow("1 toll-free voice number", "D5,000 + D7,500", "D12,500", 3.0);
  s.addShape(pres.shapes.LINE, { x: bx + 0.3, y: 3.95, w: bw - 0.6, h: 0, line: { color: "C9D1CD", width: 1 }, objectName: "cost divider" });
  text(s, "Total ≈ D47,500", { x: bx + 0.3, y: 4.0, w: bw - 0.6, h: 0.5, fontFace: HEAD, fontSize: 22, bold: true, color: C.dark });
  text(s, "before operator revenue share, or apply for the social-service fee exemption", { x: bx + 0.3, y: 4.5, w: bw - 0.6, h: 0.65, fontSize: 12, color: C.muted });
  card(s, bx, 5.45, bw, 1.15, { name: "running cost box" });
  text(s, [
    { text: "Running cost: SMS", options: { bold: true, fontSize: 15, color: C.dark, breakLine: true } },
    { text: "4–10 euro cents per SMS · ~600 farmers × ~10 SMS a season ≈ ", options: {} },
    { text: "€240–600 a season", options: { bold: true } },
  ], { x: bx + 0.3, y: 5.55, w: bw - 0.6, h: 1.15, fontSize: 13 });
  num(s, 12);
  s.addNotes("Targets are our own goals for the pilot, not results. Growth path: ROOTS-supported gardens (40 upgraded + 30 new) → more kafos with no new tech.\n\nCost-saving option: use ONE code (*1234#, with \"6 = Call me\") instead of two, which halves code fees. Alternatives to a full PURA licence: (a) run under an operator's existing code as a partner service, (b) partner with a licensed value-added-service provider (a VAS licence itself is D75,000 + US$10,000 for 5 years — too big for us now). Check with PURA that the 2026 fee regulations are in force (they start on a date the Minister gazettes).");

  // ===== 13. Model, impact, ask =====
  pres.addSection({ title: "Close" });
  s = pres.addSlide({ masterName: "Closing dark", sectionTitle: "Close" });
  s.addText("Free for farmers. Paid by sales", { placeholder: "title" });
  dots(s, W - M - 1.2, 0.72, 0.32, 0.12);
  text(s, "Success = Fatou plants what's needed, sells before harvest, and is paid on her phone.", { x: M, y: 1.4, w: CW, h: 0.5, fontSize: 18, italic: true, color: C.surface, valign: "middle" });
  const colW2 = (CW - 0.3) / 2, cy0 = 2.1, chh = 3.25;
  const darkCard = (x) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: cy0, w: colW2, h: chh, rectRadius: 0.12, fill: { color: C.white, transparency: 90 }, line: { color: C.white, width: 0.75, transparency: 70 }, objectName: "closing card" });
  darkCard(M); darkCard(M + colW2 + 0.3);
  await iconCircle(s, fa.FaCoins, M + 0.3, cy0 + 0.25, 0.55, C.green, HEX.white, "business model");
  text(s, "Business model", { x: M + 1.05, y: cy0 + 0.25, w: colW2 - 1.4, h: 0.55, fontSize: 19, bold: true, color: C.white, valign: "middle" });
  text(s, [
    { text: "Buyers pay a small fee, about D2–3 per D100, on each completed order.", options: { bold: true, breakLine: true, paraSpaceAfter: 6 } },
    { text: "Esoko stopped selling farmer-paid price services in 2016 after heavy losses.", options: { color: C.surface } },
  ], { x: M + 0.3, y: cy0 + 0.95, w: colW2 - 0.6, h: 1.15, fontSize: 15, color: C.white });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M + 0.3, y: cy0 + 2.2, w: colW2 - 0.6, h: 0.95, rectRadius: 0.08, fill: { color: C.white }, line: { type: "none" }, objectName: "unit example" });
  text(s, [
    { text: "One 150 kg okra order = D15,750 to 3 farmers", options: { bold: true, breakLine: true } },
    { text: "→ the buyer pays a D394 fee (2.5%)", options: { bold: true, breakLine: true } },
    { text: "demo prices · the prototype's fee setting", options: { fontSize: 11, color: C.muted } },
  ], { x: M + 0.45, y: cy0 + 2.2, w: colW2 - 0.9, h: 0.95, fontSize: 14, color: C.dark, valign: "middle" });
  const tX = M + colW2 + 0.3;
  await iconCircle(s, fa.FaShieldAlt, tX + 0.3, cy0 + 0.25, 0.55, C.green, HEX.white, "trust");
  text(s, "Trust built in", { x: tX + 1.05, y: cy0 + 0.25, w: colW2 - 1.4, h: 0.55, fontSize: 19, bold: true, color: C.white, valign: "middle" });
  const trust = ["Verified leaders & buyers", "Every answer shows its reason", "Each farmer paid directly, with SMS receipt", "Buyers can't cancel after planting"];
  text(s, trust.map((t, i) => ({ text: "✓  " + t, options: { breakLine: i < trust.length - 1, paraSpaceAfter: 6 } })),
    { x: tX + 0.3, y: cy0 + 0.95, w: colW2 - 0.6, h: 2.1, fontSize: 16, color: C.white });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.65, w: CW, h: 1.05, rectRadius: 0.12, fill: { color: C.white }, line: { type: "none" }, objectName: "ask strip" });
  pill(s, "Our ask", M + 0.3, 5.94, 1.5, 0.46, C.yellow, C.text, 15, "ask pill");
  text(s, "Pilot with 3 kafos in Brikama · Intro to Africell & QCell · PURA social-service exemption · Marché Kibaroo price feed",
    { x: M + 2.05, y: 5.65, w: CW - 2.25, h: 1.05, fontSize: 15, bold: true, color: C.dark, valign: "middle" });
  s.addNotes("Unit example (demo prices): one 150 kg okra order at D105/kg (the market average) pays D15,750 to 3 farmers; at the prototype's 2.5% fee the buyer pays D394 on top.\n\nHonest maths: to cover the year-1 PURA fees (D47,500) from a 2.5% fee alone takes about D1.9M of orders (≈120 orders this size). So pilot year 1 needs a partner or grant (ROOTS, ITC, WFP) and the fee covers costs as volume grows.\n\nClose: \"She didn't get more data. She got an answer, a buyer, and her money on her phone.\"\n\n(Data privacy if asked: consent at sign-up under the Personal Data Protection and Privacy Act 2025; buyers see the kafo, never individual farmers.)");

  // ===== Appendix =====
  pres.addSection({ title: "Appendix" });
  s = pres.addSlide({ masterName: "Content", sectionTitle: "Appendix" });
  s.addText("Appendix: facts we checked", { placeholder: "title" });
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.dark } } });
  const factsT = [
    ["Extension workers to farmers", "1 : 3,000", "DG of Agriculture, May 2025"],
    ["Farm households with market information", "22.1%", "Agricultural Census 2011/12"],
    ["Vegetables lost after harvest", "Up to half (Gambia + Sub-Saharan Africa)", "AfDB via AllAfrica, Jun 2026"],
    ["Literacy", "Women 47% vs men 67%", "Team research report"],
    ["Women in community gardens", "6,600 women in 33 NEMA gardens", "IISD / IFAD"],
    ["Onion price gap, same week", "D1,200 vs D1,400 per bag (Jul 2026)", "DUBAWA via team research report"],
    ["Price information alone", "+10% maize, +7% groundnut (Ghana/Esoko)", "Courtois & Subervie 2015"],
    ["Buyer before planting", "“We know we have a buyer before we even plant.”", "Kumba Jallow, Jahaur · GAFSP, Mar 2026"],
    ["WFP school feeding (2025/26)", "164,194 children in 422 schools", "WFP"],
    ["PURA short / USSD code", "D10,000 + D25,000/yr; social-service exempt", "PURA Unified Fees Regulations 2026"],
    ["PURA toll-free · VAS licence", "D5,000 + D7,500/yr · D75,000 + US$10,000 (5 yrs)", "PURA Unified Fees Regulations 2026"],
    ["International SMS gateways", "€0.032–0.10 per SMS; no two-way SMS or short codes", "budgetsms.net · sent.dm"],
    ["USSD screen limit", "182 characters per screen", "helloduty.com USSD guide"],
    ["Africa's Talking", "Gambia not listed → not used", "help.africastalking.com"],
  ];
  const rowsT = [[hdr("Fact"), hdr("Number"), hdr("Source")], ...factsT.map((r, i) => r.map((t, j) => ({ text: t, options: { bold: j === 1, color: j === 2 ? C.muted : C.text, fill: { color: i % 2 ? C.white : C.surface } } })))];
  s.addTable(rowsT, { x: M, y: 1.45, w: CW, colW: [3.5, 5.0, CW - 8.5], fontSize: 12, rowH: 0.34, valign: "middle", border: { type: "solid", pt: 0.5, color: "D5DDD8" }, margin: [0.02, 0.1, 0.02, 0.1], objectName: "facts table" });
  num(s, "A");
  s.addNotes("Sources (guide v2, Section 9):\n- 6,600 women / 33 gardens: https://sdg.iisd.org/commentary/guest-articles/the-women-transforming-the-rural-gambia-through-horticulture/\n- Jahaur quote: https://www.gafspfund.org/news/gambia-turning-post-harvest-losses-value-jahaur-village\n- School feeding \"the buyer is known\": https://allafrica.com/stories/202607020008.html\n- Onion price gap: DUBAWA, Jul 2026 (via team research report)\n- Evidence on existing approaches (via team research report): Courtois & Subervie 2015 · Nyarko et al. · Zant 2024 · Esoko (ICTworks, OD Impact) · MLouma (Orange Developer) · Viamo Mali (ILO 2026) · DigiFarm (Mercy Corps)\n- WFP Gambia: https://docs.wfp.org/api/documents/WFP-0000172828/download\n- Hotel Association matchmaking: https://academicnewsletter.sufe.edu.cn/info/461856 · tourism season +15% forecast: https://allafrica.com/stories/202610120552.html\n- PURA fees: https://pura.gm/wp-content/uploads/2026/04/PURA-Unified-Fees-Regulations-2026.pdf\n- SMS prices: https://budgetsms.net/sms-gateway-pricing/gm/gambia · no two-way SMS/short codes: https://www.sent.dm/en/resources/sms-compliance/gambia-sms-guide\n- USSD limits and CON/END flow: https://helloduty.com/blogs/the-comprehensive-guide-to-understanding-and-building-ussd-applications\n- Africa's Talking countries: https://help.africastalking.com/en/articles/2727792-which-countries-are-africa-s-talking-products-in\n- 9-digit numbers: https://static0.twilio.com/en-us/guidelines/gm/sms\n- Payments: https://providers.apievangelist.com/providers/wave-mobile-money/ · https://vc4a.com/ventures/modem-pay-limited · https://www.africell.com/?p=939\n- Problem stats: team research report and challenge brief.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
}
build().catch((e) => { console.error(e); process.exit(1); });
