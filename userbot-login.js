// ===== userbot-login.js =====
// Run this ONCE manually (not through bot.js) to log in the Telegram
// account you want to use as the gift-sending userbot:
//
//   node userbot-login.js
//
// You will be asked for: phone number, the OTP code from Telegram, and the
// 2FA password (if the account has one). At the end the script prints a
// SESSION_STRING - copy that value into .env as USERBOT_SESSION. Once it is
// saved, userbot.js uses this session every time the bot starts, with no
// need to log in again.
//
// Get USERBOT_API_ID and USERBOT_API_HASH from https://my.telegram.org
// -> API Development Tools -> create a new application (any name works).
//
// ⚠️ Prefer a SEPARATE TELEGRAM ACCOUNT (not your main personal account)
// for this userbot, so that if Telegram rate-limits or flags it for
// automated activity, your personal account is unaffected.

require('dotenv').config();
const input = require('input'); // already installed as a dependency of 'telegram'
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const API_ID = Number(process.env.USERBOT_API_ID || 0);
const API_HASH = process.env.USERBOT_API_HASH || '';

(async () => {
  if (!API_ID || !API_HASH) {
    console.error('❌ Set USERBOT_API_ID and USERBOT_API_HASH in .env first (from https://my.telegram.org).');
    process.exit(1);
  }

  console.log('🔐 Logging in the GramJS userbot...\n');
  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => await input.text('Phone number (international format, e.g. +1...): '),
    password: async () => await input.text('2FA password (leave empty if none, then press Enter): '),
    phoneCode: async () => await input.text('OTP code from Telegram: '),
    onError: (err) => console.error(err)
  });

  console.log('\n✅ Login successful!\n');
  console.log('Paste the following line into your .env file:\n');
  console.log(`USERBOT_SESSION=${client.session.save()}\n`);

  await client.disconnect();
  process.exit(0);
})();
