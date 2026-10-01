// ============================================================
// supplierCanboso.js — "Supplier Canboso" API integration (https://canboso.com)
// ============================================================
// The same idea as supplier.js (AIVerse Hub), but for the SECOND supplier:
// Canboso. Powers the "Canboso API" feature: a local product variant can be
// linked to a `product_id` on Canboso. As soon as a buyer purchases a linked
// variant, the bot places the order AUTOMATICALLY through this API (instead of
// using local `stockItems`) and forwards the code/link/account the API returns
// straight to the buyer — much like automated dropshipping, exactly the pattern
// supplier.js already uses.
//
// Official documentation: https://canboso.com/api/swagger
// Endpoints used:
//   GET  /api/v2/telegram-buyer/products  -> the list of available products
//   POST /api/v2/telegram-buyer/purchase  -> buy a product using the wallet balance
//        (the WALLET ON CANBOSO'S SIDE belonging to this API key's account — NOT
//        a buyer's Wallet balance in this bot; two different things, just like
//        getMe() in supplier.js. That wallet MUST be topped up on Canboso's side
//        before a purchase can go through — when the balance is short, the API
//        returns an error, which is caught as an ordinary Error below.)
//
// Auth: the documentation does not explicitly name the header in the short
// description provided, so the API key is sent via 2 headers at once, so it works
// whatever convention Canboso uses behind the scenes:
//   - Authorization: Bearer <key>   (the most common REST convention)
//   - X-API-Key: <key>              (the convention used by supplier.js/AIVerse Hub)
// If Canboso turns out to need a different header name, check once at
// https://canboso.com/api/swagger (try "Authorize" there) and adjust the
// `headers` object in apiRequest() below — a single place.
// ============================================================

require('dotenv').config();
const crypto = require('crypto');

const CANBOSO_API_KEY = process.env.CANBOSO_API_KEY || '';
const CANBOSO_BASE_URL = (process.env.CANBOSO_BASE_URL || 'https://canboso.com').replace(/\/+$/, '');

// Same as fetchWithTimeout() in supplier.js/payment.js - without a timeout, a
// hanging request (a slow or frozen supplier API) could stall a user's purchase
// indefinitely.
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function ensureConfigured() {
  if (!CANBOSO_API_KEY) {
    throw new Error('CANBOSO_API_KEY has not been set in .env');
  }
}

// Generic request to the Canboso API. `query` (an object) is optional for GET
// requests with a query string, `body` (an object) is optional for POST/PUT/etc.
// Throws an Error with a clear message for every kind of failure (network,
// timeout, non-2xx HTTP, rate limit, invalid JSON) so callers can simply
// try/catch without checking statuses by hand — the same pattern as apiRequest()
// in supplier.js.
async function apiRequest(method, path, { query, body, headers } = {}) {
  ensureConfigured();
  let url = `${CANBOSO_BASE_URL}${path}`;
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      'Authorization': `Bearer ${CANBOSO_API_KEY}`,
      'X-API-Key': CANBOSO_API_KEY,
      ...(body ? { 'content-type': 'application/json' } : {}),
      // Extra per-request headers (for example Idempotency-Key for POST
      // /purchase - see purchase() below). Placed AFTER the defaults above so
      // that a caller wins if an override is ever needed.
      ...(headers || {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (res.status === 429) {
    throw new Error('Canboso: rate limit reached (429 Too Many Requests), please try again shortly.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Canboso: API key rejected (HTTP ${res.status}) - double-check CANBOSO_API_KEY in .env.`);
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error(`Canboso: response was not JSON (HTTP ${res.status}) at ${path}`);
  }

  if (!res.ok) {
    // ===== BUG FIX: previously this only checked json.error/json.message/
    // json.msg - the same pattern as the stock field-naming bug found earlier
    // (see getProducts() below). When Canboso's real error message field turns
    // out to be named something else ("detail", "reason", or nested as
    // {error: {message: "..."}}) - which happens MOST OFTEN on exactly the
    // important cases such as "wallet balance not enough" - the admin only got a
    // generic "HTTP 400" with no idea of the real reason. It now tries many more
    // field names plus one nested level, and when all of them still fail it
    // includes a slice of the raw JSON (instead of just "HTTP xxx") so the admin
    // still gets a clue from the error message, the same approach as
    // describeRawFields() in bot.js.
    let msg = pick(json, ['error', 'message', 'msg', 'detail', 'reason', 'description', 'errorMessage', 'error_message']);
    if (msg && typeof msg === 'object') {
      msg = pick(msg, ['message', 'error', 'msg', 'detail', 'reason']) || JSON.stringify(msg).slice(0, 200);
    }
    if (!msg) msg = `HTTP ${res.status} (raw: ${JSON.stringify(json).slice(0, 200)})`;
    throw new Error(`Canboso API error at ${path}: ${msg}`);
  }

  return json;
}

// Return the first field that EXISTS (is not undefined/null) on an object,
// trying a list of candidate names in order - used so this code tolerates the
// naming variations Canboso might use ("id" vs "product_id", "price" vs "cost")
// without having to know the EXACT schema 1:1 up front.
function pick(obj, keys, fallback) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
}

// Convert ANY value to a number safely - used specifically for price/stock,
// because some APIs (possibly Canboso included) return numbers as formatted
// strings ("$12.00", "12,000", "Rp15.000") or wrapped in an object
// ({ amount: 12, currency: "USD" }) instead of a raw number. Without this,
// Number("$12.00") -> NaN and the cost price becomes "unknown" even though the
// data IS in the response, just in a different format. Returns NaN when the
// value genuinely cannot be parsed at all.
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    // Broadened: besides {amount}/{value}, some APIs wrap stock as
    // {available}/{count}/{qty}/{stock} nested one level deep - all are tried so
    // toNumber() still matches even when the shape is nested.
    if (v.amount !== undefined) return toNumber(v.amount);
    if (v.value !== undefined) return toNumber(v.value);
    if (v.available !== undefined) return toNumber(v.available);
    if (v.count !== undefined) return toNumber(v.count);
    if (v.qty !== undefined) return toNumber(v.qty);
    if (v.stock !== undefined) return toNumber(v.stock);
  }
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.\-]/g, '');
    return cleaned === '' ? NaN : parseFloat(cleaned);
  }
  return NaN;
}

