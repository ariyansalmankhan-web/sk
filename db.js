const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Each variant: { id, label, stock, tiers: [{ min, max|null, price }] }
// tiers are sorted ascending by `min`; the last tier can have max: null (unbounded)
const DEFAULT_DB = {
  users: {},     // chatId -> { username, balance }
  products: [],
  // deposits: Wallet topups via automatic payment (QRIS PayKita / USDT BEP20).
  // { id, chatId, method: 'qris'|'usdt_bep20', status: 'pending'|'paid'|'expired',
  //   requestedAmount (the USD credited to the balance), createdAt, expiresAt,
  //   -- qris only: paykitaOrderId, paykitaReference, finalAmount
  //   -- usdt_bep20 only: usdtAmount (the unique amount), walletAddress, txHash }
  deposits: [],
  orders: [],    // { id, chatId, productId, variantId, qty, unitPrice, total, createdAt, status }
  pendingAction: {}, // chatId -> { type: '...', data }
  emojiIds: {},  // key (e.g. "menu:buy_product" / "teks:product_desc") -> custom_emoji_id string
  settings: {
    // Auto Backup: a zip of the full source code (except node_modules and .npm)
    // sent automatically to a Telegram group at a set interval.
    backup: { enabled: false, intervalMinutes: 60, groupId: null },
    // Force Join Channel: users MUST join every channel in this list before they
    // can use the bot menus (when enabled: true). Each channel is:
    // { id, title, link, chatRef } - chatRef = @username OR a numeric chat id
    // (used by the bot to check join status via getChatMember), link = the
    // invite link shown to the user as a button.
    forceJoin: { enabled: false, channels: [] },
    // Automatic Channel Notifications: on every product purchase / successful
    // Wallet topup (QRIS/USDT/TON), the bot automatically sends a text message
    // plus an inline menu to this one destination channel/group (when enabled:
    // true). chatRef = the channel @username OR a numeric chat id (for example
    // "-1001234567890") - the bot MUST already be an admin in that channel/group
    // to post there. notifyPurchase/notifyTopup/notifyReferral can each be
    // turned off separately. notifyMaintenance: also post here whenever an admin
    // enables/disables Maintenance Mode (see sendChannelNotif kind 'maintenance'
    // and buildChannelMaintenanceText() in bot.js).
    channelNotif: { enabled: false, chatRef: null, title: null, notifyPurchase: true, notifyTopup: true, notifyReferral: true, notifyMaintenance: true },
    // Maintenance Mode: when enabled is true, ALL non-admin users are blocked
    // from every bot interaction (commands, buttons, text input) and only shown
    // the maintenance message. Admins (ADMIN_IDS) always keep normal access, so
    // the owner is never locked out of their own bot.
    // message: null -> use the default "nice" text (see buildMaintenanceText() in
    // bot.js, whose emoji come from textEmoji() -> customisable via admin
    // "🎨 Manage Emoji ID"). When an admin sets their own custom message via
    // "✏️ Set Custom Message", this field is used as is (including any premium
    // custom emoji the owner picked while typing, see embedOwnerCustomEmoji() in
    // bot.js).
    maintenance: { enabled: false, message: null }
  }
};

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  let raw = fs.readFileSync(DB_PATH, 'utf-8');
  let db;
  try {
    db = JSON.parse(raw);
  } catch (err) {
    // db.json is corrupt (for example left over from a crash before this atomic-
    // write patch existed). Try to recover from db.json.bak (the last copy
    // written successfully) - far better than the bot failing to start at all
    console.error('⚠️ db.json is corrupt / not valid JSON:', err.message);
    const bakPath = DB_PATH + '.bak';
    if (fs.existsSync(bakPath)) {
      console.error('⚠️ Recovering from db.json.bak...');
      raw = fs.readFileSync(bakPath, 'utf-8');
      db = JSON.parse(raw); // if the .bak is corrupt too, let the original error surface
      fs.writeFileSync(DB_PATH, raw);
    } else {
      throw err;
    }
  }
  // Light migration for older db.json files (from before the deposits feature)
  if (!Array.isArray(db.deposits)) db.deposits = [];
  if (!db.emojiIds || typeof db.emojiIds !== 'object') db.emojiIds = {};
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (!db.settings.backup || typeof db.settings.backup !== 'object') {
    db.settings.backup = { enabled: false, intervalMinutes: 60, groupId: null };
  }
  if (!db.settings.forceJoin || typeof db.settings.forceJoin !== 'object') {
    db.settings.forceJoin = { enabled: false, channels: [] };
  }
  if (!Array.isArray(db.settings.forceJoin.channels)) db.settings.forceJoin.channels = [];
  if (!db.settings.channelNotif || typeof db.settings.channelNotif !== 'object') {
    db.settings.channelNotif = { enabled: false, chatRef: null, title: null, notifyPurchase: true, notifyTopup: true, notifyReferral: true, notifyMaintenance: true };
  }
  if (typeof db.settings.channelNotif.notifyPurchase !== 'boolean') db.settings.channelNotif.notifyPurchase = true;
  if (typeof db.settings.channelNotif.notifyTopup !== 'boolean') db.settings.channelNotif.notifyTopup = true;
  if (typeof db.settings.channelNotif.notifyReferral !== 'boolean') db.settings.channelNotif.notifyReferral = true;
  if (typeof db.settings.channelNotif.notifyMaintenance !== 'boolean') db.settings.channelNotif.notifyMaintenance = true;
  if (!db.settings.maintenance || typeof db.settings.maintenance !== 'object') {
    db.settings.maintenance = { enabled: false, message: null };
  }
  if (typeof db.settings.maintenance.enabled !== 'boolean') db.settings.maintenance.enabled = false;
  if (typeof db.settings.maintenance.message === 'undefined') db.settings.maintenance.message = null;
  // Migration: older products (created before the "🖼️ Set Product Logo" feature
  // existed) have no logoUrl field at all -> default it to null so other code
  // reading product.logoUrl never gets `undefined` (safe to use directly in
  // productLogoUrl() / if-checks without extra guards).
  if (Array.isArray(db.products)) {
    db.products.forEach(p => {
      if (typeof p.logoUrl === 'undefined') p.logoUrl = null;
    });
  }
  // Migration: the order log for the "🎁 Buy Gift" / "💌 Confess Gift" features
  // (see createGiftOrder() below) - older db.json files have no such array yet.
  if (!Array.isArray(db.giftOrders)) db.giftOrders = [];
  return db;
}

