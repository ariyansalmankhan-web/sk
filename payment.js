// ============================================================
// payment.js — Automatic payment integrations
//
// 1) QRIS via PayKita (pay.digikita.id)
// 2) USDT on the BEP20 network (BNB Smart Chain), monitored on-chain DIRECTLY
//    against a public BSC RPC node (JSON-RPC eth_getLogs) - NOT through the
//    BscScan/Etherscan API any more. Etherscan now locks free access to the
//    BNB/Base/Avalanche/OP chains behind a paid plan (Lite $49/month), so we read
//    straight from the blockchain instead - free forever, no API key, no tight
//    rate limit, and never paywalled again.
//
// ⚠️ NOTES on the QRIS/PayKita part:
// The create-order response fields are confirmed from a real payload (see the
// example error log): the EMV QR payload field is called "qris" (a raw string,
// not an image URL), the EXACT amount to pay is in "pay_amount"
// (= base_amount + unique_code), and there is also a "checkout_url" (a link to
// PayKita's hosted payment page) usable as a fallback or extra button.
// IMPORTANT: the base_amount sent to PayKita MUST be in Rupiah (IDR) - QRIS in
// Indonesia only supports Rupiah amounts, so bot.js must convert the USD amount
// to IDR before calling paykitaCreateOrder().
//
// The code below stays DEFENSIVE (still trying a few alternative field names) in
// case PayKita renames fields in future. The status-check endpoint is NOT yet
// verified exactly (the official documentation requires a dashboard login), so it
// still tries several common paths in order in STATUS_PATH_CANDIDATES - adjust
// there if none of them turns out to match once live.
//
// ============================================================

require('dotenv').config();
const crypto = require('crypto');

// Every fetch() to an external API MUST go through here, never a bare fetch().
// Without a timeout, a hanging request (a slow external API that freezes without
// responding) could hang INDEFINITELY - which is what made deposit polling
// (USDT/TON/QRIS) prone to overlapping ticks and double-crediting user balances.
// The default is 15 seconds, generous enough for on-chain APIs but still far
// shorter than the polling interval itself (20-30 seconds).
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

const PAYKITA_API_BASE = process.env.PAYKITA_API_BASE || 'https://paykita.biz.id';
const PAYKITA_API_KEY = process.env.PAYKITA_API_KEY || '';

const USDT_BEP20_ADDRESS = process.env.USDT_BEP20_ADDRESS || '';
const USDT_BEP20_CONTRACT = process.env.USDT_BEP20_CONTRACT || '0x55d398326f99059fF775485246999027B3197955'; // the official USDT on BSC mainnet

// Public BSC RPC nodes - FREE, no API key. Tried in order (falling back to the
// next endpoint when one fails/is down/is rate-limited) to be more robust than
// relying on a single provider. Can be fully overridden via .env (comma
// separated) to use a private RPC (Ankr with your own API key, or your own node)
// for higher reliability.
// publicnode and ankr are deliberately placed first - both still supported
// eth_getLogs publicly. bsc-dataseed.* sits last because eth_getLogs is
// PERMANENTLY DISABLED on those nodes (they always reply with error -32005
// "limit exceeded"), so keeping them at the back avoids wasting time trying them
// first on every poll - those endpoints are only a last-resort fallback for other
// methods (eth_blockNumber, etc.) should everything else happen to be down at
// once.
// ===== BUG FIX v10: of the 5 public RPCs tried, only bsc.publicnode.com STILL
// genuinely works for eth_getLogs. The rest are dead:
// - rpc.ankr.com/bsc: NOW REQUIRES an API key ("Unauthorized: You must
//   authenticate your request with an API key") - it used to be free without a
//   key, no longer.
// - bsc-dataseed1.defibit.io, bsc-dataseed1.ninicoin.io and
//   bsc-dataseed.binance.org: ALL reply -32005 "limit exceeded" for eth_getLogs
//   whatever the block range (not a matter of how many requests we send -
//   confirmed manually with curl straight from the server, with exactly the same
//   result even for a SINGLE request).
// The bot previously still tried all 4 dead RPCs first (one by one, each waiting
// for a timeout or a failure response) BEFORE finally reaching publicnode, which
// actually works - wasting time and making it easier to miss the deposit window.
// Only publicnode is now used for eth_getLogs by default. Should publicnode start
// having problems too, replace or extend the list via BSC_RPC_URL in .env (comma
// separated) - for example register a free Ankr API key at
// https://www.ankr.com/rpc/ and put the URL with your key there.
const BSC_RPC_URLS = (
  process.env.BSC_RPC_URL ||
  'https://bsc.publicnode.com'
).split(',').map(s => s.trim()).filter(Boolean);

// TON / Toncoin (The Open Network) - monitored automatically via the TonCenter API
// (https://toncenter.com), free and without an API key (the rate limit is more
// generous with TONCENTER_API_KEY set - register free at https://toncenter.com/api-key).
const TON_ADDRESS = process.env.TON_ADDRESS || '';
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || '';
const TONCENTER_API_BASE = process.env.TONCENTER_API_BASE || 'https://toncenter.com/api/v2';

// Binance Pay (C2C transfer to a personal Binance ID) - monitored automatically
// via Binance's OFFICIAL "Get Pay Trade History" endpoint (USER_DATA, a REGULAR
// API KEY, NOT the Merchant API - see the full notes in config.js).
const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '';
const BINANCE_PAY_ID = process.env.BINANCE_PAY_ID || '';
const BINANCE_API_BASE = process.env.BINANCE_API_BASE || 'https://api.binance.com';