// GET /api/v2/telegram-buyer/products - every product available on Canboso with
// its price and stock. The API response may wrap the array in several different
// shapes (a bare array, or inside `data`/`products`/`result`) - all are tried so
// it keeps working whatever the shape is. Each item is normalised into
// { id, name, price, stock, raw } so the rest of the code (bot.js) never needs
// to know the raw schema.
async function getProducts() {
  const json = await apiRequest('GET', '/api/v2/telegram-buyer/products');
  const rawList = Array.isArray(json) ? json
    : Array.isArray(json.data) ? json.data
    : Array.isArray(json.products) ? json.products
    : Array.isArray(json.result) ? json.result
    : [];

  return rawList.map(item => ({
    id: pick(item, ['id', 'product_id', 'productId', 'slug']),
    name: pick(item, ['name', 'title', 'product_name'], 'Unnamed'),
    price: toNumber(pick(item, ['price', 'cost', 'harga', 'sell_price', 'base_price', 'amount', 'price_usd', 'unit_price', 'modal', 'harga_modal'])),
    // IMPORTANT: there is deliberately NO default fallback of 0 here (unlike
    // before) - when none of these candidate field names is found in the
    // response, the result must be NaN ("unknown"), NOT 0 ("definitely sold
    // out"). The old fallback of 0 was a BUG: it made the live stock check in
    // bot.js wrongly treat a product whose stock field was not yet recognised as
    // genuinely out of stock (0), when in fact it simply could not be read - only
    // discovered after the live stock check was added. `bot.js` is already
    // designed to handle NaN safely (skip the block, do not write to
    // variant.stock) - never reintroduce a numeric fallback here.
    // Broadened from the previous list (stock/qty/quantity/available/stok/
    // remaining/available_stock) - with other names commonly used by similar
    // premium-account marketplaces added, so it is less and less likely that
    // stock stays NaN because of an unguessed field name.
    // 'availability' was added SPECIFICALLY for Canboso's actual schema
    // (confirmed from the 🐞 Raw Response): stock is wrapped in
    // { availability: { available: 9, sold: 141 } } rather than being a plain
    // number field - toNumber() above already reads v.available from a nested
    // object, so once 'availability' is in this list, pick() returns that object
    // and toNumber() automatically picks out its `available` number.
    // If it is STILL NaN after this, confirm the field really is none of these
    // using 🐞 View Raw Response (debug) in /admin -> Canboso API, then add the
    // real field name to this list.
    stock: toNumber(pick(item, [
      'availability', 'stock', 'qty', 'quantity', 'available', 'stok', 'remaining',
      'available_stock', 'stock_count', 'stockCount', 'in_stock', 'inStock',
      'totalStock', 'total_stock', 'stok_tersedia', 'available_qty',
      'availableQty', 'qty_available', 'inventory', 'items_available',
      'itemsAvailable', 'left', 'remaining_stock', 'remainingStock', 'count'
    ])),
    raw: item
  })).filter(p => p.id !== undefined);
}

