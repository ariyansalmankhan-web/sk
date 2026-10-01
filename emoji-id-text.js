// ============================================================
// CUSTOM EMOJI ID — MESSAGE TEXT (not buttons)
// ============================================================
// Fill the IDs in DIRECTLY in this file (not through .env). Used for the "⚡"
// custom emoji that appears INSIDE message text via the HTML tag
// <tg-emoji emoji-id="...">⚡</tg-emoji> — a different mechanism from emoji used
// as inline button icons (see emoji-id-menu-inline.js).
//
// There are 2 places it is used, and they may hold different IDs:
// - EMOJI_ID_PRODUCT_DESC -> ONLY for the legacy "{e}" bullet in product
//   descriptions and how-to-use text. OTHER premium emoji the owner picks
//   straight from their Telegram Premium panel while typing a description or
//   how-to-use do NOT need this ID - those are captured automatically from the
//   owner's own message (see embedOwnerCustomEmoji() in bot.js). This ID can be
//   left empty if you never use the "{e}" bullet.
// - EMOJI_ID_MENU_NOTIF   -> menu/notification text: welcome, order success,
//   admin panel, and so on.
//
// ⚠️ HARD REQUIREMENT (Telegram Bot API 9.4, released 9 Feb 2026):
// A bot may ONLY use custom emoji in text when the BOT OWNER's account (not the
// bot itself) has an active Telegram Premium subscription. If the owner is not
// Premium, or the ID is left empty, it falls back automatically to the plain
// unicode emoji "⚡" - the bot keeps working, NO ERROR.
//
// How to obtain a custom_emoji_id:
// 1. Send the custom emoji you want to @userinfobot or @RawDataBot (send it
//    from a Premium account so the custom emoji is really attached as an
//    entity, instead of appearing as plain text).
// 2. Look at the "custom_emoji_id" field in that message's entities.
// 3. Paste the ID (a long number, for example "5373141891321699086") into the
//    variable below, between the quotes.
// ============================================================

// <- Paste a custom_emoji_id here (for example '5373141891321699086')
const EMOJI_ID_PRODUCT_DESC = '';

// <- Paste a custom_emoji_id here (may be the same as or different from the one above)
const EMOJI_ID_MENU_NOTIF = '';