// ===================== USD -> IDR rate (live, cached) =====================
// Used specifically to calculate the QRIS amount (QRIS in Indonesia only supports
// Rupiah). This store's Wallet balance is conceptually 1:1 with USDT (just like
// the USDT BEP20 topup flow below), so the rate is taken from the LIVE USDT/IDR
// MARKET PRICE on CoinGecko - rather than an official forex rate
// (open.er-api.com) as before - so the QRIS amount asked of the buyer reflects
// the USDT price that genuinely applies, not a bank/forex rate that can differ
// quite a lot from the crypto market price. Cached for 5 minutes (same as
// getTonToUsdRate() below - crypto prices are more volatile than fiat rates, so
// the cache is deliberately shorter than the old 1 hour) to avoid fetching every
// time a user tops up; and when the API is down or times out it falls back
// automatically to the last cached rate, or to a default value (fallbackRate) if
// no fetch has ever succeeded since the bot started.
const RATE_API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr';
const RATE_CACHE_MS = 5 * 60 * 1000; // 5 minutes
let cachedRate = null;
let cachedRateAt = 0;

async function getUsdToIdrRate(fallbackRate) {
  const now = Date.now();
  if (cachedRate && (now - cachedRateAt) < RATE_CACHE_MS) {
    return cachedRate;
  }
  try {
    const res = await fetchWithTimeout(RATE_API_URL);
    const json = await res.json();
    const price = json && json.tether && json.tether.idr;
    if (typeof price === 'number' && price > 0) {
      cachedRate = price;
      cachedRateAt = now;
      return cachedRate;
    }
  } catch (err) {
    console.error('Failed to fetch the live USDT/IDR price (CoinGecko):', err.message);
  }
  // The fetch failed: use the old cache if there is one (more accurate than a
  // static fallback), and only fall back when there has never been a cache at all.
  return cachedRate || fallbackRate;
}

// A SYNC version of the USD->IDR rate, for places that cannot or should not
// 'await' (such as the usd() price-formatting function in bot.js, called in the
// middle of a template string). It uses the same cache as the async version
// above - when the cache has never been filled (the bot just started and nothing
// has triggered getUsdToIdrRate() even once), it returns the static fallback.
// It never performs a fetch of its own, so it is never more "stale" than the
// cache that already exists.
function getCachedUsdToIdrRate(fallbackRate) {
  return cachedRate || fallbackRate;
}

// ===================== TON -> USD rate (live, cached) =====================
// Used to work out how much TON is equivalent to the USD amount a user requests
// when topping up with TON. Taken from CoinGecko (free, no API key) and cached
// for 5 minutes (the TON price is more volatile than the USD/IDR fiat rate).
const TON_RATE_API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd';
const TON_RATE_CACHE_MS = 5 * 60 * 1000; // 5 minutes
let cachedTonRate = null;
let cachedTonRateAt = 0;

async function getTonToUsdRate(fallbackRate) {
  const now = Date.now();
  if (cachedTonRate && (now - cachedTonRateAt) < TON_RATE_CACHE_MS) {
    return cachedTonRate;
  }
  try {
    const res = await fetchWithTimeout(TON_RATE_API_URL);
    const json = await res.json();
    const price = json && json['the-open-network'] && json['the-open-network'].usd;
    if (price) {
      cachedTonRate = price;
      cachedTonRateAt = now;
      return cachedTonRate;
    }
  } catch (err) {
    console.error('Failed to fetch the live TON/USD rate:', err.message);
  }
  return cachedTonRate || fallbackRate;
}

// ===================== QRIS (PayKita) =====================

