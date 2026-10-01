// ============================================================
// CUSTOM EMOJI ID — INLINE MENU BUTTON ICONS (per button/page)
// ============================================================
// Used for the custom emoji that appears as the ICON on an inline keyboard
// BUTTON LABEL, via the "icon_custom_emoji_id" field on InlineKeyboardButton
// — a Bot API 9.4 feature (released 9 Feb 2026). This is a different mechanism
// from emoji inside MESSAGE TEXT (see emoji-id-text.js): it is not an HTML tag
// inside the text, but a separate field on the button object itself.
// Before Bot API 9.4, custom emoji on buttons were not supported by Telegram at
// all — now they are.
//
// Each key below = one specific button/page, so you can give every button a
// DIFFERENT custom emoji icon (rather than reusing a single ID everywhere).
//
// HOW TO FILL IN: just replace the string value below (between the "").
// LEAVE IT EMPTY ("") when you do not have an ID yet — the button still renders
// normally (falling back to plain text) without breaking the bot, see iconFor() below.
//
// ⚠️ HARD REQUIREMENT: the BOT OWNER's account (not the bot itself) must have an
// active Telegram Premium subscription. If the owner is not Premium, or the ID
// is left empty, the button simply renders normally WITHOUT an icon - the bot
// keeps working, NO ERROR.
//
// How to obtain a custom_emoji_id:
// 1. Send the custom emoji you want to @userinfobot or @RawDataBot (send it
//    from a Premium account so the custom emoji is really attached as an
//    entity, instead of appearing as plain text).
// 2. Look at the "custom_emoji_id" field in that message's entities.
// 3. Paste the ID (a long number, for example "5373141891321699086") into the
//    matching key in the EMOJI_IDS object below.
// ============================================================

const EMOJI_IDS = {
  // --- Main /start menu ---
  buy_product: "5472401690793614752",
  profile: "5249053508681883137",
  my_balance: "5278467510604160626",
  topup: "5267300544094948794",
  my_orders: "5444856076954520455",
  referral: "5449800250032143374",
  support: "5201990176175299013",

  // --- Refer & Earn page (the buttons inside it) ---
  share_referral: "5258043150110301407",
  copy_referral: "5987635334945444280",

  // --- Buttons on other pages ---
  contact_support: "5172893417717367746",
  close_menu: "5368352122318383442",
  recover: "5377584064326804458",
  cancel_recover: "5368352122318383442",
  refresh_2fa: "5433878454078556670",

  // --- Gift selection buttons (Buy Gift/Confess Gift) ---
  // A FALLBACK ONLY - when a gift from the Telegram catalogue has its own
  // sticker custom_emoji_id (see getGiftCatalog() in userbot.js), that one is
  // used for the button icon instead of the ID here. This ID only applies when
  // the gift has no custom sticker (falling back to a plain 🎁).
  gift: "",

  // --- Wallet / Topup menu ---
  topup_qris: "6084682277072144595",
  topup_usdt: "5292125588209804353",
  topup_ton: "5834757434333208303",
  // New: the Binance Pay topup button - deliberately left empty (never captured
  // through "🎨 Manage Emoji ID"); fill it in from the admin panel or paste the
  // ID here manually once you have one.
  topup_binance: "",
  cancel_nav: "5969916760898408074",
  quick_amount: "5188605164000395914",
  custom_amount: "5395444784611480792",
  cancel_qris: "5974083768233760323",
  copy_address_usdt: "5292125588209804353",
  cancel_usdt: "5974083768233760323",
  copy_address_ton: "5834757434333208303",
  cancel_ton: "5974083768233760323",
  copy_id_binance: "",
  cancel_binance: "",

  // --- General navigation (used across many pages) ---
  back: "5255703720078879038",
  go_back: "5346320297299560938",

  // --- Product description page ---
  how_to_use: "5420323339723881652",
  buy_now: "5440841102871517055",

  // --- Quantity and order confirmation pages ---
  custom_qty: "6215281817247812147",
  place_order: "5193065010795911968",
  cancel_order: "5974083768233760323",

  // --- Force Join Channel buttons ---
  // Deliberately filled with IDs that ALREADY EXIST and are already used on
  // other buttons (not new IDs), matched by what the button DOES - so that as
  // soon as the owner updates this code, they render with the same Premium emoji
  // WITHOUT the admin having to forward any emoji again.
  join_channel: "5172893417717367746",  // same as the "Contact Support" button (both are url buttons leaving the bot)
  checkjoin: "5193065010795911968",     // same as the "Place Order" button (both are ✅ confirmation buttons)

  // --- Admin panel: /admin ---
  // Not present in data/db.json yet (never captured through "🎨 Manage Emoji
  // ID"), so deliberately left empty - fill them in from the admin panel or
  // paste them here manually once you have the IDs.
  // The 4 category buttons in the main /admin menu (see adminMainKeyboard() in bot.js)
  admin_cat_products: "",
  admin_cat_users: "",
  admin_cat_reports: "",
  admin_cat_settings: "",
  // The "🏠 Main Menu" button (a shortcut straight back to the main /admin menu
  // from any submenu page) - see adminBackKeyboard() and friends in bot.js
  admin_main_menu: "",
  admin_product_list: "",
  admin_add_product: "",
  admin_delete_product: "",
  admin_add_stock: "",
  admin_add_variant: "",
  admin_set_price: "",
  admin_set_howto: "",
  admin_set_logo: "",
  admin_manage_balance: "",
  admin_topup_pending: "",
  admin_delivery_log: "",
  admin_check_order: "",
  admin_statistics: "",
  admin_manage_emoji: "",
  admin_auto_backup: "",
  admin_broadcast: "",
  admin_channel_notif: "",
  // The "🎁 Manage Gift Emoji" button in the Gift (Userbot) category - DIFFERENT
  // from the "gift" key above (that one is the fallback icon for the gift
  // SELECTION buttons themselves; this is only the icon for the admin menu
  // button that opens the "Manage Gift Emoji" feature).
  admin_gift_emoji: "",
};

// Look up the ID for one button key. Priority: (1) the result of an "automatic
// capture" via the admin "🎨 Manage Emoji ID" feature (stored persistently in
// data/db.json), then (2) an ID pasted manually into the EMOJI_IDS object above.
// Returns null when both are empty, so the caller (withButtonIcon() in bot.js)
// knows to omit the icon_custom_emoji_id field entirely - rather than sending an
// empty string to Telegram (which could trigger a field validation error).
function iconFor(key) {
  const db = require('./db');
  const fromDb = db.getEmojiId(`menu:${key}`);
  if (fromDb) return fromDb;
  const id = EMOJI_IDS[key];
  return id ? id : null;
}

module.exports = { EMOJI_IDS, iconFor };