// ============================================================
// BACKUP — ALL "teks:*" custom emoji IDs (per page key)
// ============================================================
// This is a BACKUP COPY of data/db.json.emojiIds (the "teks:xxx" keys), which
// are captured automatically via admin "🎨 Manage Emoji ID" -> "✍️ Emoji in
// Message Text". The textEmoji(key, fallback) function in bot.js CURRENTLY only
// reads from data/db.json directly - the object below is NOT used by the bot
// automatically, so if db.json is lost or reset, just paste the contents of this
// object back into data/db.json.emojiIds (with a "teks:" prefix) to restore
// them, or wire it up as a second fallback in bot.js the same way EMOJI_IDS
// works in emoji-id-menu-inline.js.
const EMOJI_ID_TEXT_BACKUP = {
  welcome_wave: "5316544208159390529",
  // The 5 new slots below are DELIBERATELY filled with IDs that ALREADY EXIST
  // and are already used on other pages (not new IDs) - so that as soon as the
  // owner updates this code, the welcome text renders with the same Premium
  // emoji style/set as the main menu buttons and other pages, WITHOUT the admin
  // having to forward any emoji again via "🎨 Manage Emoji ID". To switch to a
  // different emoji later, the admin panel still works as usual (an override set
  // there always wins - see the priority order in textEmoji()).
  welcome_cart: "5472401690793614752",   // same as the "🛒 Buy Product" menu button (menu:buy_product)
  welcome_wallet: "5267300544094948794", // same as the "💳 Wallet" menu button and the "wallet_title" text
  welcome_bolt: "6267008582294705964",   // same as the "✅ Automatic" icon in usdt_auto/ton_auto
  welcome_gift: "5449800250032143374",   // same as the "🎁 Refer & Earn" menu button and the referral_title text
  welcome_arrow: "5440841102871517055",  // same as the "Buy Now" button (menu:buy_now)
  profile_title: "5249053508681883137",
  profile_name: "5305729205630155413",
  profile_username: "5222444124698853913",
  profile_chatid: "5837071798935492251",
  profile_balance: "6086980694460861135",
  profile_order: "5444856076954520455",
  profile_referral: "5449800250032143374",
  balance_line: "5332600543963522398",
  referral_title: "5449800250032143374",
  referral_reward: "5188605164000395914",
  referral_link: "5271604874419647061",
  referral_howitworks: "5361924463241739687",
  referral_total: "5944970130554359187",
  referral_earnings: "5188605164000395914",
  success_border: "5422439311196834318", // same as channelnotif_border/qris_tip/forcejoin_sparkle (a ✨ decorative/opening feel) - see the note in buildSuccessText() (bot.js)
  success_title: "5461151367559141950",
  success_delivered: "4951848493422478932",
  success_link: "4916086774649848789",
  success_manual: "5447644880824181073",
  success_thanks: "5197317659779159705",
  qris_title: "6084682277072144595",
  qris_rocket: "5188481279963715781",
  qris_orderid: "5444856076954520455",
  qris_balance: "5188605164000395914",
  qris_total: "5278467510604160626",
  qris_expire: "6084396322444544568",
  qris_how_to_pay: "5472367477084134145",
  qris_step1: "6109505856603165125",
  qris_step2: "5343633090881264367",
  qris_step3: "5352533972515562491",
  qris_auto: "5456140674028019486",
  qris_tip: "5422439311196834318",
  usdt_title: "5292125588209804353",
  usdt_max: "5382164415019768638",
  usdt_min: "5382164415019768638",
  usdt_address_label: "5292125588209804353",
  usdt_auto: "6267008582294705964",
  ton_title: "5834757434333208303",
  ton_min: "5834448733558808898",
  ton_max: "5834448733558808898",
  ton_address_label: "5834535964344590817",
  ton_auto: "6267008582294705964",
  wallet_title: "5267300544094948794",
  orders_empty: "5444856076954520455",
  howto_title: "6084894182168594918",
  qris_creating: "5427181942934088912",
  usdt_prompt: "5292125588209804353",
  qty_stock: "5780714685481357611",
  qty_warning: "5285139029333919650",
  support_title: "5404435834789187002",
  qris_choose_amount_title: "4999349087959515856",
  ton_prompt: "5834448733558808898",
  order_confirm_title: "6084858911897160230",
  order_confirm_balance: "5463219974132746636",
  order_confirm_stock: "5469641199348363998",
  insufficient_balance_warn: "5285139029333919650",
  insufficient_balance_shortfall: "5463219974132746636",

  // --- "Bulk Discount" block (NEW) ---
  // Previously the 🎉 and ✅ here were plain unicode HARDCODED straight into
  // lang.js (bulk_discount_title/bulk_discount_line) - so they could NEVER render
  // as premium even though the other icons on the same "Enter Quantity" page
  // (⚠️/📦) already did. They now go through textEmoji() as well (see tiersText()
  // in bot.js) - deliberately BORROWING IDs that ALREADY EXIST and are already
  // used elsewhere (not new IDs) so that as soon as the owner updates this code
  // they render as premium without forwarding any emoji again: bulk_title borrows
  // from success_title (the 🎉 in the "ORDER SUCCESSFUL" heading), bulk_check
  // borrows from forcejoin_check (the ✅ force-join tick). Either can still be
  // changed separately at any time via admin "🎨 Manage Emoji ID" -> "✍️ Emoji in
  // Message Text" (an override set there always wins - see textEmoji()).
  bulk_title: "5461151367559141950", // same as success_title (🎉)
  bulk_check: "6267008582294705964", // same as forcejoin_check/welcome_bolt (✅)

  // --- Force Join Channel screen ---
  // Same as the welcome_* slots above: deliberately filled with IDs that ALREADY
  // EXIST and are already used in other text/pages (not new IDs), matched by
  // their FEEL/purpose - so that as soon as the owner updates this code, the
  // force-join screen renders in the same Premium emoji style as every other
  // page, WITHOUT the admin having to forward any emoji again.
  forcejoin_lock: "5285139029333919650",     // same as qty_warning/insufficient_balance_warn (a "needs attention first" feel)
  forcejoin_sparkle: "5422439311196834318",  // same as qris_tip (an opening-line/tip feel)
  forcejoin_bolt: "6267008582294705964",     // same as welcome_bolt/usdt_auto/ton_auto (a "fast/automatic" feel)
  forcejoin_arrow: "5440841102871517055",    // same as welcome_arrow/buy_now (a "here is the next action" feel)
  forcejoin_check: "6267008582294705964",    // same as welcome_bolt (the "✅ Automatic" tick icon)
  forcejoin_status_joined: "6267008582294705964",  // ✅ same as the checkmark above
  forcejoin_status_pending: "5285139029333919650", // same as the qty_warning warning icon (not finished yet)

  // --- Automatic channel notifications (New Purchase / New Wallet Top-Up) ---
  // Same as the other slot groups above: deliberately filled with IDs that
  // ALREADY EXIST and are already used in other text/buttons (not new IDs),
  // matched by their FEEL/purpose - so that as soon as the owner updates this
  // code, channel notifications render in the same Premium emoji style/set as
  // every other page, WITHOUT the admin having to forward any emoji again. They
  // can still be changed at any time via admin "🎨 Manage Emoji ID" -> "✍️ Emoji
  // in Message Text" -> "📢 Channel Notifications" (an override there always wins).
  channelnotif_purchase_title: "5461151367559141950", // same as success_title (🎉 New Purchase!)
  channelnotif_id: "5444856076954520455",             // same as qris_orderid (an "ID/reference number" feel)
  channelnotif_product: "5472401690793614752",        // same as welcome_cart (🛒 Product)
  channelnotif_qty: "5780714685481357611",            // same as qty_stock (a count/quantity feel)
  channelnotif_total: "5278467510604160626",          // same as qris_total (💰 Total)
  channelnotif_time: "6084396322444544568",           // same as qris_expire (a time/duration feel)
  channelnotif_topup_title: "5267300544094948794",    // same as welcome_wallet (💳 New Wallet Top-Up!)
  channelnotif_network: "6267008582294705964",        // same as welcome_bolt/usdt_auto (✅ automatic/verified status)
  channelnotif_amount: "5188605164000395914",         // same as qris_balance (💵 the amount credited)
  channelnotif_referral_title: "5461151367559141950",    // same as success_title/channelnotif_purchase_title (🎉 New Referral Success!)
  channelnotif_referral_user: "5249053508681883137",     // same as profile_title (👤 the User line)
  channelnotif_referral_referredby: "5449800250032143374", // same as referral_title/welcome_gift (🎁 the Referred By line)
  channelnotif_referral_reward: "5188605164000395914",   // same as channelnotif_amount/qris_balance (💵 the Reward line)

  // --- Channel notification border & footer (NEW) ---
  // Previously the "✨" characters in the divider lines above/below the heading,
  // and the "🔥" in the "Fast & Trusted!" footer line, were HARDCODED straight
  // into the text (not via textEmoji()) - so they could NEVER render as premium
  // even though every other ID in these channel notifications already did. Both
  // now go through textEmoji() as well (see buildChannelPurchaseText/TopupText/
  // ReferralText in bot.js), so EVERY icon in a channel notification is premium.
  channelnotif_border: "5422439311196834318", // same as qris_tip/forcejoin_sparkle (a ✨ decorative/opening feel)
  // BUG FIX: previously left empty ("") -> the 🔥 footer ALWAYS rendered as plain
  // unicode even though every other icon in the channel notification was already
  // premium, because textEmoji() treats an empty string as "no ID" (see
  // `id ? ... : fallback` in textEmoji()). It now borrows the same ID as
  // welcome_bolt/usdt_auto/ton_auto/forcejoin_bolt (a "fast/automatic" feel -
  // fitting for the "Fast & Trusted!"/"Instant & Automatic!" tagline), following
  // the same ID-borrowing pattern as the other slots in this object. It can still
  // be changed at any time via admin "🎨 Manage Emoji ID" -> "✍️ Emoji in Message
  // Text" -> "📢 Channel Notifications" -> "Footer Icon 🔥" (an override there always wins).
  channelnotif_footer: "6267008582294705964",

  // --- Channel notifications: Maintenance Started/Finished (NEW) ---
  // The same pattern as the other channelnotif_* slots above: deliberately
  // borrowing IDs that ALREADY EXIST and are already used elsewhere (not new
  // IDs), matched by FEEL - so that as soon as the owner updates this code,
  // maintenance notifications to the channel render in the same Premium emoji
  // style/set. Used by buildChannelMaintenanceText() and the 'maintenance_toggle'
  // handler in bot.js. They can still be changed at any time via admin "🎨 Manage
  // Emoji ID" -> "✍️ Emoji in Message Text" -> "📢 Channel Notifications" (an
  // override there always wins).
  channelnotif_maintenance_start_title: "5285139029333919650",  // same as maintenance_wrench/qty_warning (a "needs attention" feel)
  channelnotif_maintenance_start_status: "6084396322444544568", // same as maintenance_clock/qris_expire (a time/duration/temporary feel)
  channelnotif_maintenance_finish_title: "5188481279963715781", // same as maintenance_finished_rocket/qris_rocket (a "launch/comeback" feel)
  channelnotif_maintenance_finish_status: "6267008582294705964", // same as welcome_bolt/forcejoin_check (✅ a "done/automatic" status)

  // --- Bot Maintenance Mode (NEW) ---
  // Same as the other slot groups above: deliberately borrowing IDs that ALREADY
  // EXIST and are already used in other text/pages (not new IDs), matched by
  // their FEEL/purpose - so that as soon as the owner enables "🛠️ Bot
  // Maintenance" from the admin panel, the message renders in the same Premium
  // emoji style/set as every other page, WITHOUT the admin having to forward any
  // emoji again. It can still be changed at any time via admin "🎨 Manage Emoji
  // ID" -> "✍️ Emoji in Message Text" -> "🛠️ Maintenance Mode"
  // (an override there always wins - see the priority order in textEmoji()).
  maintenance_wrench: "5285139029333919650",  // same as qty_warning/forcejoin_lock (a "needs attention" feel)
  maintenance_sparkle: "5422439311196834318", // same as qris_tip/forcejoin_sparkle/success_border (a ✨ decorative/opening feel)
  maintenance_bolt: "6267008582294705964",    // same as welcome_bolt/usdt_auto (a "fast/automatic" feel)
  maintenance_clock: "6084396322444544568",   // same as qris_expire (a time/duration feel)
  maintenance_heart: "5197317659779159705",   // same as success_thanks (a thanks/appreciation feel)

  // --- Maintenance Mode FINISHED (NEW) --- used when the admin turns
  // Maintenance off via "🔴 Disable", broadcast automatically to ALL users
  // (see buildMaintenanceFinishedText() and the 'maintenance_toggle' handler in
  // bot.js). Same as the other groups: deliberately borrowing IDs that ALREADY
  // EXIST and are already used elsewhere (not new IDs), matched by a
  // "comeback/finished/celebration" FEEL - so that as soon as the owner updates
  // this code, the broadcast renders in the same Premium emoji style/set as every
  // other page, WITHOUT the admin having to forward any emoji again.
  // They can still be changed at any time via admin "🎨 Manage Emoji ID" -> "✍️
  // Emoji in Message Text" -> "🛠️ Maintenance Mode" (an override always wins).
  maintenance_finished_rocket: "5188481279963715781", // same as qris_rocket (a "launch/comeback" feel)
  maintenance_finished_sparkle: "5422439311196834318", // same as maintenance_sparkle/qris_tip (a ✨ decorative/opening feel)
  maintenance_finished_check: "6267008582294705964",   // same as welcome_bolt/forcejoin_check (✅ a "done/automatic" status)
  maintenance_finished_bolt: "6267008582294705964",    // same as welcome_bolt/usdt_auto (a "fast/automatic" feel)
  maintenance_finished_gift: "5449800250032143374",    // same as welcome_gift/referral_title (🎁 a "usable again/reward" feel)
  maintenance_finished_heart: "5197317659779159705",   // same as maintenance_heart/success_thanks (a thanks/appreciation feel)
};

module.exports = {
  EMOJI_ID_PRODUCT_DESC: EMOJI_ID_PRODUCT_DESC || null,
  EMOJI_ID_MENU_NOTIF: EMOJI_ID_MENU_NOTIF || null,
  EMOJI_ID_TEXT_BACKUP
};
