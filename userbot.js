// ===== userbot.js =====
// GramJS userbot (MTProto, logged in with a PERSONAL Telegram account - not a
// bot) - used SPECIFICALLY for the "🎁 Buy Gift" and "💌 Confess Gift" features
// in bot.js, so gifts can be sent to ANY user (including people who have never
// pressed /start on this bot). The official Bot API (sendGift) requires the bot
// to hold its own Stars balance and always attributes the sender as "from the
// bot" - sending from something that looks like an ordinary personal account is
// ONLY possible over MTProto (a real user account), not the Bot API.
//
// ⚠️ IMPORTANT NOTES (read before using this in production):
// 1. The account logged in here performs AUTOMATED actions (sending gifts and
//    messages) repeatedly. Telegram applies FloodWait at the server level for
//    rapid consecutive actions against many different peers - this CANNOT be
//    coded around, only retried slowly.
// 2. Treat the SESSION_STRING produced at login (see userbot-login.js) as a
//    secret equivalent to the account password itself - anyone holding that
//    string can log in fully as that account without needing an OTP.
// 3. The RPC fields below (GetStarGifts / GetPaymentForm / SendStarsForm /
//    InputInvoiceStarGift) follow the official core.telegram.org schema as of
//    layer 196+. If the installed GramJS version uses a different schema (field
//    names changed), see the "ADJUST HERE" comments in each function.

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');

const API_ID = Number(process.env.USERBOT_API_ID || 0);
const API_HASH = process.env.USERBOT_API_HASH || '';
const SESSION_STRING = process.env.USERBOT_SESSION || '';

let client = null;
let connecting = null;

// Cache the gift catalogue (starGift[]) so the menu does not re-query on every
// open - refreshed every GIFT_CATALOG_TTL_MS.
let giftCatalogCache = null;
let giftCatalogCachedAt = 0;
const GIFT_CATALOG_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isConfigured() {
  return !!(API_ID && API_HASH && SESSION_STRING);
}

// Make sure the GramJS client is connected - called automatically by every
// public function below, so the caller (bot.js) never handles connections itself.
async function ensureConnected() {
  if (!isConfigured()) {
    throw new Error(
      'The userbot has not been configured. Set USERBOT_API_ID, USERBOT_API_HASH, ' +
      'and USERBOT_SESSION in .env (see userbot-login.js for how to get a session).'
    );
  }
  if (client && client.connected) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const c = new TelegramClient(new StringSession(SESSION_STRING), API_ID, API_HASH, {
      connectionRetries: 5
    });
    await c.connect();
    const me = await c.getMe();
    console.log(`✅ GramJS userbot connected as @${me.username || me.id}`);
    client = c;
    return c;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

// Fetch the list of official Telegram Stars gifts that can be sent (id, price in
// stars, per-user limit when limited, and so on). Used to render the inline "🎁
// Buy Gift" menu - each item is stored with an emoji plus custom_emoji_id (when
// that gift has a premium sticker) so bot.js can render it with
// <tg-emoji emoji-id="..."> just like a normal product (see productEmojiHtml()
// in bot.js).
// A Telegram gift sticker (g.sticker) is an ordinary Document object - there is
// NO "customEmojiId" field on it directly (that was an old-version bug, which is
// why emojiId was always null and every gift button fell back to the same single
// icon regardless of which gift it was -> hence button icons that "did not match"
// the actual gift). The custom emoji ID that is VALID for the
// icon_custom_emoji_id field is THE SAME AS the document's own id (g.sticker.id),
// BUT it is only valid as a custom emoji when that document is actually
// registered as one (the DocumentAttributeCustomEmoji attribute is present in
// g.sticker.attributes). When the gift sticker is just an ordinary sticker
// (without that attribute - the most common case for unique/limited gifts),
// return null so the caller falls back safely (see giftIconId() in bot.js, which
// also lets the admin override the ID per gift via "🎁 Manage Gift Emoji").
function giftStickerEmojiId(sticker) {
  if (!sticker || !sticker.id || !Array.isArray(sticker.attributes)) return null;
  const isCustomEmoji = sticker.attributes.some(a => a.className === 'DocumentAttributeCustomEmoji');
  return isCustomEmoji ? sticker.id.toString() : null;
}

async function getGiftCatalog(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && giftCatalogCache && now - giftCatalogCachedAt < GIFT_CATALOG_TTL_MS) {
    return giftCatalogCache;
  }
  const c = await ensureConnected();

  // ADJUST HERE if your GramJS version names this method differently (the
  // official schema is payments.getStarGifts, see
  // https://core.telegram.org/method/payments.getStarGifts).
  const result = await c.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
  const gifts = (result.gifts || []).filter(g => !g.soldOut);

  const catalog = gifts.map(g => ({
    id: g.id.toString(),
    stars: Number(g.stars),
    limited: !!g.limited,
    availabilityRemains: g.availabilityRemains || null,
    // Unicode emoji fallback plus the real custom_emoji_id from the gift's
    // sticker (when it is actually registered as a custom emoji - see
    // giftStickerEmojiId above). When unavailable it stays null - bot.js and
    // giftIconId() handle the next fallback (an admin override, then the global icon).
    emoji: '🎁',
    emojiId: giftStickerEmojiId(g.sticker)
  }));

  giftCatalogCache = catalog;
  giftCatalogCachedAt = now;
  return catalog;
}

// Resolve a target (a username WITHOUT @, or a numeric user id) into a full
// ENTITY (Api.User) - used by checkTargetExists(), which needs the details
// (username/firstName/lastName/isBot). Throws when the user is not found or
// privacy settings block the lookup - bot.js MUST catch this error and refund
// the buyer's wallet balance automatically (see db.updateBalance in bot.js).
async function resolveTargetPeer(client, targetUsernameOrId) {
  const raw = String(targetUsernameOrId).trim().replace(/^@/, '');
  try {
    const entity = await client.getEntity(raw);
    return entity;
  } catch (err) {
    const notFound = new Error(`Target "${raw}" was not found on Telegram.`);
    notFound.code = 'TARGET_NOT_FOUND';
    throw notFound;
  }
}