// Same as getProducts(), but returns the RAW JSON as is (with no field
// normalisation) - used SPECIFICALLY by the "🐞 View Raw Response" debug button
// in /admin -> Canboso API, so that when the field normalisation in
// getProducts() above turns out to be wrong (API field names differ from what
// was assumed), the admin can see the ORIGINAL response shape straight from
// Telegram without opening Postman/curl separately, then send it to a developer
// to adjust the field mapping in one place (getProducts() above).
async function getRawProducts() {
  return apiRequest('GET', '/api/v2/telegram-buyer/products');
}

// A short cache (20 seconds by default) for getProducts() - used by the LIVE
// STOCK check that runs every time a buyer opens the variant/qty/confirm page
// (see bot.js) so the Canboso API is NOT called over and over within seconds
// when many buyers open the same product at almost the same moment (protecting
// the rate limit). The admin can still see the very latest data at any time via
// "🔄 Refresh Price & Stock" (which calls the UNCACHED getProducts()) or
// "🐞 View Raw Response" (getRawProducts()).
let productsCache = { data: null, ts: 0 };
async function getProductsCached(ttlMs = 20000) {
  const now = Date.now();
  if (productsCache.data && (now - productsCache.ts) < ttlMs) return productsCache.data;
  const data = await getProducts();
  productsCache = { data, ts: now };
  return data;
}

// Find a single Canboso product by id from the (live/cached) list - used to
// check the CURRENT stock before the buyer picks a quantity and before the order
// is actually processed, so the number the buyer sees and is validated against
// always follows the real Canboso value rather than a local snapshot that may be
// stale (see the stock bug notes in bot.js). Returns null when the id is not in
// the list at all (the product was deleted from Canboso) - NOT 0, so the caller
// can tell "genuinely sold out" apart from "could not check / not found".
async function getLiveStock(productId, { cached = true } = {}) {
  const products = cached ? await getProductsCached() : await getProducts();
  return products.find(p => String(p.id) === String(productId)) || null;
}