// Write db.json ATOMICALLY: write to a temporary file (.tmp) first, then rename
// it to the real name. rename() is atomic at the filesystem level (all-or-
// nothing) - so if the process dies or is killed WHILE writing, the OLD db.json
// stays intact (never half-truncated). Without this, killing the process in the
// middle of writeFileSync could corrupt db.json -> the bot then fails to start
// again because of a JSON.parse error.
function writeDb(db) {
  const tmpPath = DB_PATH + '.tmp';
  const json = JSON.stringify(db, null, 2);
  fs.writeFileSync(tmpPath, json);
  fs.renameSync(tmpPath, DB_PATH);
  // Keep a best-effort backup copy (this must never make writeDb fail, hence its
  // own try/catch).
  try { fs.writeFileSync(DB_PATH + '.bak', json); } catch (_) {}
}

function getUser(chatId, username) {
  const db = readDb();
  if (!db.users[chatId]) {
    db.users[chatId] = {
      username: username || '',
      balance: 0,
      referredBy: null,      // chatId of the inviting user (null when not from a referral)
      referralCount: 0,      // how many people they have successfully invited
      referralEarnings: 0    // total balance earned from the referral programme
    };
    writeDb(db);
  } else if (username && db.users[chatId].username !== username) {
    db.users[chatId].username = username;
    writeDb(db);
  }
  return db.users[chatId];
}

// Register a new user as a referral from `referrerChatId`.
// ===== PATCH v7: FIX for the fake-referral loophole =====
// PREVIOUSLY: the reward was credited to the inviter the moment a new user typed
// /start through a referral link - with NO other condition at all. That was very
// easy to exploit: create as many new Telegram accounts as you like (virtual/VoIP
// numbers are cheap and easy to get), press /start with your own referral link
// from each new account -> rewards keep coming in without a single real payment
// reaching the store.
// NOW: this function ONLY records the referral relationship (who invited whom)
// - NO reward is granted here. The reward is credited later by
// creditReferralOnFirstDeposit() below, TRIGGERED ONLY when the invited user
// REALLY tops up their balance for the first time through one of the payment
// gateways (QRIS/USDT/TON/Binance Pay - see the callers in bot.js, at the 4
// pollXxxDeposit() points once the status becomes 'paid'). That condition is far
// more expensive to exploit - a cheater has to ACTUALLY deposit real money
// through a real payment gateway for every fake account they create, not just
// buy a cheap SIM number.
// Returns null when the referral is invalid (self-referral, the referrer does not
// exist, or this is not a new user), or { referrerChatId } when the relationship
// was recorded successfully (which does NOT mean a reward has been granted).
function registerReferral(newChatId, referrerChatId) {
  if (!referrerChatId || String(referrerChatId) === String(newChatId)) return null;
  const db = readDb();
  const newUser = db.users[newChatId];
  const referrer = db.users[referrerChatId];
  if (!newUser || !referrer) return null;
  if (newUser.referredBy) return null; // already processed previously

  newUser.referredBy = referrerChatId;
  writeDb(db);
  return { referrerChatId };
}

// Called every time a deposit's status has just become 'paid' through a real
// payment gateway (QRIS/USDT/TON/Binance - NOT a manual balance adjustment by an
// admin, so admins can freely correct or refund balances without accidentally
// triggering referral rewards over and over). The reward is credited to the
// inviter ONLY when: (1) this user really was invited by someone (referredBy is
// set), and (2) this really is the user's FIRST successful deposit
// (referralRewardGiven has never been true) - checked and set here so a user
// cannot top up repeatedly to trigger the reward repeatedly from a single
// invitation.
// Returns null when no reward is due, or { referrerChatId, reward, newBalance }
// when one was credited successfully.
function creditReferralOnFirstDeposit(newChatId, rewardAmount) {
  const db = readDb();
  const newUser = db.users[newChatId];
  if (!newUser || !newUser.referredBy || newUser.referralRewardGiven) return null;
  const referrer = db.users[newUser.referredBy];
  if (!referrer) return null;

  newUser.referralRewardGiven = true;
  referrer.referralCount = (referrer.referralCount || 0) + 1;
  referrer.referralEarnings = (referrer.referralEarnings || 0) + rewardAmount;
  referrer.balance = (referrer.balance || 0) + rewardAmount;
  writeDb(db);
  return { referrerChatId: newUser.referredBy, reward: rewardAmount, newBalance: referrer.balance };
}