// ⚠️ BUG FIX for "400: PEER_ID_INVALID (caused by payments.GetPaymentForm)":
// resolveTargetPeer() above returns an Api.User AS IS (a "full" entity), NOT an
// Api.InputPeer. The `peer` field on InputInvoiceStarGift must hold an
// Api.InputPeer (for example InputPeerUser{userId, accessHash}) - passing a raw
// Api.User means GramJS does NOT convert it automatically for a manual
// c.invoke() call such as sendGiftToUser() below (unlike high-level methods such
// as client.sendMessage(), which do auto-convert). The result is the Telegram
// server rejecting the call with PEER_ID_INVALID.
// This function uses GramJS's built-in client.getInputEntity(), whose specific
// job is resolving to a valid InputPeer/InputUser form.
async function resolveInputPeer(client, targetUsernameOrId) {
  const raw = String(targetUsernameOrId).trim().replace(/^@/, '');
  try {
    return await client.getInputEntity(raw);
  } catch (err) {
    const notFound = new Error(`Target "${raw}" was not found on Telegram.`);
    notFound.code = 'TARGET_NOT_FOUND';
    throw notFound;
  }
}

// Check whether a Telegram username/ID is valid and really EXISTS (used for
// real-time validation BEFORE the buyer reaches the confirmation page - see
// verifyTelegramTarget() in bot.js, used by the Buy Gift/Confess Gift feature).
// The point: a mistyped or non-existent target is caught up front (before any
// balance is deducted at all), rather than failing at send time (which, even
// with the automatic refund in place, still makes the buyer wait through a
// pointless process).
//
// Returns: { id, username, firstName, lastName, isBot } when the target is found.
// Throws an Error with code 'TARGET_NOT_FOUND' when it is missing/invalid -
// bot.js MUST catch this and tell the user to check their spelling.
//
// GramJS NOTE: for numeric input specifically (a user ID rather than a username),
// Telegram/GramJS sometimes refuses to resolve it when the userbot has never
// "met" that ID at all (no access_hash stored in the userbot session - a
// Telegram API limitation, not a bug). Ordinary usernames (letters) are not
// affected, because they resolve through the username directly.
async function checkTargetExists(targetUsernameOrId) {
  const c = await ensureConnected();
  const peer = await resolveTargetPeer(c, targetUsernameOrId);
  return {
    id: peer.id ? peer.id.toString() : null,
    username: peer.username || null,
    firstName: peer.firstName || null,
    lastName: peer.lastName || null,
    isBot: !!peer.bot
  };
}

// Send ONE Telegram Star Gift to a target, with an optional message (used by the
// "💌 Confess Gift" feature - the anonymous message attached to the gift).
//
// Params:
//   targetUsernameOrId : string  - username (without @) or numeric user id
//   giftId             : string  - gift id from getGiftCatalog()
//   message            : string  - message attached to the gift (optional,
//                                   capped by Telegram at ~255 characters)
//   hideName           : boolean - true = the sender's identity (the userbot
//                                   account) is hidden from the recipient if
//                                   they display the gift on their profile
//                                   (matching the official Telegram hide_name
//                                   flag on inputInvoiceStarGift)
//
// Returns: { success: true } on success.
// Throws an Error on failure (bot.js MUST catch it and refund automatically).
async function sendGiftToUser({ targetUsernameOrId, giftId, message, hideName = true }) {
  const c = await ensureConnected();
  const peer = await resolveInputPeer(c, targetUsernameOrId);

  // ADJUST HERE if your GramJS constructor names differ from the official schema:
  // - Api.InputInvoiceStarGift (schema: core.telegram.org/constructor/inputInvoiceStarGift)
  // - Api.payments.GetPaymentForm
  // - Api.payments.SendStarsForm
  const invoice = new Api.InputInvoiceStarGift({
    hideName: !!hideName,
    peer,
    giftId: BigInt(giftId),
    message: message
      ? new Api.TextWithEntities({ text: message, entities: [] })
      : undefined
  });

  const form = await c.invoke(new Api.payments.GetPaymentForm({ invoice }));

  // The Stars payment is charged directly from the userbot account's Stars
  // balance (no external payment form to confirm, unlike a credit card or QRIS),
  // so calling SendStarsForm with the formId from the response above is enough.
  const result = await c.invoke(
    new Api.payments.SendStarsForm({
      formId: form.formId,
      invoice
    })
  );

  return { success: true, raw: result };
}

// Cache the userbot's Stars balance so the pre-send check (see gift:confirm in
// bot.js) does not hit the API every time buyers confirm orders back to back.
let starsBalanceCache = null;
let starsBalanceCachedAt = 0;
const STARS_BALANCE_TTL_MS = 20 * 1000; // 20 seconds

async function getUserbotStarsBalance(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && starsBalanceCache !== null && now - starsBalanceCachedAt < STARS_BALANCE_TTL_MS) {
    return starsBalanceCache;
  }
  const c = await ensureConnected();
  const status = await c.invoke(new Api.payments.GetStarsStatus({ peer: new Api.InputPeerSelf() }));
  const balance = Number(status.balance.amount || status.balance || 0);
  starsBalanceCache = balance;
  starsBalanceCachedAt = now;
  return balance;
}

module.exports = {
  isConfigured,
  ensureConnected,
  getGiftCatalog,
  sendGiftToUser,
  getUserbotStarsBalance,
  checkTargetExists
};
