// ============================================================
// CHECK CUSTOM EMOJI ID VALIDITY (run manually, not part of bot.js)
// ============================================================
// Purpose: confirm that the IDs in data/db.json (per product), emoji-id-text.js,
// and emoji-id-menu-inline.js REALLY exist / are valid on Telegram - using the
// official Bot API method "getCustomEmojiStickers". That method does NOT require
// a Premium account to call, and does NOT care who owns the emoji - it only
// answers "does this ID exist or not" and reports what the emoji actually looks
// like (via its closest unicode `emoji` field plus is_video/is_animated).
// So this purely checks whether an ID is VALID, NOT whether the bot owner
// currently has Premium active (a different matter, only visible when the bot
// actually sends a message to a real chat).
//
// Usage:
//   1. Make sure BOT_TOKEN is set in .env (the bot does not need to be running).
//   2. Run: node check-emoji.js
//   3. Read the result: ✅ VALID (the ID exists, its real emoji shape is shown)
//                       ❌ MISSING / WRONG (the ID was not found on Telegram at all)
// ============================================================

require('dotenv').config();
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN has not been set in .env');
  process.exit(1);
}

const db = require('./db');
const { EMOJI_ID_TEXT_BACKUP } = require('./emoji-id-text');
const { EMOJI_IDS } = require('./emoji-id-menu-inline');

// Collect ALL ids from the 4 sources, each tagged with where it came from so an
// invalid one is easy to trace back.
function collectAllIds() {
  const labeled = []; // { id, label }

  // 1) Per product (data/db.json -> products[].emojiId)
  const dbData = db.getRawDb ? db.getRawDb() : JSON.parse(require('fs').readFileSync('./data/db.json', 'utf8'));
  (dbData.products || []).forEach(p => {
    if (p.emojiId) labeled.push({ id: String(p.emojiId), label: `product:${p.name}` });
  });

  // 2) Admin capture results stored in db.json -> emojiIds (keys "teks:*"/"menu:*")
  Object.entries(dbData.emojiIds || {}).forEach(([key, id]) => {
    if (id) labeled.push({ id: String(id), label: `db.json emojiIds:${key}` });
  });

  // 3) Static text fallbacks (emoji-id-text.js)
  Object.entries(EMOJI_ID_TEXT_BACKUP || {}).forEach(([key, id]) => {
    if (id) labeled.push({ id: String(id), label: `emoji-id-text.js:${key}` });
  });

  // 4) Inline menu button IDs (emoji-id-menu-inline.js)
  Object.entries(EMOJI_IDS || {}).forEach(([key, id]) => {
    if (id) labeled.push({ id: String(id), label: `emoji-id-menu-inline.js:${key}` });
  });

  return labeled;
}

async function main() {
  const labeled = collectAllIds();
  const uniqueIds = [...new Set(labeled.map(l => l.id))];
  console.log(`🔎 Checking ${uniqueIds.length} unique custom emoji ID(s) against Telegram...\n`);

  // The Bot API caps getCustomEmojiStickers at 200 ids per call - chunking into
  // batches of 100 stays comfortably inside that.
  const found = new Map(); // id -> sticker info
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getCustomEmojiStickers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_emoji_ids: chunk })
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('❌ API call failed:', data.description);
      process.exit(1);
    }
    data.result.forEach(sticker => found.set(sticker.custom_emoji_id, sticker));
  }

  const invalidIds = uniqueIds.filter(id => !found.has(id));

  console.log(`✅ VALID: ${found.size}/${uniqueIds.length}\n`);
  found.forEach((sticker, id) => {
    const labels = labeled.filter(l => l.id === id).map(l => l.label).join(', ');
    console.log(`  ✅ ${id}  (closest real shape: ${sticker.emoji}${sticker.is_video ? ', video' : sticker.is_animated ? ', animated' : ''})\n     used in: ${labels}`);
  });

  if (invalidIds.length) {
    console.log(`\n❌ INVALID / NOT FOUND: ${invalidIds.length}\n`);
    invalidIds.forEach(id => {
      const labels = labeled.filter(l => l.id === id).map(l => l.label).join(', ');
      console.log(`  ❌ ${id}\n     used in: ${labels}`);
    });
    console.log('\n⚠️ The IDs above will NEVER render as premium (they always fall back to plain\nunicode), because the IDs simply do not exist on Telegram. Re-capture them via\n"🎨 Manage Emoji ID" (forward a real premium emoji), or fill in the correct ID manually.');
  } else {
    console.log('\n🎉 Every ID is valid! If something still renders as non-premium in chat, it is\nalmost certainly because the BOT OWNER account does not have an active Telegram\nPremium subscription (a hard requirement of Bot API 9.4), not a wrong ID.');
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