function getReferralStats(chatId) {
  const db = readDb();
  const user = db.users[chatId] || {};
  return {
    referralCount: user.referralCount || 0,
    referralEarnings: user.referralEarnings || 0
  };
}

function updateBalance(chatId, delta) {
  // A last guard: if some other caller (now or in future) forgets to validate
  // its input before reaching here and `delta` turns out to be NaN, do NOT
  // write it to the balance - NaN plus anything is NaN, and once a user's
  // balance becomes NaN it is PERMANENTLY BROKEN (no longer readable as a
  // number, unrecoverable through any normal transaction). Failing quietly
  // (leaving the balance untouched) is safer than corrupting user data.
  if (typeof delta !== 'number' || isNaN(delta)) {
    console.error(`⚠️ updateBalance(${chatId}, ${delta}) rejected - delta is not a valid number.`);
    const db = readDb();
    return (db.users[chatId] && db.users[chatId].balance) || 0;
  }
  const db = readDb();
  if (!db.users[chatId]) db.users[chatId] = { username: '', balance: 0 };
  db.users[chatId].balance += delta;
  writeDb(db);
  return db.users[chatId].balance;
}

function findProduct(productId) {
  const db = readDb();
  return db.products.find(p => p.id === productId);
}

function findVariant(productId, variantId) {
  const product = findProduct(productId);
  if (!product) return null;
  return product.variants.find(v => v.id === variantId);
}

// Lowest tier price - used as the "starting from" price in listings
function getBasePrice(variant) {
  if (!variant.tiers || variant.tiers.length === 0) return 0;
  return variant.tiers[0].price;
}

// Highest-quantity tier price (the "500+" bulk price) - used in the
// Available Products listing per admin request
function getBulkPrice(variant) {
  if (!variant.tiers || variant.tiers.length === 0) return 0;
  return variant.tiers[variant.tiers.length - 1].price;
}

// Unit price for a given quantity, based on bulk discount tiers
function getUnitPriceForQty(variant, qty) {
  const tiers = variant.tiers || [];
  const tier = tiers.find(t => qty >= t.min && (t.max === null || qty <= t.max));
  const fallback = tiers[tiers.length - 1];
  return tier ? tier.price : (fallback ? fallback.price : 0);
}

function decrementStock(productId, variantId, qty) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  variant.stock = Math.max(0, (variant.stock || 0) - qty);
  writeDb(db);
  return true;
}

// ===== PATCH: separate the live Supplier/Canboso stock (variant.liveStock) from
// the manual stock (variant.stock, mirrored from stockItems.length via
// addStockItems/popStockItems below, or a plain manual number for variants
// without auto-delivery) - see setVariantStock() further down for the history of
// the bug. These two sources are now ADDED TOGETHER (rather than overwriting one
// another) via getTotalStock(), so the "Stock: N" shown to buyers/admins always
// reflects the total that can genuinely be fulfilled.
function getTotalStock(variant) {
  if (!variant) return 0;
  return (variant.liveStock || 0) + (variant.stock || 0);
}

// The opposite of popStockItems() - put items back into stockItems (at the FRONT
// of the array, so the original FIFO order is preserved) when a local order has
// already been popped but then could not be completed (for example the
// Supplier/Canboso API call for the remaining qty failed after local stock was
// used first - see the partial fulfilment flow in the 'confirm:' handler in
// bot.js). Without this, items already popped from a cancelled order would be
// lost from the database for nothing, despite never having been delivered.
function restoreStockItems(productId, variantId, items) {
  if (!items || !items.length) return false;
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  if (!Array.isArray(variant.stockItems)) variant.stockItems = [];
  variant.stockItems.unshift(...items);
  variant.stock = variant.stockItems.length;
  writeDb(db);
  return true;
}

// ===== Auto-delivery stock items (e.g. Gemini Premium redeem links) =====
// Every line of text the admin enters = 1 unit of stock ready for auto-delivery.
// variant.stockItems: string[] . variant.stock is always kept in sync with
// stockItems.length once that variant is used for auto-delivery.

function addStockItems(productId, variantId, items) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return null;
  if (!Array.isArray(variant.stockItems)) variant.stockItems = [];
  const clean = (items || []).map(s => String(s).trim()).filter(Boolean);
  variant.stockItems.push(...clean);
  variant.stock = variant.stockItems.length;
  writeDb(db);
  return { added: clean.length, total: variant.stock };
}