// Possible field names in the create-order response that hold the QR.
// Tried one by one (including nested inside `data`).
function pickField(obj, candidates) {
  for (const key of candidates) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

async function paykitaCreateOrder(baseAmount, reference) {
  if (!PAYKITA_API_KEY) {
    throw new Error('PAYKITA_API_KEY has not been set in .env');
  }
  const res = await fetchWithTimeout(`${PAYKITA_API_BASE}/api/orders`, {
    method: 'POST',
    headers: {
      'x-api-key': PAYKITA_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ base_amount: baseAmount, reference })
  });

  let raw;
  try {
    raw = await res.json();
  } catch (e) {
    throw new Error(`PayKita create order: response was not JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(`PayKita create order failed (HTTP ${res.status}): ${JSON.stringify(raw)}`);
  }

  // The response is usually { data: {...} } or the object directly - handle both
  const data = raw.data || raw.order || raw;

  const orderId = pickField(data, ['id', 'order_id', 'orderId', 'reference']);
  // Confirmed from a real PayKita response: the QR string field is called "qris"
  // (the raw EMV QRIS payload, not an image URL). The other candidates are kept
  // as a fallback in case PayKita renames the field in future.
  const qrString = pickField(data, ['qris', 'qr_string', 'qris_string', 'qr_content', 'qris_content', 'qrString']);
  const qrImage = pickField(data, ['qr_image', 'qris_image', 'image_url', 'qr_url', 'qrImageUrl']);
  const checkoutUrl = pickField(data, ['checkout_url', 'checkoutUrl']);
  // Confirmed from a real response: "pay_amount" is the EXACT amount that must be
  // paid (base_amount + unique_code) - this is the one to show the user, not the
  // base_amount requested up front.
  const finalAmount = pickField(data, ['pay_amount', 'amount', 'final_amount', 'total_amount', 'unique_amount']) || baseAmount;
  const status = String(pickField(data, ['status']) || 'PENDING').toUpperCase();

  if (!orderId) {
    throw new Error('PayKita create order: no order id found in the response. Original payload: ' + JSON.stringify(raw));
  }
  if (!qrString && !qrImage && !checkoutUrl) {
    throw new Error('PayKita create order: no QR data found in the response. Original payload: ' + JSON.stringify(raw));
  }

  return { orderId, qrString, qrImage, checkoutUrl, finalAmount, status, raw };
}

// The status-check endpoint cannot be confirmed without a dashboard login, so we
// try a few likely common paths in order until one succeeds and contains a status
// field we recognise.
const STATUS_PATH_CANDIDATES = (orderId) => ([
  `/api/orders/${orderId}`,
  `/api/orders/${orderId}/status`,
  `/api/order/${orderId}`,
  `/api/orders?id=${orderId}`
]);

async function paykitaGetOrderStatus(orderId) {
  if (!PAYKITA_API_KEY) {
    throw new Error('PAYKITA_API_KEY has not been set in .env');
  }
  let lastErr;
  for (const path of STATUS_PATH_CANDIDATES(orderId)) {
    try {
      const res = await fetchWithTimeout(`${PAYKITA_API_BASE}${path}`, {
        headers: { 'x-api-key': PAYKITA_API_KEY }
      });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} at ${path}`); continue; }
      const raw = await res.json().catch(() => null);
      if (!raw) { lastErr = new Error(`Response was not JSON at ${path}`); continue; }
      const data = raw.data || raw.order || raw;
      const status = String(pickField(data, ['status']) || '').toUpperCase();
      if (!status) { lastErr = new Error(`No status field at ${path}`); continue; }
      const paid = ['PAID', 'SUCCESS', 'SUCCEEDED', 'COMPLETED', 'SETTLED'].includes(status);
      return { status, paid, raw };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Every PayKita status-check endpoint failed.');
}

// ===================== USDT BEP20 (on-chain, straight from a BSC RPC node) =====================
// Read Transfer(address,address,uint256) events from the official USDT-BEP20
// contract directly from the blockchain (JSON-RPC eth_getLogs) - free, no API
// key, and no dependence on BscScan/Etherscan.

// ===== BUG FIX v13: v12 (curl via child_process) TURNED OUT to still get 403,
// even though a MANUAL curl in the terminal (at exactly the same moment, from the
// same IP) still returned 200. The difference: v12 sent the body over STDIN
// (`--data-binary @-`) - because curl was reading from a pipe (not a regular
// file/string), curl did NOT know the length up front, so it automatically used a
// "Transfer-Encoding: chunked" header instead of the normal "Content-Length".
// A chunked request for a payload this small is an UNUSUAL pattern for an
// ordinary RPC request - most likely that is what made publicnode's Cloudflare
// anti-bot protection suspicious and block it, unlike the manual test using
// `-d '...'` (where curl knows the exact length and sends a normal
// Content-Length, like any ordinary request).
// The fix: send the body DIRECTLY as a `-d` argument (not via stdin/a pipe),
// EXACTLY like the manual terminal test. Because it is invoked through execFile
// (NOT exec/a shell), that argument never passes through a shell at all, so it is
// safe from quote-escaping problems even with complex JSON - execFile passes each
// argument to curl verbatim.
const { execFile } = require('child_process');

function curlJsonRpcPost(url, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const payload = JSON.stringify(bodyObj);
    execFile('curl', [
      '-s', // silent, do not show a progress bar
      '-m', String(timeoutSec), // total request timeout (seconds)
      '-X', 'POST',
      '-H', 'content-type: application/json',
      '-w', '\n%{http_code}', // append the HTTP code as the last line of output
      '-d', payload, // body directly as an argument (a normal Content-Length, like the manual test)
      url
    ], { maxBuffer: 1024 * 1024 * 20, timeout: timeoutMs + 5000 }, (err, stdout, stderr) => {
      // An err here only means the curl process itself failed to run or timed out
      // - NOT anything about the HTTP response body (that is still checked via the
      // status code in the caller, through stdout, which is still present even
      // when curl exits with a non-zero code on some HTTP errors).
      if (err && !stdout) {
        return reject(new Error(`curl failed to run (${url}): ${stderr || err.message}`));
      }
      const idx = stdout.lastIndexOf('\n');
      const respBody = idx >= 0 ? stdout.slice(0, idx) : stdout;
      const statusStr = idx >= 0 ? stdout.slice(idx + 1).trim() : '';
      const status = parseInt(statusStr, 10) || 0;
      resolve({ status, body: respBody });
    });
  });
}

