require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(Number);
const STORE_NAME = process.env.STORE_NAME || 'Premium Store';
// Bot username WITHOUT the "@" (for example "PremiumStoreBot") - used to build
// the personal referral link https://t.me/<username>?start=<chatId>. When it is
// empty, the referral menu automatically warns the user to fill it in in .env
// first.
const BOT_USERNAME = process.env.BOT_USERNAME || '';
// Balance (USD) the REFERRER earns each time a friend opens the bot through
// their referral link for the first time. Configurable via .env.
const REFERRAL_REWARD = Number(process.env.REFERRAL_REWARD || 1);

// ===== Automatic payments (Wallet Topup) =====
// QRIS via PayKita (pay.digikita.id) - see payment.js for integration details
const PAYKITA_API_KEY = process.env.PAYKITA_API_KEY || '';
const PAYKITA_API_BASE = process.env.PAYKITA_API_BASE || 'https://paykita.biz.id';
// USDT on the BEP20 network (BNB Smart Chain) - detected automatically via the BscScan API
const USDT_BEP20_ADDRESS = process.env.USDT_BEP20_ADDRESS || '';
const USDT_BEP20_CONTRACT = process.env.USDT_BEP20_CONTRACT || '0x55d398326f99059fF775485246999027B3197955';
// TON / Toncoin (The Open Network) - detected automatically via the TonCenter API
const TON_ADDRESS = process.env.TON_ADDRESS || '';
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || '';
// The store already prices in USD and USDT is pegged ~1:1 to USD, so no extra
// conversion rate is needed.

// Binance Pay (C2C transfer to the store's own Binance ID / Pay ID) - detected
// automatically via the official Binance "Get Pay Trade History" endpoint
// (GET /sapi/v1/pay/transactions). This is a REGULAR API KEY (not a Binance Pay
// Merchant/business key) - create it straight from a personal Binance account
// via binance.com -> Profile -> API Management, and tick only the
// "Enable Reading" permission (do NOT enable trading or withdrawal permissions
// at all, for safety - this feature only needs to read history). See payment.js
// for the integration details and how the unique-amount matching works.
const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '';
// Your own Binance ID / Pay ID (the number shown to buyers so they can send
// through the "Pay" menu in the Binance app) - used ONLY for display, never to
// call any API.
const BINANCE_PAY_ID = process.env.BINANCE_PAY_ID || '';

// ===== Supplier API "AIVerse Hub" (https://aiversehub.store) =====
// Used by the "Supplier API" feature in /admin - a local product variant can be
// linked to an AIVerse Hub service_id so that as soon as a buyer orders, the bot
// automatically places the order through their API (instead of using local
// stock) and forwards the result straight to the buyer. See supplier.js.
const AIVERSEHUB_API_KEY = process.env.AIVERSEHUB_API_KEY || '';
const AIVERSEHUB_BASE_URL = process.env.AIVERSEHUB_BASE_URL || 'https://aiversehub.store';
// How many minutes between automatic re-syncs of the cost price and stock for
// every variant linked to the Supplier API, WITHOUT the admin having to press
// "🔄 Refresh Cost & Stock" manually. Defaults to 10 minutes, configurable via
// .env. Set 0 to disable auto-sync (manual refresh only).
const SUPPLIER_SYNC_INTERVAL_MINUTES = Number(process.env.SUPPLIER_SYNC_INTERVAL_MINUTES ?? 10);

// ===== Supplier API "Canboso" (https://canboso.com) =====
// Used by the "🔌 Canboso API" feature in /admin - the same concept as the
// Supplier API (AIVerse Hub) above, but a SECOND, separate supplier - a local
// product variant can be linked to a Canboso product_id. See supplierCanboso.js
// for the API integration details.
const CANBOSO_API_KEY = process.env.CANBOSO_API_KEY || '';
const CANBOSO_BASE_URL = process.env.CANBOSO_BASE_URL || 'https://canboso.com';
// How many SECONDS between automatic re-syncs of the cost price and stock for
// every variant linked to the Canboso API, WITHOUT the admin having to press
// "🔄 Refresh Price & Stock" manually - the same idea as
// SUPPLIER_SYNC_INTERVAL_MINUTES above, but in SECONDS (not minutes) so it can
// be set tighter when needed (30 seconds, say). The Canboso endpoint used here
// (GET /api/v2/telegram-buyer/products) is already called per buyer as well
// (a live check when the product page opens, cached for 20 seconds - see
// supplierCanboso.js), so this background auto-sync only needs to be frequent
// enough to keep the numbers in the ADMIN PANEL fresh; it is not the source of
// truth for buyers (that remains the per-buyer live check).
// Defaults to 60 (1 minute). Set 0 to disable auto-sync (manual refresh only).
// Values of 1-9 seconds are AUTOMATICALLY raised to a minimum of 10 seconds
// (see scheduleCanbosoSync() in bot.js) so a large number of linked variants
// does not trigger Canboso's 429 rate limit.
const CANBOSO_SYNC_INTERVAL_SECONDS = Number(process.env.CANBOSO_SYNC_INTERVAL_SECONDS ?? 60);