// Take and remove the top `qty` stock items (FIFO) to send to the buyer.
// Returns null when this variant does not use auto-delivery OR has fewer items
// than qty -> the caller must fall back to the manual flow (notify the admin).
function popStockItems(productId, variantId, qty) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant || !Array.isArray(variant.stockItems)) return null;
  if (variant.stockItems.length < qty) return null;
  const items = variant.stockItems.splice(0, qty);
  variant.stock = variant.stockItems.length;
  writeDb(db);
  return items;
}

function getStockItemCount(productId, variantId) {
  const variant = findVariant(productId, variantId);
  return variant && Array.isArray(variant.stockItems) ? variant.stockItems.length : 0;
}

// ===== Wallet deposits (automatic topup via QRIS / USDT BEP20) =====

function createDeposit(fields) {
  const db = readDb();
  const id = 'dep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const record = { id, status: 'pending', createdAt: new Date().toISOString(), ...fields };
  db.deposits.push(record);
  writeDb(db);
  return record;
}

function getDeposit(id) {
  const db = readDb();
  return db.deposits.find(d => d.id === id);
}

function updateDeposit(id, patch) {
  const db = readDb();
  const d = db.deposits.find(x => x.id === id);
  if (!d) return null;
  Object.assign(d, patch);
  writeDb(db);
  return d;
}

function getPendingDeposits(method) {
  const db = readDb();
  return db.deposits.filter(d => d.status === 'pending' && (!method || d.method === method));
}

// USDT amounts currently in use by other pending deposits - used to avoid two
// pending deposits having exactly the same unique amount.
function getUsedUsdtAmounts() {
  const db = readDb();
  return new Set(
    db.deposits
      .filter(d => d.method === 'usdt_bep20' && d.status === 'pending')
      .map(d => d.usdtAmount)
  );
}

// Same as getUsedUsdtAmounts() above, but for TON deposits.
function getUsedTonAmounts() {
  const db = readDb();
  return new Set(
    db.deposits
      .filter(d => d.method === 'ton' && d.status === 'pending')
      .map(d => d.tonAmount)
  );
}

// Same as getUsedUsdtAmounts()/getUsedTonAmounts() above, but for Binance Pay
// deposits.
function getUsedBinanceAmounts() {
  const db = readDb();
  return new Set(
    db.deposits
      .filter(d => d.method === 'binance' && d.status === 'pending')
      .map(d => d.binanceAmount)
  );
}

// ⚠️ IMPORTANT - anti replay/double-credit protection:
// fetchIncomingUsdtTransfers()/fetchIncomingTonTransfers() scan on-chain history
// up to ~2.5 hours back (far longer than one deposit's 30-minute validity).
// getUsedUsdtAmounts()/getUsedTonAmounts() above only check amounts from deposits
// that are STILL 'pending' - ones already marked 'paid' are no longer counted. So
// when the store is busy, two different users could be assigned EXACTLY THE SAME
// unique amount within that 2.5-hour window (only ~999 four-decimal variations
// exist). Once that happens, the next poll would match an OLD transaction that
// already paid the first user's deposit against the second user's deposit -> the
// second user gets credited WITHOUT transferring anything (a double-credit/replay
// exploit). That is why EVERY matched transfer MUST first be checked to confirm
// its txHash has never been used for another deposit before any balance is
// credited - see isTxHashUsed().
function isTxHashUsed(hash) {
  if (!hash) return false;
  const db = readDb();
  return db.deposits.some(d => d.txHash === hash);
}

// `supplierMeta` is optional: { supplierServiceId, supplierOrderId } - filled in
// when this order was fulfilled through the Supplier API (AIVerse Hub) rather
// than local stock, so an admin can trace which orders need checking on the API
// side if a buyer complains (see supplier.js / admin:supplier in bot.js).
function createOrder(chatId, productId, variantId, qty, unitPrice, total, deliveredItems, username, supplierMeta) {
  const db = readDb();
  // IMPORTANT: use Date.now() plus a random suffix, NOT Date.now() alone - the
  // same pattern as the deposit/channel ids above. Date.now() is only
  // millisecond-precise, so two orders from two different buyers processed VERY
  // close together (within the same millisecond when the store is busy) could
  // get DUPLICATE ids. getOrderById() uses .find() (taking the FIRST match) - if
  // duplicate ids occurred, the "🔍 Check Order ID" feature, the delivery log,
  // and the "🔄 Refresh 2FA Code"/"🏅 Recover Product" buttons could pick up or
  // display account details from a DIFFERENT order - so they must be unique.
  const id = 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const delivered = Array.isArray(deliveredItems) && deliveredItems.length > 0;
  db.orders.push({
    id, chatId, username: username || '', productId, variantId, qty, unitPrice, total,
    createdAt: new Date().toISOString(), status: 'paid',
    delivered,
    deliveredItems: delivered ? deliveredItems : [],
    ...(supplierMeta ? {
      supplierServiceId: supplierMeta.supplierServiceId,
      supplierOrderId: supplierMeta.supplierOrderId,
      // Optional: a slice of the external API's raw response, only filled in
      // when item extraction failed (see bot.js) - used by an admin/developer to
      // trace back a field mapping that missed, without relying on a Telegram
      // notification that could be missed.
      ...(supplierMeta.rawDebug ? { rawDebug: supplierMeta.rawDebug } : {})
    } : {})
  });
  writeDb(db);
  return id;
}