// POST /api/v2/telegram-buyer/purchase - buy one product using our Canboso
// account's wallet balance. `productId` is required (take it from getProducts()
// -> .id), `quantity` defaults to 1. Throws an Error (see apiRequest) on failure
// (for example our Canboso wallet balance running out or not being topped up, or
// the remote stock being empty). Returns a normalised object:
//   { orderId, items, raw } — `items` is an array of strings (the purchased
//   codes/accounts/links) ready to forward to the buyer, read from several
//   possible API response field names so it tolerates schema variation.
//
// ===== BUG FIX: Canboso REQUIRES an `Idempotency-Key` header (8-128 chars) on
// every POST /purchase - previously this header was NEVER sent at all, so the
// API rejected the call outright with 400 "A valid Idempotency-Key header is
// required" BEFORE it ever deducted the Canboso wallet balance or the remote
// stock. The effect: the order always failed in the caller (see bot.js) even
// though the wallet balance and live stock really were there, and the user's
// (local) balance correctly went untouched (the order was cancelled
// automatically) - but buyers could never check out a Canboso product at all.
//
// The fix: generate one UUID v4 (36 chars, within the required 8-128 range) per
// call using Node's built-in crypto.randomUUID(), sent as the `Idempotency-Key`
// header. It can be overridden via extra.idempotencyKey (for example if a caller
// ever needs to retry the EXACT SAME request without risking a double charge on
// Canboso's side - the same idempotency key is treated as the same request by
// the API); that key is pulled out of `extra` first so it does not get mixed
// into the request body.
// ===== BUG FIX #2 (confirmed from Canboso's official Swagger documentation,
// sent by the user as a screenshot): the real SUCCESS response schema is NOT
// flat top-level fields as previously assumed (order_id/items/accounts directly)
// - it is wrapped in 2 separate objects:
//   { success, order: { orderCode, status, productId, quantity,
//       bonusQuantity, finalQuantity, ... },
//     payment: { amount, currency, balance, ... },
//     delivery: { accounts: [ ...purchased accounts/codes... ] } }
// The order ID lives at `order.orderCode` (NOT order_id/orderId/id at the top
// level), and the delivered items live at `delivery.accounts` (NOT `accounts`/
// `items` at the top level). This is exactly what caused the real-world case: an
// order SUCCEEDED (the Canboso balance was deducted, confirmed via the 🐞 raw
// response added earlier) but the bot always failed to extract anything.
// The docs also confirm the request body MUST include a `key` field (the buyer
// key) alongside product_id/quantity - previously never sent in the body (only
// via the Authorization/X-API-Key headers), so it is added here.
async function purchase(productId, quantity = 1, extra = {}) {
  const { idempotencyKey, ...bodyExtra } = extra;
  const key = idempotencyKey || crypto.randomUUID();
  const body = { key: CANBOSO_API_KEY, product_id: productId, quantity, ...bodyExtra };

  // ===== BUG FIX #3: a /purchase request that TIMES OUT (see fetchWithTimeout,
  // 15 seconds) must NOT be treated as an outright failure - the response may
  // simply be slow BECAUSE Canboso already finished processing on their side
  // (the wallet balance and remote stock ALREADY deducted), with only the reply
  // failing to arrive before our timeout expired. If that happens and the caller
  // (bot.js) treats it as a failure and does not try again, the product that was
  // already bought is simply LOST - no buyer receives it, no order is recorded,
  // even though our Canboso balance has been drained.
  //
  // The fix: Canboso's docs guarantee that a retry with the EXACT SAME
  // Idempotency-Key returns the ORIGINAL response (rather than reprocessing or
  // double-charging) - so when the first attempt times out, it is safe to try
  // ONCE more with an identical key to fetch the real result, instead of giving
  // up immediately and throwing to the caller.
  let json;
  try {
    json = await apiRequest('POST', '/api/v2/telegram-buyer/purchase', {
      body, headers: { 'Idempotency-Key': key }
    });
  } catch (err) {
    // Detect a timeout loosely (rather than an ordinary HTTP error from Canboso,
    // which always carries a specific message such as "Wallet balance is not
    // enough" / "Invalid API key") - only network/timeout cases are safe and
    // sensible to retry with the same Idempotency-Key.
    if (!/timeout/i.test(err.message)) throw err;
    console.error(`Canboso purchase timed out (product_id=${productId}, idempotency-key=${key}) - retrying once with the same key...`);
    json = await apiRequest('POST', '/api/v2/telegram-buyer/purchase', {
      body, headers: { 'Idempotency-Key': key }
    });
  }

  const order = (json && typeof json.order === 'object' && json.order) ? json.order : {};
  const delivery = (json && typeof json.delivery === 'object' && json.delivery) ? json.delivery : {};

  // The PRIMARY location per the docs: delivery.accounts. The older candidates
  // (top-level/json.data) are kept as a FALLBACK only - in case another product
  // type (a productType other than "account") wraps it differently.
  let items = pick(delivery, ['accounts', 'items', 'products', 'codes', 'result']);
  if (!Array.isArray(items)) {
    const payload = (json && typeof json.data === 'object' && json.data) ? json.data : json;
    items = pick(payload, ['items', 'products', 'codes', 'accounts', 'result']);
  }
  if (!Array.isArray(items)) {
    const single = pick(delivery, ['code', 'account', 'license', 'link', 'content']);
    items = single !== undefined ? [single] : [];
  }
  // Each account may well be an OBJECT ({username, password} or
  // {email, password, profile}) rather than a single string - it is formatted as
  // "key: value" text one per line so it reads cleanly and can be forwarded to
  // the buyer as is, instead of a messy raw JSON dump.
  items = items.map(it => {
    if (typeof it === 'string') return it;
    if (it && typeof it === 'object') {
      return Object.entries(it).map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    return JSON.stringify(it);
  });

  return {
    orderId: pick(order, ['orderCode', 'order_id', 'orderId', 'id'], null),
    items,
    raw: json
  };
}

module.exports = {
  CANBOSO_API_KEY,
  CANBOSO_BASE_URL,
  getProducts,
  getProductsCached,
  getLiveStock,
  getRawProducts,
  purchase
};
