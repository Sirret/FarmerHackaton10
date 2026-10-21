# Derives build-deck-v3.js from build-deck-v2.js (text-only changes from the 21 Oct app update).
# Run: python -X utf8 make-v3.py
p_in, p_out = 'build-deck-v2.js', 'build-deck-v3.js'
s = open(p_in, encoding='utf8').read()
STEP = "accepted → farmers assigned → growing → ready → harvested → weighed → sent with a proof photo → handed over with a 4-digit buyer code → buyer checks the kg → farmers paid"
BS = '\\'  # a literal backslash, for \n and \" inside the JS strings
NL = BS + 'n'
Q = BS + '"'
rep = [
    ('// Builds pitch/kafo-signal-deck-v2.pptx from kafo-signal-deck-guide-v2.md.  Run: node build-deck-v2.js',
     '// Builds pitch/kafo-signal-deck-v3.pptx (v2 + plain-language stats + app update: okra order at D105/kg, order step log).  Run: node build-deck-v3.js'),
    ('process.env.DECK_OUT || "kafo-signal-deck-v2.pptx"', 'process.env.DECK_OUT || "kafo-signal-deck-v3.pptx"'),
    ('"Accept buyer orders in one tap", "Hotel needs 150 kg okra → Accept"',
     '"Accept buyer orders in one tap", "Sees the expected cash before accepting"'),
    ('s.addNotes("200 women is sourced: ~6,600 women across 33 gardens ≈ 200 per garden.' + NL + NL,
     's.addNotes("200 women is sourced: ~6,600 women across 33 gardens ≈ 200 per garden.' + NL + NL
     + "New in the prototype: before accepting, the leader sees the expected cash for the order (the hotel's okra order is 150 kg at D105/kg, the market average). Every order then has a step log: "
     + STEP + '. Losses are tracked too (field losses, a smaller harvest, rejected kg).' + NL + NL
     + 'Note: these screenshots were taken with earlier demo prices, so do not read the prices in them aloud. Current demo data: the okra order is 150 kg at D105/kg; pepper sells best in Banjul (D448/kg after transport), OK in Sukuta/Serekunda, avoid Brikama.' + NL + NL),
    ('Top right: the 150 kg okra order after delivery — stage Paid, ' + Q + 'Paid D8,250 directly to 3 farmers' + Q
     + " (platform fee D206 at the prototype's 2.5%). Bottom: Awa's phone gets " + Q + 'PAID: 38kg okra delivered. D2090 sent to your Wave.' + Q,
     "Top right: the 150 kg okra order after delivery — stage Paid, each of the 3 farmers paid directly. Bottom: Awa's phone gets her "
     + Q + 'PAID: 38kg okra delivered' + Q + " SMS. (These two screenshots were taken with an earlier demo price; the current demo order is 150 kg at D105/kg = D15,750, so don't quote the amounts shown in the pictures.)"
     + NL + NL + "New in the prototype: buyers see a live forecast for each order (expected kg, harvest date, " + Q + 'may be short' + Q
     + " warning) and the kafo leader's contact. Each order has a step log: " + STEP
     + ". The platform already has example history: paid orders, an order on the road and one waiting for payment."),
    ('5. Leader records weighed delivery; buyer confirms collection and pays (mock) → farmer gets ' + Q + 'PAID: 38kg okra…' + Q + '.',
     '5. Leader records the weighed delivery (step log: weighed → sent with proof photo → handed over with a 4-digit buyer code); buyer checks the kg, confirms and pays (mock) → farmer gets '
     + Q + 'PAID: 38kg okra…' + Q + '.' + NL + "Optional if time allows: the leader's " + Q + 'Expected cash' + Q
     + " before accepting (150 kg × D105/kg); the buyer's live forecast (expected kg, harvest date, " + Q + 'may be short' + Q
     + "); example history of paid orders, one on the road, one waiting for payment."),
    ('{ text: "One 150 kg okra order = D8,250 to 3 farmers", options: { bold: true, breakLine: true } },',
     '{ text: "One 150 kg okra order = D15,750 to 3 farmers", options: { bold: true, breakLine: true } },'),
    ('{ text: "→ the buyer pays a D206 fee (2.5%)",', '{ text: "→ the buyer pays a D394 fee (2.5%)",'),
]
for a, b in rep:
    assert a in s, 'NOT FOUND: ' + a[:80]
    s = s.replace(a, b)
i = s.index('s.addNotes("Unit example:')
j = s.index(NL + NL + 'Close:', i)
s = (s[:i] + 's.addNotes("Unit example (demo prices): one 150 kg okra order at D105/kg (the market average) pays D15,750 to 3 farmers; '
     + "at the prototype's 2.5% fee the buyer pays D394 on top." + NL + NL
     + 'Honest maths: to cover the year-1 PURA fees (D47,500) from a 2.5% fee alone takes about D1.9M of orders (≈120 orders this size). '
     + 'So pilot year 1 needs a partner or grant (ROOTS, ITC, WFP) and the fee covers costs as volume grows.' + s[j:])
open(p_out, 'w', encoding='utf8').write(s)
print('wrote', p_out)