function getOrdersByUser(chatId) {
  const db = readDb();
  return db.orders.filter(o => o.chatId === chatId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ===== Auto-delivery audit log =====
function getOrderById(orderId) {
  const db = readDb();
  return db.orders.find(o => o.id === orderId) || null;
}

function getDeliveryLogs(limit) {
  const db = readDb();
  return db.orders
    .filter(o => o.delivered)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit || 10);
}

function setPendingAction(chatId, action) {
  const db = readDb();
  db.pendingAction[chatId] = action;
  writeDb(db);
}

function getPendingAction(chatId) {
  const db = readDb();
  return db.pendingAction[chatId];
}

function clearPendingAction(chatId) {
  const db = readDb();
  delete db.pendingAction[chatId];
  writeDb(db);
}

// ===== Auto Backup settings =====
function getBackupSettings() {
  const db = readDb();
  return db.settings.backup;
}

// partial: the subset of { enabled, intervalMinutes, groupId } to change.
// Returns the latest settings object (complete, already merged).
function setBackupSettings(partial) {
  const db = readDb();
  db.settings.backup = { ...db.settings.backup, ...partial };
  writeDb(db);
  return db.settings.backup;
}

// ===== Gift pricing (markup% and the Stars->USD rate, overriding
// GIFT_MARKUP_PCT / STARS_TO_USD_RATE from .env - see giftPriceUsd() in bot.js) =====
// null = not overridden, use the default from .env (config.js). Stored separately
// from giftPriceUsd() itself so an admin can change it live from Telegram chat
// WITHOUT restarting the server (unlike env vars, which need a process restart to
// be re-read).
function getGiftPricingSettings() {
  const db = readDb();
  if (!db.settings.giftPricing) db.settings.giftPricing = { markupPct: null, starsToUsdRate: null };
  return db.settings.giftPricing;
}

// partial: the subset of { markupPct, starsToUsdRate } to change.
function setGiftPricingSettings(partial) {
  const db = readDb();
  db.settings.giftPricing = { ...(db.settings.giftPricing || { markupPct: null, starsToUsdRate: null }), ...partial };
  writeDb(db);
  return db.settings.giftPricing;
}

// ===== Force Join Channel =====
function getForceJoinSettings() {
  return readDb().settings.forceJoin;
}

function setForceJoinEnabled(enabled) {
  const db = readDb();
  db.settings.forceJoin.enabled = !!enabled;
  writeDb(db);
  return db.settings.forceJoin;
}

function addForceJoinChannel({ title, link, chatRef }) {
  const db = readDb();
  const id = 'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const channel = { id, title: title || chatRef, link, chatRef };
  db.settings.forceJoin.channels.push(channel);
  writeDb(db);
  return channel;
}

function removeForceJoinChannel(id) {
  const db = readDb();
  const before = db.settings.forceJoin.channels.length;
  db.settings.forceJoin.channels = db.settings.forceJoin.channels.filter(c => c.id !== id);
  writeDb(db);
  return db.settings.forceJoin.channels.length < before;
}

function getForceJoinChannels() {
  return readDb().settings.forceJoin.channels;
}

// ===== Automatic Channel Notifications (New Purchase / New Wallet Top-Up) =====
function getChannelNotifSettings() {
  return readDb().settings.channelNotif;
}

// partial: the subset of { enabled, chatRef, title, notifyPurchase, notifyTopup }
// to change. Returns the latest settings object (complete, already merged).
function setChannelNotifSettings(partial) {
  const db = readDb();
  db.settings.channelNotif = { ...db.settings.channelNotif, ...partial };
  writeDb(db);
  return db.settings.channelNotif;
}

// ===== Bot Maintenance Mode =====
function getMaintenanceSettings() {
  return readDb().settings.maintenance;
}

// partial: the subset of { enabled, message } to change. `message: null` means
// go back to the default text (see buildMaintenanceText() in bot.js).
// Returns the latest settings object (complete, already merged).
function setMaintenanceSettings(partial) {
  const db = readDb();
  db.settings.maintenance = { ...db.settings.maintenance, ...partial };
  writeDb(db);
  return db.settings.maintenance;
}

// ===== User list (the admin "📋 User List") =====
// Returns EVERY registered user as an array (chatId is inserted into each object,
// because in db.json chatId is only the KEY of the `users` object, not a field
// inside the value). orderCount is computed on the fly from db.orders - not
// stored as a separate field on the user, so it stays accurate even when orders
// are deleted or edited by hand. The array order is EXACTLY the order of
// Object.keys(db.users) - and for numeric keys (a Telegram chatId is always
// numeric) JavaScript sorts them ASCENDING automatically rather than by
// registration order, so users with a smaller chatId always appear first in the
// listing.
function getUsersList() {
  const db = readDb();
  const orders = Array.isArray(db.orders) ? db.orders : [];
  return Object.keys(db.users).map(chatId => {
    const u = db.users[chatId] || {};
    const orderCount = orders.filter(o => String(o.chatId) === String(chatId)).length;
    return {
      chatId,
      username: u.username || '',
      balance: u.balance || 0,
      referralCount: u.referralCount || 0,
      orderCount
    };
  });
}

function addProduct(id, name, emoji) {
  const db = readDb();
  if (db.products.find(p => p.id === id)) return false;
  db.products.push({ id, name, emoji: emoji || '📦', emojiId: null, logoUrl: null, variants: [] });
  writeDb(db);
  return true;
}

// Set or change the official logo URL of a product (the Netflix/Spotify/Gemini
// logo, say) - used in channel notifications so each product shows its own app
// logo rather than just an emoji. A null/'' url removes the logo (falling back to
// the emoji as usual, without error). Returns false when the product is not
// found.
function setProductLogo(productId, url) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  if (!product) return false;
  product.logoUrl = url || null;
  writeDb(db);
  return true;
}