// Send one JSON-RPC request (or a batch array) to an RPC endpoint, trying them in
// order until one succeeds.
//
// IMPORTANT: some public nodes (bsc-dataseed.binance.org especially) have
// PERMANENTLY DISABLED eth_getLogs, yet still reply HTTP 200 with a body holding
// a JSON-RPC error ({error:{code:-32005,message:"limit exceeded"}}).
// If we only checked res.ok (the HTTP status), an error response like that would
// count as "successful" and be returned immediately without ever trying another
// endpoint in the list - which is why it always used to get stuck on
// bsc-dataseed. So the error is checked at the JSON-RPC level here too, not just
// HTTP, before moving on to the next endpoint.
async function bscRpcRequest(body) {
  let lastErr;
  for (const url of BSC_RPC_URLS) {
    try {
      const { status, body: rawBody } = await curlJsonRpcPost(url, body, 10000);
      if (status < 200 || status >= 300) { lastErr = new Error(`RPC HTTP ${status} (${url})`); continue; }
      let json;
      try {
        json = JSON.parse(rawBody);
      } catch (e) {
        lastErr = new Error(`RPC response was not JSON (${url})`);
        continue;
      }
      // A single request (not a batch) that replies with a JSON-RPC error -> treat
      // it as a failure and try the next endpoint (rather than returning it).
      if (!Array.isArray(json) && json && json.error) {
        lastErr = new Error(`RPC ${body.method || 'batch'} error (${url}): ${json.error.message}`);
        continue;
      }
      return json;
    } catch (err) {
      lastErr = err;
      continue; // try the next RPC endpoint
    }
  }
  throw lastErr || new Error('Every BSC RPC endpoint was unreachable.');
}

async function bscRpcCall(method, params) {
  const json = await bscRpcRequest({ jsonrpc: '2.0', id: 1, method, params });
  if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
  return json.result;
}

// Batch several RPC requests into one HTTP call (cheaper and faster than one
// request per block when fetching timestamps for many blocks at once).
async function bscRpcBatchCall(requests) {
  if (requests.length === 0) return [];
  const body = requests.map((r, i) => ({ jsonrpc: '2.0', id: i, method: r.method, params: r.params }));
  const json = await bscRpcRequest(body);
  if (!Array.isArray(json)) throw new Error('RPC batch: response was not an array (the endpoint may not support batching)');
  const byId = {};
  json.forEach(item => { byId[item.id] = item; });
  return requests.map((_, i) => (byId[i] && !byId[i].error) ? byId[i].result : null);
}

const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Convert an address into 32-byte topic format (left-padded with zeros) per the
// Ethereum/BSC event log specification.
function addressToTopic(address) {
  return '0x' + '0'.repeat(24) + address.toLowerCase().replace(/^0x/, '');
}

