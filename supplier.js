// ============================================================
// supplier.js — "Supplier" API integration (https://aiversehub.store)
// ============================================================
// Powers the "Supplier API" feature: this store can link one of its local
// product variants to a `service_id` on the supplier's side. As soon as a
// buyer purchases a linked variant, the bot places the order AUTOMATICALLY
// through the API (instead of using local `stockItems`) and forwards the
// code/link the API returns straight to the buyer - much like automated
// dropshipping.
//
// Official documentation: https://aiversehub.store/docs
// Auth: an "X-API-Key: <key>" header on every request.
// Rate limit: 3 requests/second per API key (429 response when exceeded).
// ============================================================

require('dotenv').config();

const AIVERSEHUB_API_KEY = process.env.AIVERSEHUB_API_KEY || '';
const AIVERSEHUB_BASE_URL = (process.env.AIVERSEHUB_BASE_URL || 'https://aiversehub.store').replace(/\/+$/, '');

// Same as fetchWithTimeout() in payment.js - without a timeout, a hanging
// request (a slow or frozen supplier API) could stall a user's purchase
// indefinitely (and make the "Place Order" button look stuck).
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
  if (!AIVERSEHUB_API_KEY) {
    throw new Error('AIVERSEHUB_API_KEY has not been set in .env');
  }
}

// Generic request to the Supplier API. `query` (an object) is optional, for
// GET requests with a query string. Throws an Error with a clear message for
// every kind of failure (network, timeout, non-2xx HTTP, rate limit, invalid
// JSON) so callers can simply try/catch without checking statuses by hand.
async function apiRequest(method, path, { query, body } = {}) {
  ensureConfigured();
  let url = `${AIVERSEHUB_BASE_URL}${path}`;
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      'X-API-Key': AIVERSEHUB_API_KEY,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (res.status === 429) {
    throw new Error('Supplier: rate limit reached (429 Too Many Requests), please try again shortly.');
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error(`Supplier: response was not JSON (HTTP ${res.status}) at ${path}`);
  }

  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
    throw new Error(`Supplier API error at ${path}: ${msg}`);
  }

  return json;
}

// GET /api/v1/me - our store's profile and wallet balance ON THE SUPPLIER'S
// SIDE (not a buyer's Wallet balance in this bot - two different things).
async function getMe() {
  return apiRequest('GET', '/api/v1/me');
}

// GET /api/v1/products - every service/product available from the supplier,
// together with their real-time price and stock. Returns an empty array when
// the response has no `services` field (in case the format ever changes).
async function getProducts() {
  const json = await apiRequest('GET', '/api/v1/products');
  return Array.isArray(json.services) ? json.services : [];
}

// POST /api/v1/order - place an order automatically. On success it returns
// { order_id, total_cost, new_balance, products }, exactly the structure in
// the docs - and throws an Error (see apiRequest) on failure (for example our
// supplier balance running out, or the remote stock being empty).
async function placeOrder(serviceId, quantity) {
  return apiRequest('POST', '/api/v1/order', { body: { service_id: serviceId, quantity } });
}

// GET /api/v1/order/{id} - details of a single order (used for manual
// auditing/debugging from /admin when a specific order's status needs to be
// re-checked on the supplier's side).
async function getOrderById(orderId) {
  const json = await apiRequest('GET', `/api/v1/order/${encodeURIComponent(orderId)}`);
  return json && json.order ? json.order : null;
}

// GET /api/v1/orders - our order history with the supplier (the maximum limit
// the API allows is 200 - capped here too so we do not keep getting a "limit
// too large" error back from the API).
async function getOrders({ page, limit } = {}) {
  const safeLimit = limit ? Math.min(Number(limit), 200) : undefined;
  return apiRequest('GET', '/api/v1/orders', { query: { page, limit: safeLimit } });
}

// GET /api/v1/stats - statistics for our supplier account (total deposits,
// total spend, per-product breakdown). `start`/`end` are optional, in exactly
// the format from the docs: YYYY-MM-DD-HH:MM-AM/PM.
async function getStats({ start, end } = {}) {
  return apiRequest('GET', '/api/v1/stats', { query: { start, end } });
}

module.exports = {
  AIVERSEHUB_API_KEY,
  AIVERSEHUB_BASE_URL,
  getMe,
  getProducts,
  placeOrder,
  getOrderById,
  getOrders,
  getStats
};