// Set or change a product's premium custom emoji (used by productEmojiHtml() in
// bot.js). "emoji" = the fallback unicode character (for older clients / plain
// emoji), "emojiId" = the REAL custom_emoji_id captured by forwarding the owner's
// own message from their Telegram Premium panel (see the 'setemoji_capture'
// handler in bot.js) - null when the owner only wants plain unicode without
// premium. Returns false when the product is not found.
function setProductEmoji(productId, emoji, emojiId) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  if (!product) return false;
  product.emoji = emoji || '📦';
  product.emojiId = emojiId || null;
  writeDb(db);
  return true;
}

// The main "➕ Add Product" flow: name + price + description only.
// Automatically creates one product with one default variant (id:
// `${id}-default`), stock starting at 0 - stock is added later via "📥 Add Stock".
// emoji: the fallback unicode character (used on buttons and in Markdown text,
// which cannot render custom emoji). emojiId: the REAL custom_emoji_id when the
// owner picked that emoji straight from their Telegram Premium panel while typing
// the product name (see the 'addproduct_name' handler under TEXT MESSAGES) - when
// empty/null the owner simply typed a plain unicode emoji (or none at all), and
// it falls back to the plain `emoji` / 📦 without error.
function addSimpleProduct(id, name, price, description, emoji, emojiId) {
  const db = readDb();
  if (db.products.find(p => p.id === id)) return null;
  const variantId = id + '-default';
  db.products.push({
    id,
    name,
    emoji: emoji || '📦',
    emojiId: emojiId || null,
    logoUrl: null,
    variants: [{
      id: variantId,
      label: name,
      stock: 0,
      tiers: [{ min: 1, max: null, price }],
      description: description || '',
      howToUse: ''
    }]
  });
  writeDb(db);
  return { productId: id, variantId };
}

function addVariant(productId, variantId, label, price, stock, description) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  if (!product) return false;
  // Prevent two variants of the same product having DUPLICATE ids (an admin
  // typing the same or a similar label twice, so the slug id comes out
  // identical). Without this, findVariant() (which uses .find(), taking the FIRST
  // match) would always return the OLD variant - the new one becomes a "ghost"
  // that shows in the list but, when clicked or edited (stock, price, etc.),
  // changes the old variant instead, leaving the admin puzzled.
  if (product.variants.some(v => v.id === variantId)) return false;
  product.variants.push({
    id: variantId,
    label,
    stock: stock || 0,
    tiers: [{ min: 1, max: null, price }],
    // BUG FIX: this field used to never be set here at all, so a new variant
    // always showed up with no description. It is now saved too (defaulting to an
    // empty string when the admin enters nothing), the same as addSimpleProduct()
    // above.
    description: description || '',
    howToUse: ''
  });
  writeDb(db);
  return true;
}

// Change the base price (the first tier) of a variant. When a variant has tiered
// bulk discounts (tiers > 1), the other tiers do NOT change automatically - those
// still have to be edited by hand in data/db.json to be safe; this only changes
// the base price (tier 1: min 1).
function setVariantPrice(productId, variantId, price) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  if (!Array.isArray(variant.tiers) || variant.tiers.length === 0) {
    variant.tiers = [{ min: 1, max: null, price }];
  } else {
    variant.tiers[0].price = price;
  }
  writeDb(db);
  return true;
}

// ===== Supplier API (AIVerse Hub) - link one variant to one remote service_id =====
// When variant.supplierServiceId is set, the purchase flow (see bot.js) orders the
// product AUTOMATICALLY through the supplier API (rather than from local
// stockItems) as soon as a buyer purchases this variant. See supplier.js for the API.
function setVariantSupplier(productId, variantId, serviceId, costPrice) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  variant.supplierServiceId = serviceId;
  // The cost price from AIVerse Hub AT THE MOMENT it was linked - stored so the
  // margin (cost vs local sale price) can be calculated without calling the API
  // again every time the Supplier API menu is shown. The AIVerse Hub cost can
  // change on their side at any time - this value is a snapshot, not live.
  if (typeof costPrice === 'number' && !isNaN(costPrice)) {
    variant.supplierCost = costPrice;
  }
  writeDb(db);
  return true;
}

function clearVariantSupplier(productId, variantId) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  delete variant.supplierServiceId;
  delete variant.supplierCost;
  writeDb(db);
  return true;
}

