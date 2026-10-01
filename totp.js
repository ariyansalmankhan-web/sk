// ============================================================
// TOTP (Time-based One-Time Password) generator - RFC 6238
// ============================================================
// A local implementation with NO external library and NO third-party
// service (such as https://2fa.cn/). Sites like that compute a standard
// TOTP entirely in the visitor's browser anyway - there is no server API
// involved at all (see their own FAQ: "All code generation is done
// entirely on the client side"). So the only correct and stable way to
// "integrate" is to compute the code here ourselves - the result is
// ALWAYS identical to what 2fa.cn shows for the same secret, without
// depending on an outside site that could change, lag, or go down.
//
// Supported secrets: standard Base32 (RFC 4648) - letters A-Z and digits
// 2-7, with spaces and lowercase allowed (they are stripped and
// uppercased automatically) - exactly the format used by Google
// Authenticator, Authy, and 2fa.cn. For example
// "kqzj jo6v m3ob nywd ag7m b4uo foa4 mzby" or
// "KQZJJO6VM3OBNYWDAG7MB4UOFOA4MZBY" (no spaces) both produce the same
// code.

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = String(input).replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  if (!clean.length) return null;
  let bits = '';
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) return null; // character outside the base32 alphabet -> not a valid secret
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return bytes.length ? Buffer.from(bytes) : null;
}

// Quick check for whether a string "looks like" a base32 TOTP secret
// (rather than an old-style static 6-digit OTP code). At least 16 valid
// base32 characters are required so short legacy digit codes are not
// mistaken for a secret (base32 has no digits 0/1/8/9, so a legacy digit
// code almost always fails this check on its own too).
function looksLikeTotpSecret(input) {
  const clean = String(input).replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  if (clean.length < 16) return false;
  return /^[A-Z2-7]+$/.test(clean);
}

function hotp(secretBuffer, counter, digits) {
  const counterBuffer = Buffer.alloc(8);
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  const otp = binCode % Math.pow(10, digits);
  return String(otp).padStart(digits, '0');
}

// Generate a TOTP code (6 digits and a 30-second time step by default -
// the same defaults as Google Authenticator, Authy, and 2fa.cn). Returns
// null when the secret is not valid base32.
function generateTOTP(secretRaw, { digits = 6, period = 30, timestamp = null } = {}) {
  const secretBuffer = base32Decode(secretRaw);
  if (!secretBuffer) return null;
  const nowSec = timestamp != null ? timestamp : Math.floor(Date.now() / 1000);
  const counter = Math.floor(nowSec / period);
  return hotp(secretBuffer, counter, digits);
}

// Seconds left before the current code expires and rolls over to the next one.
function secondsRemaining(period = 30, timestamp = null) {
  const nowSec = timestamp != null ? timestamp : Math.floor(Date.now() / 1000);
  const rem = period - (nowSec % period);
  return rem === period ? period : rem;
}

module.exports = { base32Decode, looksLikeTotpSecret, generateTOTP, secondsRemaining };