// ===== GramJS userbot (the "🎁 Buy Gift" / "💌 Confess Gift" feature) =====
// See userbot.js for the integration details and userbot-login.js for how to
// obtain USERBOT_SESSION. API_ID/API_HASH come from https://my.telegram.org.
const USERBOT_API_ID = Number(process.env.USERBOT_API_ID || 0);
const USERBOT_API_HASH = process.env.USERBOT_API_HASH || '';
const USERBOT_SESSION = process.env.USERBOT_SESSION || '';
// Resale markup on gifts sold to buyers, as a PERCENTAGE on top of the Stars
// cost price (converted to USD using STARS_TO_USD_RATE). For example: a 15-star
// gift with STARS_TO_USD_RATE 0.015 -> cost $0.225, markup 30% -> sale price
// $0.2925.
const GIFT_MARKUP_PCT = Number(process.env.GIFT_MARKUP_PCT ?? 30);
// Conversion rate of 1 Telegram Star -> USD, used to price gifts in the store's
// currency (USD). The official price of 1 Star is roughly $0.013-$0.015
// depending on where the Stars were purchased - adjust if yours differs.
const STARS_TO_USD_RATE = Number(process.env.STARS_TO_USD_RATE || 0.015);

// ===== 👉 CHANGE THE MARKUP NUMBERS HERE 👈 =====
// Used for variants that are linked to the Supplier API AND do not yet have
// their own `tierMarkup` in data/db.json (see db.setVariantTierMarkup for the
// per-variant override). Every time the cost price (the supplier's price)
// changes and is synced (auto-sync every SUPPLIER_SYNC_INTERVAL_MINUTES, or the
// manual "🔄 Refresh Cost & Stock" button in /admin), the 3 sale price tiers
// below are RECALCULATED automatically from the latest cost plus these markup
// percentages - so the sale price ALWAYS tracks the live supplier price instead
// of being a manual number that goes stale.
//
// markupPct = how many percent above cost. For example: cost $0.40 with
// markupPct 25 -> sale price = $0.40 * 1.25 = $0.50.
//
// The numbers below are ONLY PLACEHOLDERS (change them however you like at any
// time; no other code needs to change, just edit, save, and restart the bot):
const DEFAULT_SUPPLIER_TIER_MARKUP = [
  { min: 1, max: 49, markupPct: 25 },   // qty 1-49   -> cost + 25%
  { min: 50, max: 499, markupPct: 15 }, // qty 50-499 -> cost + 15%
  { min: 500, max: null, markupPct: 8 } // qty 500+   -> cost + 8%
];

// Telegram Premium custom emoji (emoji_id) — NOT set through .env.
// They are filled in directly in 2 separate files, split by how they are used:
// - ./emoji-id-text.js        -> emoji inside text (product descriptions and menus/notifications)
// - ./emoji-id-menu-inline.js -> emoji used as inline menu button icons, per button
//   (the EMOJI_IDS object plus the iconFor(key) helper - imported directly by
//   bot.js rather than through this config, because there are now many IDs
//   keyed per button instead of a single value)
const { EMOJI_ID_PRODUCT_DESC, EMOJI_ID_MENU_NOTIF } = require('./emoji-id-text');
const BOLT_EMOJI_ID_TEXT = EMOJI_ID_PRODUCT_DESC;
const BOLT_EMOJI_ID_MENU = EMOJI_ID_MENU_NOTIF;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN has not been set in the .env file');
  process.exit(1);
}

function isAdmin(chatId) {
  return ADMIN_IDS.includes(Number(chatId));
}

module.exports = {
  BOT_TOKEN, ADMIN_IDS, STORE_NAME, BOT_USERNAME, REFERRAL_REWARD, BOLT_EMOJI_ID_TEXT, BOLT_EMOJI_ID_MENU, isAdmin,
  PAYKITA_API_KEY, PAYKITA_API_BASE,
  USDT_BEP20_ADDRESS, USDT_BEP20_CONTRACT,
  TON_ADDRESS, TONCENTER_API_KEY,
  BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_PAY_ID,
  AIVERSEHUB_API_KEY, AIVERSEHUB_BASE_URL, SUPPLIER_SYNC_INTERVAL_MINUTES, DEFAULT_SUPPLIER_TIER_MARKUP,
  CANBOSO_API_KEY, CANBOSO_BASE_URL, CANBOSO_SYNC_INTERVAL_SECONDS,
  USERBOT_API_ID, USERBOT_API_HASH, USERBOT_SESSION, GIFT_MARKUP_PCT, STARS_TO_USD_RATE
};