// Sync the LIVE stock from the Supplier/Canboso API into variant.liveStock - used
// by 'admin:supplierrefresh', refreshSupplierData(), and the Canboso live check
// in the 'variant:'/'confirm:' handlers in bot.js.
// ===== BUG FIX: this function used to overwrite variant.stock directly - the SAME
// field also used by manual stock (stockItems.length, see addStockItems/
// popStockItems above). Because two separate sources fought over one field, the
// next live sync could overwrite the admin's manual stock with 0 or a stale value
// (whenever the external API's balance/stock happened to be empty), even though
// local manual stock was still there and ready to deliver. It now writes to the
// separate liveStock field - variant.stock (the manual stock mirror) is never
// touched here again. Use getTotalStock(variant) to get the combined number
// (live + manual) to display to buyers/admins.
function setVariantStock(productId, variantId, stock) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  if (typeof stock !== 'number' || isNaN(stock)) return false;
  variant.liveStock = Math.max(0, Math.round(stock));
  writeDb(db);
  return true;
}

// ===== FEATURE: 🔢 Add Manual Stock (a plain number) =====
// Unlike addStockItems() above (which takes REAL links/codes one per line for
// auto-delivery), this function only ADDS A PLAIN NUMBER to variant.stock - used
// by admins via /admin -> 📥 Add Stock -> "🔢 Add Number Only (Manual)" for
// products that are NOT auto-delivered (accounts the admin sends to the buyer
// themselves after an order comes in). It still uses the SAME variant.stock field
// that mirrors stockItems.length (see the comment on setVariantStock above) - so
// if this variant is LATER also used via addStockItems (pasting links), stock will
// be overwritten back to stockItems.length (no longer this manual number). That is
// DELIBERATELY consistent with how variant.stock has always been used; just avoid
// mixing the two approaches on the same variant if you do not want the number
// overwritten.
function addManualStock(productId, variantId, qty) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return null;
  const addQty = Math.round(Number(qty));
  if (!addQty || isNaN(addQty) || addQty <= 0) return null;
  variant.stock = (variant.stock || 0) + addQty;
  writeDb(db);
  return { added: addQty, total: variant.stock };
}

// Overwrite a variant's tiers array (sale price per qty range) directly - used by
// refreshSupplierData() in bot.js to RECALCULATE the sale price of a Supplier API
// variant from the live cost plus a markup percentage (see
// DEFAULT_SUPPLIER_TIER_MARKUP / getVariantTierMarkup), so the price buyers see
// always follows the supplier's latest price rather than a stale number.
function setVariantTiers(productId, variantId, tiers) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant || !Array.isArray(tiers) || !tiers.length) return false;
  variant.tiers = tiers;
  writeDb(db);
  return true;
}

// Optional per-variant markup override - when it is not set, refreshSupplierData()
// uses DEFAULT_SUPPLIER_TIER_MARKUP from config.js for ALL Supplier API variants.
// Useful when one particular product needs its own markup (for example a more
// competitive product needing a thinner margin).
function setVariantTierMarkup(productId, variantId, tierMarkup) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant || !Array.isArray(tierMarkup) || !tierMarkup.length) return false;
  variant.tierMarkup = tierMarkup;
  writeDb(db);
  return true;
}

function getVariantTierMarkup(variant, defaultMarkup) {
  return (variant && Array.isArray(variant.tierMarkup) && variant.tierMarkup.length)
    ? variant.tierMarkup
    : defaultMarkup;
}

// Toggle a per-variant "manual price lock" - when true, refreshSupplierData() in
// bot.js skips RECALCULATING the tiers (computeTiersFromCost) for this variant,
// while still syncing the cost (supplierCost) and stock as usual.
// Used for Supplier API variants whose price an admin has already set manually via
// "🎁 Set Bulk Discount Tiers" and does not want overwritten by auto-sync again.
function setVariantPriceLock(productId, variantId, locked) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  variant.priceLocked = !!locked;
  writeDb(db);
  return true;
}

// List every variant currently linked to the supplier API - used by the
// "Supplier API" screen in /admin (to see which variants auto-order via AIVerse
// Hub, plus a per-variant unlink button).
function getSupplierLinkedVariants() {
  const db = readDb();
  const result = [];
  db.products.forEach(p => {
    p.variants.forEach(v => {
      if (v.supplierServiceId) result.push({ productId: p.id, productName: p.name, variant: v });
    });
  });
  return result;
}

// ===== Supplier API (Canboso) - link one variant to one remote product_id =====
// EXACTLY the same pattern as setVariantSupplier/clearVariantSupplier/
// getSupplierLinkedVariants above (AIVerse Hub), but with separate fields
// (canbosoProductId/canbosoCost) so a variant can have EITHER of the two
// suppliers (not both at once - the purchase flow in bot.js prioritises AIVerse
// Hub if both are somehow set, so the link/unlink UI in admin is designed to be
// mutually exclusive per variant).
function setVariantCanboso(productId, variantId, canbosoProductId, costPrice) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  variant.canbosoProductId = canbosoProductId;
  if (typeof costPrice === 'number' && !isNaN(costPrice)) {
    variant.canbosoCost = costPrice;
  }
  writeDb(db);
  return true;
}

function clearVariantCanboso(productId, variantId) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  delete variant.canbosoProductId;
  delete variant.canbosoCost;
  writeDb(db);
  return true;
}