// Convert hex wei (a "0x..." string) to a decimal number at full precision using
// BigInt (Number(BigInt) directly would lose precision for large values, so the
// decimal point is shifted manually via strings).
function hexWeiToDecimal(hex, decimals) {
  const big = BigInt(hex);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = big / divisor;
  const frac = (big % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return parseFloat(frac ? `${whole}.${frac}` : `${whole}`);
}

// Many public RPCs (bsc-dataseed, ankr, publicnode, etc.) reject eth_getLogs when
// the block range is too wide (usually only ~1000-2000 blocks at a time) with a
// "limit exceeded" error - so the request is split into several small chunks and
// the results combined, rather than one large request every node would reject.
const MAX_BLOCKS_PER_CALL = 900;

async function fetchLogsChunk(fromBlockNum, toBlockNum) {
  return await bscRpcCall('eth_getLogs', [{
    address: USDT_BEP20_CONTRACT,
    fromBlock: '0x' + fromBlockNum.toString(16),
    toBlock: '0x' + toBlockNum.toString(16),
    // topics[1] (from) is left null (any sender), topics[2] (to) is filtered
    // exactly to our wallet - so the RPC itself does the filtering rather than us
    // filtering in JS across every USDT transfer.
    topics: [TRANSFER_EVENT_TOPIC, null, addressToTopic(USDT_BEP20_ADDRESS)]
  }]);
}

// ===== BUG FIX: RANGE_BLOCKS used to be hardcoded at 3000, assuming a BSC block
// time of ~3 seconds (~2.5 hours of coverage) - far wider than a USDT deposit's
// 30-minute validity, and SEEMINGLY safe. But that block time assumption is now
// STALE: BSC has been through 3 hardforks that sped up block time (Lorentz,
// April 2025: 3s->1.5s; Maxwell, June 2025: 1.5s->0.75s; Fermi, January 2026:
// 0.75s->0.45s). At the CURRENT block time (~0.45s), 3000 blocks cover only about
// 22.5 MINUTES - SHORTER than the 30-minute deposit validity!
// The effect: if a buyer transfers early in the window and a polling tick is then
// late or fails (a slow or briefly rate-limited public RPC), once the transaction
// falls outside the last 22.5 minutes it is NEVER found again even though the
// deposit stays 'pending' until minute 30 - the deposit ends up 'expired' even
// though the buyer DID transfer and the funds are on-chain.
// The fix: measure block time LIVE on every fetch (comparing the latest block's
// timestamp against one 1000 blocks earlier), then derive the number of blocks to
// scan from that (targeting 90 minutes of coverage = 3x the deposit validity,
// much safer than merely 2x) - so it stays correct AUTOMATICALLY even if a future
// BSC hardfork speeds up block time again, with no manual tuning after every
// network upgrade as before. It is clamped to a sane range (min 1500, max 20000
// blocks) so that if the calculation comes out strange (an RPC returning an
// implausible timestamp, say) it still cannot trigger a scan that is either too
// narrow OR too large (wasting rate limit).
const USDT_COVERAGE_TARGET_SECONDS = 90 * 60; // 90 minutes (3x the 30-minute deposit validity)
const BLOCK_TIME_SAMPLE_BLOCKS = 1000;
const MIN_RANGE_BLOCKS = 1500;
const MAX_RANGE_BLOCKS = 20000;

async function estimateRangeBlocks(latest) {
  try {
    const refBlockNum = Math.max(0, latest - BLOCK_TIME_SAMPLE_BLOCKS);
    const [latestBlock, refBlock] = await bscRpcBatchCall([
      { method: 'eth_getBlockByNumber', params: ['0x' + latest.toString(16), false] },
      { method: 'eth_getBlockByNumber', params: ['0x' + refBlockNum.toString(16), false] }
    ]);
    const latestTs = latestBlock ? parseInt(latestBlock.timestamp, 16) : null;
    const refTs = refBlock ? parseInt(refBlock.timestamp, 16) : null;
    const blockDelta = latest - refBlockNum;
    if (latestTs && refTs && latestTs > refTs && blockDelta > 0) {
      const avgBlockTimeSec = (latestTs - refTs) / blockDelta;
      const computed = Math.ceil(USDT_COVERAGE_TARGET_SECONDS / avgBlockTimeSec);
      return Math.min(MAX_RANGE_BLOCKS, Math.max(MIN_RANGE_BLOCKS, computed));
    }
  } catch (err) {
    console.error('Failed to estimate live BSC block time, using the fallback:', err.message);
  }
  // Fallback when the live estimate fails (an RPC error, etc.): assume the FASTEST
  // confirmed block time (0.45s, post-Fermi) so that a guess still OVER-covers
  // rather than under-covers.
  return Math.ceil(USDT_COVERAGE_TARGET_SECONDS / 0.45);
}

// ===== BUG FIX: every pending USDT deposit has its OWN setInterval (see
// pollUsdtDeposit() in bot.js), and BEFORE this fix every tick of any interval
// called fetchIncomingUsdtTransfers() from SCRATCH - which can mean a dozen or
// more eth_getLogs requests (RANGE_BLOCKS can reach thousands of blocks, split
// per MAX_BLOCKS_PER_CALL=900). With 2+ buyers waiting on a USDT payment at the
// same time, ALL those expensive requests went to the free public RPC SEPARATELY
// and REDUNDANTLY (even though the result is IDENTICAL - all asking about
// transfers to the same single wallet) - easily hitting the public RPC's rate
// limit, making the fetch fail silently (only logged, see the catch in
// pollUsdtDeposit), so a payment ALREADY on-chain went UNDETECTED on that tick -
// perhaps detected on a later tick once the rate limit eased, or expiring first
// if the failures continued. This is the most likely cause of the "sometimes
// detected, sometimes not" complaint - NOT a wrong address or code, but redundant
// load on a free RPC.
//
// The fix: cache the fetch result for CACHE_TTL_MS (below the 20-second polling
// interval in bot.js) - so when 2+ deposits tick close together, the SECOND and
// later ones simply use the cached result rather than re-fetching from scratch.
// This also reduces the overall load on the public RPC automatically.
const USDT_TRANSFERS_CACHE_TTL_MS = 15000;
let usdtTransfersCache = { data: null, fetchedAt: 0, inflight: null };

// ===== BUG FIX v8: EVERY public RPC endpoint (including those that did still
// support eth_getLogs - publicnode, ankr, defibit, ninicoin) started hitting
// "limit exceeded" one after another, not just bsc-dataseed. The cause was NOT a
// per-request block range that was too wide (MAX_BLOCKS_PER_CALL=900 is already
// safe), but the NUMBER OF REQUESTS PER POLLING TICK being far too high: at the
// current block time (~0.45s post-Fermi hardfork) and a 90-minute coverage
// target, RANGE_BLOCKS can reach ~12,000 blocks -> SPLIT into ~14 eth_getLogs
// chunks EVERY time fetchIncomingUsdtTransfersUncached() was called from SCRATCH
// - and it was called from scratch on EVERY TICK (every 20 seconds; the
// 15-second cache only helps when 2+ deposits tick at nearly the same moment).
// ~14 chunks, each of which may try up to 5 different RPCs when the earlier ones
// fail = a load far above any provider's free rate limit -> ALL the RPCs hit
// their limit and deposit detection died COMPLETELY (not merely "failing
// sometimes").
//
// The fix: an INCREMENTAL scan. Store the last block scanned successfully in full
// (lastScannedBlock) along with the transfers found so far. The next tick only
// needs to scan the NEW blocks since lastScannedBlock (usually just a few dozen
// blocks in 20 seconds -> a single RPC chunk), then merge them into the existing
// transfer list (rather than replacing it from scratch) - instead of rescanning a
// full 90 minutes every tick. That cuts eth_getLogs requests per tick from ~14
// chunks to ~1 under normal conditions (a >90% reduction), which should remove
// the root cause of these cascading rate limits.
//
// lastScannedBlock is ONLY advanced AFTER every chunk in that tick succeeds - if
// a chunk fails (an exception is thrown before reaching that line), the cursor
// does NOT advance, so the next tick automatically retries from the same point
// (no block range is "skipped" because of a partial failure). When the bot has
// just started (lastScannedBlock is still null) or a failure gap has grown too
// long (the distance to `latest` exceeds MAX_RANGE_BLOCKS), it falls back
// automatically to a full backfill scan (the old behaviour) so no transfer goes
// undetected.
const USDT_SCAN_OVERLAP_BLOCKS = 5; // step back slightly each tick, to survive a shallow reorg
const USDT_TRANSFER_RETENTION_MS = 90 * 60 * 1000; // keep transfers for 90 minutes (matching the old safe window)
let usdtScanState = { lastScannedBlock: null, transfers: [] };

async function fetchIncomingUsdtTransfers() {
  if (!USDT_BEP20_ADDRESS) throw new Error('USDT_BEP20_ADDRESS has not been set in .env');

  const now = Date.now();
  if (usdtTransfersCache.data && (now - usdtTransfersCache.fetchedAt) < USDT_TRANSFERS_CACHE_TTL_MS) {
    return usdtTransfersCache.data;
  }
  // When another fetch is ALREADY running (not finished yet) as another tick
  // arrives at nearly the same moment, wait on that same result (rather than
  // starting a fresh fetch) - preventing two expensive fetches running in PARALLEL
  // in the very same second before either has written to the cache.
  if (usdtTransfersCache.inflight) return usdtTransfersCache.inflight;

  const promise = (async () => {
    const result = await fetchIncomingUsdtTransfersUncached();
    usdtTransfersCache = { data: result, fetchedAt: Date.now(), inflight: null };
    return result;
  })().catch(err => {
    usdtTransfersCache.inflight = null; // failed - do not leave it stuck, so the next tick may fetch again
    throw err;
  });
  usdtTransfersCache.inflight = promise;
  return promise;
}

async function fetchIncomingUsdtTransfersUncached() {
  const latestHex = await bscRpcCall('eth_blockNumber', []);
  const latest = parseInt(latestHex, 16);

  let fromBlock;
  if (usdtScanState.lastScannedBlock === null) {
    // No successful scan has ever happened (fresh start / just restarted) ->
    // full backfill as before, so transfers that arrived before the bot came up
    // are not missed.
    const RANGE_BLOCKS = await estimateRangeBlocks(latest);
    fromBlock = Math.max(0, latest - RANGE_BLOCKS);
  } else {
    fromBlock = Math.max(0, usdtScanState.lastScannedBlock - USDT_SCAN_OVERLAP_BLOCKS);
    // The gap to `latest` is too large (prolonged failures / the bot froze for a
    // while) -> incremental is no longer enough, so fall back to a full scan to
    // avoid leaving a range undetected.
    if (latest - fromBlock > MAX_RANGE_BLOCKS) {
      const RANGE_BLOCKS = await estimateRangeBlocks(latest);
      fromBlock = Math.max(0, latest - RANGE_BLOCKS);
    }
  }
  if (fromBlock > latest) fromBlock = latest;

  // Split [fromBlock, latest] into chunks of <= MAX_BLOCKS_PER_CALL to avoid a
  // "limit exceeded" from the public RPC. Under normal (incremental) conditions
  // this is usually a single chunk, because fromBlock..latest spans only a few
  // dozen blocks (~1 polling tick).
  let newLogs = [];
  for (let chunkStart = fromBlock; chunkStart <= latest; chunkStart += MAX_BLOCKS_PER_CALL) {
    const chunkEnd = Math.min(chunkStart + MAX_BLOCKS_PER_CALL - 1, latest);
    const chunkLogs = await fetchLogsChunk(chunkStart, chunkEnd);
    if (Array.isArray(chunkLogs)) newLogs = newLogs.concat(chunkLogs);
  }

  // Only advance the cursor AFTER every chunk above has succeeded (if one failed,
  // an exception was already thrown from fetchLogsChunk/bscRpcCall before this
  // line was reached - leaving the cursor at its old position).
  usdtScanState.lastScannedBlock = latest;

  if (newLogs.length > 0) {
    // Fetch the timestamp of each relevant NEW block (for the time tolerance in
    // bot.js) via a single batch request, rather than one request per log.
    const uniqueBlocks = [...new Set(newLogs.map(l => l.blockNumber))];
    const blockResults = await bscRpcBatchCall(uniqueBlocks.map(bn => ({ method: 'eth_getBlockByNumber', params: [bn, false] })));
    const timestampByBlock = {};
    uniqueBlocks.forEach((bn, i) => {
      timestampByBlock[bn] = blockResults[i] ? parseInt(blockResults[i].timestamp, 16) * 1000 : 0;
    });

    const newTransfers = newLogs.map(log => ({
      hash: log.transactionHash,
      // logIndex is used as part of a unique dedupe key (not for display) - one tx
      // can contain more than one Transfer event to the same wallet.
      _dedupeKey: `${log.transactionHash}-${log.logIndex}`,
      from: '0x' + log.topics[1].slice(-40),
      amount: hexWeiToDecimal(log.data, 18), // USDT on BSC uses 18 decimals (unlike Ethereum's 6)
      timestamp: timestampByBlock[log.blockNumber] || 0,
      blockNumber: parseInt(log.blockNumber, 16)
    }));

    usdtScanState.transfers = usdtScanState.transfers.concat(newTransfers);
  }

  // Drop transfers past their retention window so the list does not grow in memory
  // forever, and dedupe (the USDT_SCAN_OVERLAP_BLOCKS overlap between ticks can
  // make the same log be read twice).
  const now = Date.now();
  const seen = new Set();
  usdtScanState.transfers = usdtScanState.transfers.filter(t => {
    if (t.timestamp && (now - t.timestamp) > USDT_TRANSFER_RETENTION_MS) return false;
    if (seen.has(t._dedupeKey)) return false;
    seen.add(t._dedupeKey);
    return true;
  });

  return usdtScanState.transfers;
}

// Build a unique USDT amount (adding 0.0001 - 0.0999) so every pending deposit has
// a distinct amount - necessary because a USDT transfer on the blockchain has no
// memo/note field to match it back to a particular user.
function generateUniqueUsdtAmount(baseAmount, usedAmounts) {
  let amount;
  let tries = 0;
  do {
    const variant = (Math.floor(Math.random() * 999) + 1) / 10000; // 0.0001 - 0.0999
    amount = Number((baseAmount + variant).toFixed(4));
    tries++;
  } while (usedAmounts.has(amount) && tries < 50);
  return amount;
}

// ===================== TON / Toncoin (on-chain, via TonCenter) =====================
// TonCenter's getTransactions returns the transaction history of one wallet
// address, including INCOMING transfers via the in_msg field (a populated source
// means an incoming transfer from another address, with value in nanoton /
// 1e9 = 1 TON). Like BscScan, it needs no phone or app running - purely API polling.
async function fetchIncomingTonTransfers() {
  if (!TON_ADDRESS) throw new Error('TON_ADDRESS has not been set in .env');

  const url = `${TONCENTER_API_BASE}/getTransactions?address=${encodeURIComponent(TON_ADDRESS)}&limit=50&archival=true`;
  const res = await fetchWithTimeout(url, {
    headers: TONCENTER_API_KEY ? { 'X-API-Key': TONCENTER_API_KEY } : {}
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error('TonCenter: response was not JSON');
  if (json.ok === false) throw new Error('TonCenter error: ' + JSON.stringify(json));

  const list = Array.isArray(json.result) ? json.result : [];
  return list
    .filter(tx => tx.in_msg && tx.in_msg.source && Number(tx.in_msg.value) > 0)
    .map(tx => ({
      hash: tx.transaction_id ? tx.transaction_id.hash : (tx.hash || ''),
      from: tx.in_msg.source,
      amount: Number(tx.in_msg.value) / 1e9,
      timestamp: Number(tx.utime) * 1000
    }));
}

// Build a unique TON amount (adding 0.0001 - 0.0099) so every pending deposit has
// a distinct amount - for the same reason as USDT above (a TON transfer also need
// not carry a memo/comment that could reliably be matched to a particular user).
// The variation is deliberately smaller than for USDT because TON is worth more
// per coin - a 0.0001-0.0099 TON variation is still enough for uniqueness without
// being a noticeable amount of value.
function generateUniqueTonAmount(baseAmount, usedAmounts) {
  let amount;
  let tries = 0;
  do {
    const variant = (Math.floor(Math.random() * 99) + 1) / 10000; // 0.0001 - 0.0099
    amount = Number((baseAmount + variant).toFixed(6));
    tries++;
  } while (usedAmounts.has(amount) && tries < 50);
  return amount;
}

// ===================== Binance Pay (C2C, via Get Pay Trade History) =====================
// Official documentation: https://developers.binance.com/docs/pay/rest-api
// (the GET /sapi/v1/pay/transactions endpoint) - this is a REGULAR API endpoint
// (not the Merchant/business one), so a plain API key from a personal Binance
// account is enough (binance.com -> Profile -> API Management) with only the
// "Enable Reading" permission (trading/withdrawal permissions are NOT needed and
// must NOT be enabled, for safety - this feature purely reads history).
//
// Payment matching works EXACTLY like USDT BEP20/TON above: because a Binance Pay
// C2C transfer need not carry a reliable memo/note to match it to a particular
// user, bot.js generates a UNIQUE AMOUNT (the base amount plus a small variation)
// every time a user wants to top up, then polls this endpoint every few seconds
// looking for an incoming transaction (amount > 0, orderType 'C2C') whose amount
// matches exactly, within the time window after the deposit was created.
function binanceSignQuery(queryString) {
  return crypto.createHmac('sha256', BINANCE_API_SECRET).update(queryString).digest('hex');
}

// ---- Automatic server clock correction (fixing error -1021 "Timestamp for this
// request is outside of the recvWindow") ----
// The root cause of that error is ALWAYS the VPS clock drifting from Binance's
// server clock (not a logic bug). Rather than relying entirely on the VPS system
// clock being accurate, we measure the OFFSET between the local clock and
// Binance's server clock once up front (refreshed every 30 minutes, or immediately
// on hitting -1021), then add that offset to Date.now() whenever building a signed
// request - so it stays safe even if the VPS clock is off by a few seconds.
let binanceTimeOffsetMs = 0;
let binanceTimeOffsetFetchedAt = 0;
const BINANCE_TIME_OFFSET_TTL_MS = 30 * 60 * 1000; // refresh every 30 minutes

async function refreshBinanceTimeOffset() {
  try {
    const localBefore = Date.now();
    const res = await fetchWithTimeout(`${BINANCE_API_BASE}/api/v3/time`);
    const json = await res.json().catch(() => null);
    const localAfter = Date.now();
    if (json && json.serverTime) {
      const localMid = Math.round((localBefore + localAfter) / 2);
      binanceTimeOffsetMs = json.serverTime - localMid;
      binanceTimeOffsetFetchedAt = Date.now();
    }
  } catch (err) {
    // Failed to fetch the server time (a network blip, say) - keep using the old
    // offset rather than letting it take down the other payment features.
  }
}

function binanceNow() {
  return Date.now() + binanceTimeOffsetMs;
}

async function binanceSignedGet(path, params = {}) {
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) throw new Error('BINANCE_API_KEY/BINANCE_API_SECRET has not been set in .env');
  if (Date.now() - binanceTimeOffsetFetchedAt > BINANCE_TIME_OFFSET_TTL_MS) {
    await refreshBinanceTimeOffset();
  }

  const doRequest = async () => {
    const query = new URLSearchParams({ timestamp: String(binanceNow()), recvWindow: '20000', ...params });
    const signature = binanceSignQuery(query.toString());
    query.append('signature', signature);
    const res = await fetchWithTimeout(`${BINANCE_API_BASE}${path}?${query.toString()}`, {
      headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }
    });
    const json = await res.json().catch(() => null);
    if (!json) throw new Error('Binance API: response was not JSON');
    // An ordinary Binance error response looks like { code: -1234 (a negative
    // number), msg: '...' } - unlike a successful Pay endpoint response, whose code
    // is the string '000000'. So an error is detected by checking for a negative
    // numeric code, NOT merely "code is truthy" (so '000000' is not read as an error).
    if (json.code !== undefined && json.code !== '000000' && Number(json.code) < 0) {
      throw new Error(`Binance API error ${json.code}: ${json.msg || JSON.stringify(json)}`);
    }
    return json;
  };

  try {
    return await doRequest();
  } catch (err) {
    // Hit -1021 (timestamp outside recvWindow)? Refresh the offset and retry ONCE
    // before treating it as a real failure - this is what stops Binance Pay
    // auto-detection stalling because of VPS clock drift.
    if (String(err.message).includes('-1021')) {
      await refreshBinanceTimeOffset();
      return await doRequest();
    }
    throw err;
  }
}

// Fetch INCOMING Pay transactions from roughly the last 2 hours (comfortably wider
// than a single deposit's 30-minute validity - the same reasoning as RANGE_BLOCKS
// in fetchIncomingUsdtTransfers()). startTime/endTime are sent explicitly even
// though they are below this endpoint's default 90-day limit, so the result stays
// consistent and does not suddenly widen should Binance change that default.
async function fetchIncomingBinancePayTransactions() {
  const endTime = Date.now();
  const startTime = endTime - (2 * 60 * 60 * 1000); // the last 2 hours
  const json = await binanceSignedGet('/sapi/v1/pay/transactions', { startTime, endTime, limit: 100 });
  const list = Array.isArray(json.data) ? json.data : [];
  return list
    // orderType 'C2C' = a personal transfer to a Binance ID (what this flow uses).
    // 'PAY' (C2B Merchant) is deliberately excluded because this bot does NOT use
    // the Merchant API - to support Binance Pay Merchant later, add 'PAY' here
    // AFTER wiring up its order-create integration.
    .filter(tx => tx.orderType === 'C2C' && Number(tx.amount) > 0)
    .map(tx => ({
      id: String(tx.transactionId || ''),
      amount: Number(tx.amount),
      currency: tx.currency || '',
      timestamp: Number(tx.transactionTime) || 0
    }));
}

// Build a unique amount in the USDT/TON style (a small variation in the decimals)
// so every pending Binance Pay deposit has a distinct amount - necessary because a
// Binance Pay C2C transfer need not carry a reliable memo/note to match it back to
// a particular user.
function generateUniqueBinanceAmount(baseAmount, usedAmounts) {
  let amount;
  let tries = 0;
  do {
    const variant = (Math.floor(Math.random() * 999) + 1) / 10000; // 0.0001 - 0.0999
    amount = Number((baseAmount + variant).toFixed(4));
    tries++;
  } while (usedAmounts.has(amount) && tries < 50);
  return amount;
}

// The asset buyers MUST use when sending via Binance Pay - this store pegs the
// Wallet balance 1:1 to USD/USDT (just like USDT BEP20 above), so payment MUST be
// in USDT and no other asset.
const BINANCE_EXPECTED_CURRENCY = 'USDT';

// A dedicated diagnostic (NOT for auto-crediting): fetch INCOMING Pay transactions
// in a given time range WITHOUT the strict currency/orderType filters of
// fetchIncomingBinancePayTransactions() above. Used when a deposit expires without
// finding a match, so the admin can see straight from the Telegram notification
// which transactions actually arrived in that window (if any) - the most likely
// causes of "not found" being a currency that is not exactly USDT, an orderType
// that is not 'C2C' (the buyer paying via the "Pay"/QR feature rather than "Send"
// to a Binance ID), or an amount differing slightly in the last decimal. Without
// this the admin would have to open the Binance app manually to find out why.
async function fetchRawBinancePayTransactionsInRange(startTime, endTime) {
  const json = await binanceSignedGet('/sapi/v1/pay/transactions', { startTime, endTime, limit: 100 });
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map(tx => ({
    id: String(tx.transactionId || ''),
    amount: Number(tx.amount),
    currency: tx.currency || '',
    orderType: tx.orderType || '',
    timestamp: Number(tx.transactionTime) || 0
  }));
}

module.exports = {
  PAYKITA_API_KEY,
  USDT_BEP20_ADDRESS,
  USDT_BEP20_CONTRACT,
  TON_ADDRESS,
  TONCENTER_API_KEY,
  BINANCE_API_KEY,
  BINANCE_API_SECRET,
  BINANCE_PAY_ID,
  getUsdToIdrRate,
  getCachedUsdToIdrRate,
  paykitaCreateOrder,
  paykitaGetOrderStatus,
  fetchIncomingUsdtTransfers,
  generateUniqueUsdtAmount,
  getTonToUsdRate,
  fetchIncomingTonTransfers,
  generateUniqueTonAmount,
  fetchIncomingBinancePayTransactions,
  fetchRawBinancePayTransactionsInRange,
  generateUniqueBinanceAmount,
  BINANCE_EXPECTED_CURRENCY
};
