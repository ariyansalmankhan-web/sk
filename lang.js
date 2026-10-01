// ============================================================
// TEXT MODULE (i18n) — English
// ============================================================
// Every user-facing text and button label lives here, so bot.js can simply
// call t(chatId, 'key', {vars}) instead of hardcoding strings all over the
// place.
//
// Usage in bot.js:
//   const { t } = require('./lang');
//   t(chatId, 'welcome', { store: STORE_NAME })
//
// The chatId argument is kept in the signature so a future multi-language
// build can resolve a per-user language here without touching any caller.
// ============================================================

const DICT = {
  welcome: '⚡ <b>{store}</b> — premium accounts, prices you will love.\n\n<blockquote>{cart_icon} Netflix, Spotify, Gemini, CapCut, and hundreds more.\n{bolt_icon} Pay, get it instantly — <b>auto</b>, no admin needed.\n{wallet_icon} Automatic Wallet topup via QRIS, USDT, or TON.\n{gift_icon} Invite friends and earn via <b>Refer & Earn</b>.</blockquote>\n\n{arrow_icon} Ready to shop? Pick a menu below!',
  referral_success: '🎉 Referral successful! Your friend who joined through your link just topped up their balance for the first time.\n💰 You received an extra <b>{amount}</b> balance.\n💼 Current balance: <b>{balance}</b>',

  btn_buy_product: '🛒 Buy Product',
  btn_profile: '👤 Profile',
  btn_balance: '💰 My Balance',
  btn_wallet: '💳 Wallet',
  btn_orders: '🧾 My Orders',
  btn_howto: '❗️ How to Use',
  btn_support: '📞 Support',
  btn_referral: '🎁 Refer & Earn',
  btn_back: '‹ Back',
  btn_go_back: '⬅️ Go Back',

  profile_title: '👤 Profile',
  profile_name: 'Name',
  profile_username: 'Username',
  profile_username_empty: '<i>no Telegram username yet</i>',
  profile_chatid: 'Chat ID',
  profile_balance: 'Wallet Balance',
  profile_orders: 'Total Orders',
  profile_referral: 'Total Referrals',

  balance_line: '{icon} Your current balance: <b>{balance}</b>',

  topup_title: '{emoji_wallet} <b>Wallet - Add Balance</b>\n\nChoose a payment method. All methods are <b>automatic</b> - your balance is credited instantly once payment is detected, no admin approval needed.',
  btn_topup_qris: '📱 QRIS (Automatic)',
  btn_topup_usdt: '💵 USDT - BEP20 (Automatic)',
  btn_topup_ton: '💎 TON / Gram (Automatic)',

  orders_empty: "{emoji_orders} You don't have any purchase history yet.",
  orders_title: '<b>Your Recent Orders:</b>',
  order_id_label: 'Order ID',
  order_product_label: 'Product',
  order_status_label: 'Status',
  btn_recover: '🏅 Recover Product',
  btn_cancel: '❌ Cancel',
  recover_title: '🏅 <b>Recover Product</b>\n\nType the Order ID you want to recover (see the My Orders list above), and the bot will resend the link/code that was previously delivered.',
  recover_result_title: 'Recover Product',

  howto_title: '{emoji_howto} <b>How it works</b>\n\nSelect a product below to see the step-by-step usage guide:',
  btn_close_menu: '❌ Close menu',

  support_title: '{emoji_support} <b>Support Center</b>\n\nIf you need help, tap the button below to contact our support team.',
  support_title_noadmin: "{emoji_support} <b>Support Center</b>\n\n⚠️ The admin hasn't set up the admin configuration yet, so the contact support button isn't available.",
  btn_contact_support: '📞 Contact Support',

  referral_title: '<b>Refer &amp; Earn Program</b>',
  referral_disabled: "⚠️ This feature isn't active yet because the bot username hasn't been set. Ask the admin to set the bot username first so a referral link can be generated.",
  referral_body: 'Invite your friends to shop at <b>{store}</b> and get balance credited straight to your Wallet!\n\n{reward_emoji} <b>Reward per Referral:</b> {reward}\n\n{link_emoji} <b>Your Referral Link:</b>\n<code>{link}</code>\n\n<blockquote>{how_emoji} <b>How It Works:</b>\n1. Share your referral link\n2. Your friend opens the bot through that link\n3. Once your friend tops up their balance for the first time, your balance increases automatically!</blockquote>\n\n{total_emoji} <b>Total Referrals:</b> {count}\n{earnings_emoji} <b>Total Referral Earnings:</b> {earnings}',
  btn_share_referral: '📤 Share Referral Link',
  btn_copy_referral: '📋 Copy Referral Link',

  // ---- Gift (Buy Gift / Confess Gift, via userbot GramJS - see userbot.js) ----
  btn_gift_menu: '🎁 Buy Gift / Confess Gift',
  gift_not_configured: "⚠️ The Gift feature hasn't been configured by the admin yet (USERBOT_SESSION is empty).",
  gift_mode_title: "🎁 <b>Buy Gift / Confess Gift</b>\n\nFirst, choose how you want to send the gift:\n\n🎁 <b>Buy Gift</b> - the gift is sent on behalf of the store account, with NO message.\n💌 <b>Confess Gift</b> - gift + an anonymous message you write yourself, your identity is <b>hidden</b> from the recipient.",
  btn_gift_buy: '🎁 Buy Gift',
  btn_gift_confess: '💌 Confess Gift',
  gift_list_title_buy: '🎁 <b>Buy Gift</b>\n\nPick a gift below to send to any Telegram user (just their username or ID).',
  gift_list_title_confess: "💌 <b>Confess Gift</b>\n\nPick a gift below, then send it to anyone along with an anonymous message. Your identity is <b>hidden</b> from the recipient.",
  gift_not_found: '⚠️ Gift not found / already out of stock, please try again.',
  gift_detail_price_line: '💰 Price: {price}',
  gift_ask_target: "Send the recipient's Telegram username or ID (without @):",
  gift_invalid_target: '⚠️ Invalid username/ID, please resend it (example: <code>username</code> or <code>123456789</code>).',
  gift_ask_message: '💌 Type the anonymous message to send along with the gift (max 250 characters):',
  gift_confirm_title: '🧾 <b>{mode} Confirmation</b>',
  gift_confirm_gift_line: '🎁 Gift: {stars}⭐',
  gift_confirm_target_line: '🎯 Recipient: <code>{target}</code>',
  gift_confirm_message_line: '💌 Message: "{message}"',
  gift_confirm_hidden_notice: 'Your identity <b>will not be visible</b> to the recipient.',
  btn_gift_send_now: '✅ Send Now',

  products_title: '📦 <b>Available Products</b>\nPlease select a product to proceed:',
  variant_choose: 'Choose a variant:',
  product_not_found: 'Product not found.',
  btn_how_to_use: '❗️ How to Use',
  btn_buy_now: '✅ Buy Now',

  howto_not_available: "There's no usage guide for this product yet. Contact admin if you run into issues.",
  howto_page_title: '❗️ <b>How to Use - {product}</b>',

  qty_custom: '✏️ Custom Amount',
  order_confirm_title: '{title_icon} <b>Order Confirmation</b>',
  btn_place_order: '💰 Place Order',
  btn_cancel_order: '❌ Cancel Order',

  btn_cancel_arrow: '⬅️ Cancel',
  topup_qris_not_configured: '⚠️ QRIS payment has not been configured by the admin (`PAYKITA_API_KEY` is empty in `.env`).',
  topup_usdt_not_configured: '⚠️ USDT (BEP20) payment has not been configured by the admin (`USDT_BEP20_ADDRESS` is empty in `.env`).',
  topup_ton_not_configured: '⚠️ TON payment has not been configured by the admin (`TON_ADDRESS` is empty in `.env`).',
  topup_binance_not_configured: '⚠️ Binance Pay payment has not been configured by the admin (`BINANCE_API_KEY`/`BINANCE_PAY_ID` is empty in `.env`).',

  qris_choose_amount_title: '{emoji_qris_amount} <b>CHOOSE DEPOSIT AMOUNT</b>\n\nPlease pick an instant deposit amount below, or use a Custom Amount:',
  btn_custom_amount: '✏️ Custom Amount',
  qris_custom_prompt: '✏️ *Custom Amount*\n\nType the topup amount in USD (numbers only, decimals allowed, minimum {min}), example: `5` or `5.25`.',
  qris_creating: '{emoji_hourglass} Creating QRIS for <b>{amount}</b>...',
  toast_creating_qris: '⏳ Creating QRIS...',
  toast_creating_usdt_invoice: '⏳ Creating USDT invoice...',
  toast_creating_ton_invoice: '⏳ Creating TON invoice...',
  toast_creating_binance_invoice: '⏳ Creating Binance Pay invoice...',
  qris_invalid_amount: 'Invalid amount.',
  qris_too_small: '⚠️ Amount too small for QRIS (minimum {min}). Type a larger USD amount.',
  qris_create_failed: '⚠️ Failed to create the QRIS payment right now. Try again in a moment, or contact admin.',
  qris_invoice_caption: '{title_icon} <b>YOUR QRIS INVOICE IS READY!</b>\n━━━━━━━━━━━━━━━━━━\n\nJust one more step to a full balance! {rocket_icon}\n\n{orderid_icon} Order ID: <code>{orderId}</code>\n{saldo_icon} Balance you\'ll get: <b>{amount}</b>\n{total_icon} Total to pay via QRIS: <b>{total}</b>\n{expire_icon} Valid for: <b>10 minutes</b>\n\n{carabayar_icon} <b>How to pay:</b>\n{step1_icon} Open your favorite e-wallet / mobile banking app\n{step2_icon} Choose <b>Scan QR</b> / <b>QRIS</b>\n{step3_icon} Scan the QR above and pay the <b>exact</b> amount ({total}) — don\'t round it\n\n{auto_icon} Your Wallet balance is credited <b>AUTOMATICALLY</b> the instant payment is detected — no admin confirmation, no waiting!\n\n{tip_icon} Changed your mind? Just tap <b>Cancel Payment</b> below.',
  qris_qr_send_failed: '\n\n⚠️ Failed to display the QR image, contact admin with the Order ID above.',
  qris_expired: '⌛ QRIS topup `{id}` has expired (no payment received within 10 minutes). Please redo the topup if you still want to continue.',
  qris_paid: '✅ QRIS payment received!\nWallet balance increased by *{amount}*.\n💼 Current balance: *{balance}*',
  btn_qris_cancel: '❌ Cancel Payment',
  toast_payment_cancelled: 'Payment cancelled.',
  toast_topup_cancelled: 'Topup cancelled.',

  usdt_topup_prompt: '{emoji_usdt} <b>Topup via USDT (BEP20)</b>\n\nType the topup amount in USD (numbers only, decimals allowed, minimum {min}, maximum {max}), it will be processed as USDT 1:1. Example: <code>50</code> or <code>50.25</code>',
  usdt_invoice_text: '{title_icon} <b>Deposit via USDT (BEP20)</b>\n\n{min_icon} <b>Min Deposit:</b> {min}\n{max_icon} <b>Max Deposit:</b> {max}\n\nOrder ID: <code>{orderId}</code>\n\nSend <b>EXACTLY</b> this amount (don\'t round it):\n<code>{uniqueAmount}</code> USDT\n\n{address_icon} <b>Address</b> (<b>BEP20 / BNB Smart Chain</b> network ONLY):\n<code>{address}</code>\n\n⚠️ <b>Important:</b>\n• The amount must match EXACTLY down to 4 decimals so the system can auto-match it to your deposit.\n• You MUST use the BEP20 (BSC) network. Sending from another network risks losing funds.\n\n{auto_icon} <b>Automatic Deposit:</b> Your Wallet balance is credited automatically within 1-2 minutes after the transaction is confirmed on-chain. No need to send the Tx Hash manually.\n\n⏳ Valid for 30 minutes.',
  btn_copy_address: '📋 Copy Address',
  btn_usdt_cancel: '❌ Cancel Topup',
  usdt_expired: '⌛ USDT topup `{id}` has expired. Please redo the topup if you still want to continue.',
  usdt_paid: '✅ USDT payment received!\nTx Hash: `{hash}`\nWallet balance increased by *{amount}*.\n💼 Current balance: *{balance}*',

  ton_topup_prompt: '{emoji_ton} <b>Topup via TON (The Open Network)</b>\n\nType the topup amount in USD (numbers only, decimals allowed, minimum {min}, maximum {max}), it will be auto-converted to TON using the live rate. Example: <code>5</code> or <code>5.25</code>',
  ton_invoice_text: '{title_icon} <b>Deposit via TON (The Open Network)</b>\n\n{min_icon} <b>Min Deposit:</b> {min}\n{max_icon} <b>Max Deposit:</b> {max}\n\nOrder ID: <code>{orderId}</code>\n\nSend <b>EXACTLY</b> this amount (don\'t round it):\n<code>{uniqueAmount}</code> TON\n\n{address_icon} <b>Address</b> (native <b>TON</b> network ONLY):\n<code>{address}</code>\n\n⚠️ <b>Important:</b>\n• The amount must match EXACTLY down to 4 decimals so the system can auto-match it to your deposit.\n• Send directly from a TON wallet (Tonkeeper, Tonhub, etc), NOT from an exchange that trims/rounds the sent amount.\n\n{auto_icon} <b>Automatic Deposit:</b> Your Wallet balance is credited automatically within 1-2 minutes after the transaction is confirmed on-chain. No need to send the Tx Hash manually.\n\n⏳ Valid for 30 minutes.',
  btn_ton_cancel: '❌ Cancel Topup',
  ton_expired: '⌛ TON topup `{id}` has expired. Please redo the topup if you still want to continue.',
  ton_paid: '✅ TON payment received!\nWallet balance increased by *{amount}*.\n💼 Current balance: *{balance}*',

  btn_topup_binance: 'Binance Pay (Automatic)',
  binance_topup_prompt: '{emoji_binance} <b>Topup via Binance Pay</b>\n\nType the topup amount in USD (numbers only, decimals allowed, minimum {min}, maximum {max}), it will be processed 1:1. Example: <code>10</code> or <code>10.5</code>',
  binance_invoice_text: '{title_icon} <b>Deposit via Binance Pay</b>\n\n{min_icon} <b>Min Deposit:</b> {min}\n{max_icon} <b>Max Deposit:</b> {max}\n\nOrder ID: <code>{orderId}</code>\n\nSend <b>EXACTLY</b> this amount in <b>USDT</b> via the <b>Pay</b> menu in the Binance app (don\'t round it, and don\'t use another asset):\n<code>{uniqueAmount}</code>\n\n{payid_icon} <b>Binance ID</b> (tap to copy):\n<code>{payId}</code>\n\n⚠️ <b>Important:</b>\n• The amount must match EXACTLY down to 4 decimals, and the asset MUST be USDT - sending another asset (BNB, BUSD, etc.) will NOT be detected automatically even if the number matches exactly.\n• Send via <b>Pay -&gt; Send</b> to the Binance ID above, NOT a regular P2P/transfer.\n\n{auto_icon} <b>Automatic Deposit:</b> Your Wallet balance is credited automatically within 1-2 minutes after the transaction is detected in the Binance Pay history. No need to send a proof/Order ID to admin manually.\n\n⏳ Valid for 30 minutes.',
  btn_copy_binance_id: '📋 Copy Binance ID',
  btn_binance_cancel: '❌ Cancel Topup',
  binance_expired: '⌛ Binance Pay topup `{id}` has expired. Please redo the topup if you still want to continue.',
  binance_paid: '✅ Binance Pay payment received!\nRef: `{id}`\nWallet balance increased by *{amount}*.\n💼 Current balance: *{balance}*',

  pending_min_amount: '⚠️ Minimum amount is {min}. Retype the USD amount (numbers only, decimals allowed).',
  pending_min_amount_generic: '⚠️ Minimum amount is {min}. Retype the amount (numbers only, decimals allowed).',
  pending_max_amount: '⚠️ Maximum amount is {max}. Retype the amount (numbers only, decimals allowed).',

  order_not_found: 'Order not found.',
  variant_not_found: 'Variant not found.',
  product_variant_not_found: 'Product/variant not found.',
  recover_item_not_recoverable: "This order's item can't be recovered.",
  totp_refreshed: '🔄 2FA code refreshed.',
  btn_refresh_2fa: '🔄 Refresh 2FA Code',
  out_of_stock: '❌ Out of stock, please pick another product.',
  ask_custom_qty: '✏️ Type the quantity you want to buy (numbers only):',
  invalid_qty: '⚠️ Invalid quantity.',
  invalid_qty_number: '⚠️ Enter a valid quantity (numbers only).',
  not_enough_stock: 'Not enough stock. Remaining stock: {stock}',
  supplier_order_failed: "⚠️ Stock is temporarily unavailable from the supplier, please try again shortly. Your balance hasn't been charged.",
  supplier_balance_empty: "⚠️ Supplier balance is currently empty, our team is topping it up. Please try again shortly. Your balance hasn't been charged.",
  insufficient_balance: 'Your balance is not enough. Please topup first.',
  insufficient_balance_shortfall_label: 'Short by',
  insufficient_balance_cta: 'Top up instantly via one of the methods below:',
  generic_error: 'An error occurred.',
  recover_order_not_found: "⚠️ Order ID `{orderId}` wasn't found on your account. Double-check the ID via the My Orders menu.",
  recover_no_items: "⚠️ Order `{orderId}` doesn't have any recoverable items yet (not auto-delivered). Contact admin for help.",
  referral_username_missing: '⚠️ BOT_USERNAME has not been set by the admin in .env.',

  enter_qty_title: '<blockquote>{emoji_warning} <b>Enter Quantity</b>\nHow many pcs of {product} do you want to buy?</blockquote>\n\n{tiers}\n\n{emoji_stock} Available stock: <b>{stock}</b>',
  price_per_pcs: 'Price: <b>{price}</b> / pcs',
  bulk_discount_title: '{emoji_title} <b>Bulk Discount</b>',
  bulk_discount_line: '{emoji_check} Buy {range} → <b>{price}</b> / pcs',
  desc_fallback: 'Price from {price} / pcs.\nAvailable stock: {stock}',
  live_totp_note: '<i>(live, valid for ~{seconds}s more)</i>',
  account_label: 'Account',

  order_confirm_body: 'Product: {product}\nQuantity: {qty}\nTotal Bill: <b>{total}</b>\n\n{balance_icon} Wallet Balance: <b>{balance}</b>\n{stock_icon} Available Stock: <b>{stock}</b>',

  success_title: '🎉 <b>ORDER SUCCESSFUL!</b> 🎉',
  success_product_label: '<b>Product:</b>',
  success_qty_label: '<b>Quantity:</b>',
  success_qty_unit: '{qty} pcs',
  success_total_label: '<b>Total Paid:</b>',
  success_orderid_label: '<b>Order ID:</b>',
  success_delivered_title: '🚀 <b>Your product has been auto-delivered, check it out below!</b>',
  success_delivered_detail: '🔗 <b>Product / Redeem Details:</b>',
  success_manual: "📦 Admin will process this shortly and send the account/details to this chat manually.",
  success_thanks: '🙏 <b>Thanks for shopping at {store}!</b> See you on your next order',

  forcejoin_title: '{lock_icon} <b>ONE LAST STEP!</b> {lock_icon}',
  forcejoin_desc: '{sparkle_icon} The gates to <b>{store}</b> only open once you join our official channel(s)/group(s) below. It\'s free and takes just a few seconds! {bolt_icon}\n\n{arrow_icon} Tap the button(s), join, then come back and hit <b>"{check_icon} I\'ve Joined"</b> to verify automatically.',
  forcejoin_channel_line: '{status} {title}',
  forcejoin_status_joined: '✅',
  forcejoin_status_pending: '🔸',
  btn_checkjoin: '✅ I\'ve Joined',
  forcejoin_still_locked: '🚫 Looks like you haven\'t joined all the channels/groups yet. Join them all first, then tap this button again!',
  forcejoin_all_joined_toast: '🎉 Awesome, you\'ve joined everything! Welcome aboard~',
  btn_join_channel: '📢 Join {title}',

  maintenance_title: '{wrench_icon} <b>UNDER MAINTENANCE</b> {wrench_icon}',
  maintenance_desc: '{sparkle_icon} Hey <b>{store}</b> fam! We\'re upgrading & polishing the bot to make it faster, more stable, and even more premium for you. {bolt_icon}\n\n{clock_icon} Please hang tight, we\'ll be back shortly!\n{heart_icon} Thanks so much for your patience 🙏',

  maintenance_finished_title: '{rocket_icon} <b>WE\'RE BACK ONLINE!</b> {rocket_icon}',
  maintenance_finished_desc: '{sparkle_icon} Great news, <b>{store}</b> fam! Maintenance is {check_icon} <b>DONE</b> — the bot is now faster, more stable, and even more premium than before. {bolt_icon}\n\n{gift_icon} Every feature is back to normal — go ahead and place your order now!\n{heart_icon} Thanks so much for your patience 🙏'};

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
}

// Look up a text by key and fill in {placeholders}. Returns the key itself
// when it is missing, so a typo shows up plainly instead of printing
// "undefined" to the user.
function t(chatId, key, vars) {
  const str = DICT[key];
  if (str === undefined) return key;
  return interpolate(str, vars);
}

module.exports = { t, DICT };