function getCanbosoLinkedVariants() {
  const db = readDb();
  const result = [];
  db.products.forEach(p => {
    p.variants.forEach(v => {
      if (v.canbosoProductId) result.push({ productId: p.id, productName: p.name, variant: v });
    });
  });
  return result;
}

function setHowToUse(productId, variantId, text) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  variant.howToUse = text;
  writeDb(db);
  return true;
}

// Same as setHowToUse() above, but for the "description" field - used by the
// admin "Set Description" action (mirroring "Set How to Use") so a variant
// description created through "Add Variant" (which never used to ask for a
// description at all) can be filled in later without editing data/db.json by hand.
function setDescription(productId, variantId, text) {
  const db = readDb();
  const product = db.products.find(p => p.id === productId);
  const variant = product && product.variants.find(v => v.id === variantId);
  if (!variant) return false;
  variant.description = text;
  writeDb(db);
  return true;
}

function removeProduct(productId) {
  const db = readDb();
  const before = db.products.length;
  db.products = db.products.filter(p => p.id !== productId);
  writeDb(db);
  return db.products.length < before;
}

function getAllProducts() {
  return readDb().products;
}

// ===================== Custom Emoji ID (from "automatic capture") =====================
// Example keys: "menu:buy_product" (a button icon) or "teks:product_desc" /
// "teks:menu_notif" (emoji inside text). Stored in db.json so they PERSIST across
// bot restarts WITHOUT the admin editing a .js file by hand - filled in
// automatically by the "🎨 Manage Emoji ID" feature in /admin (forward an emoji).
function setEmojiId(key, customEmojiId) {
  const db = readDb();
  db.emojiIds[key] = customEmojiId;
  writeDb(db);
}

function getEmojiId(key) {
  return readDb().emojiIds[key] || null;
}

function getAllEmojiIds() {
  return readDb().emojiIds;
}

function clearEmojiId(key) {
  const db = readDb();
  delete db.emojiIds[key];
  writeDb(db);
}

// ===== Gift orders (the "🎁 Buy Gift" / "💌 Confess Gift" features - see userbot.js) =====
// Kept separate from createOrder() (ordinary catalogue product orders) because a
// gift has NO productId/variantId/local stock - its source is the live catalogue
// from Telegram (userbot.getGiftCatalog()), not data/db.json.
function createGiftOrder(fields) {
  const db = readDb();
  const order = {
    id: 'GFT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
    chatId: fields.chatId,
    username: fields.username || '',
    mode: fields.mode,                 // 'buy' | 'confess' | 'saved'
    giftId: fields.giftId,             // catalogue id (buy/confess mode) OR the saved gift msgId ('saved' mode)
    stars: fields.stars,
    priceUsd: fields.priceUsd,
    target: fields.target,             // destination username/id, as entered
    message: fields.message || null,   // the anonymous message ('confess' mode)
    status: 'pending',                 // 'pending' | 'sent' | 'failed_refunded'
    error: null,
    createdAt: Date.now()
  };
  db.giftOrders.push(order);
  writeDb(db);
  return order;
}

function updateGiftOrder(orderId, patch) {
  const db = readDb();
  const order = db.giftOrders.find(o => o.id === orderId);
  if (!order) return null;
  Object.assign(order, patch);
  writeDb(db);
  return order;
}

function getGiftOrdersByUser(chatId) {
  const db = readDb();
  return db.giftOrders.filter(o => String(o.chatId) === String(chatId)).sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = {
  readDb, writeDb, getUser, updateBalance,
  registerReferral, creditReferralOnFirstDeposit, getReferralStats,
  findProduct, findVariant, getBasePrice, getBulkPrice, getUnitPriceForQty, decrementStock,
  getTotalStock, restoreStockItems,
  addStockItems, popStockItems, getStockItemCount, addManualStock,
  createDeposit, getDeposit, updateDeposit, getPendingDeposits, getUsedUsdtAmounts, getUsedTonAmounts, getUsedBinanceAmounts, isTxHashUsed,
  createOrder, getOrdersByUser, getOrderById, getDeliveryLogs,
  setPendingAction, getPendingAction, clearPendingAction,
  addProduct, addSimpleProduct, addVariant, setVariantPrice, setHowToUse, setDescription, setProductLogo, setProductEmoji, removeProduct, getAllProducts,
  setVariantSupplier, clearVariantSupplier, setVariantStock, getSupplierLinkedVariants,
  setVariantCanboso, clearVariantCanboso, getCanbosoLinkedVariants,
  setVariantTiers, setVariantTierMarkup, getVariantTierMarkup, setVariantPriceLock,
  setEmojiId, getEmojiId, getAllEmojiIds, clearEmojiId,
  getBackupSettings, setBackupSettings,
  getGiftPricingSettings, setGiftPricingSettings,
  getForceJoinSettings, setForceJoinEnabled, addForceJoinChannel, removeForceJoinChannel, getForceJoinChannels,
  getChannelNotifSettings, setChannelNotifSettings,
  getMaintenanceSettings, setMaintenanceSettings, getUsersList,
  createGiftOrder, updateGiftOrder, getGiftOrdersByUser
};
