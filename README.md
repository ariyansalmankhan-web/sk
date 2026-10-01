# Premium Account Bot (Telegram)

A Telegram bot with inline menus for selling premium accounts (Gemini Premium 18 Months, Netflix, Spotify, and so on) with **automatic Wallet topup** via QRIS (PayKita), USDT on BEP20, TON, and Binance Pay — the balance is credited automatically the moment a payment is detected, with no admin approval needed.

## Features

- Inline menus: Products → Category → Variant → Purchase confirmation
- A per-user Wallet balance, debited automatically on purchase
- **Automatic Wallet topup** — 4 methods:
  - **QRIS** via [PayKita](https://pay.digikita.id): a dynamic QR is created per transaction, and the balance is credited automatically as soon as the order status becomes PAID
  - **USDT (BEP20 / BNB Smart Chain)**: the bot generates a unique USDT amount per transaction and watches incoming transfers on-chain directly from a public BSC RPC node, crediting the balance automatically once the transaction is confirmed
  - **TON (The Open Network)**: the same concept as USDT, monitored via the TonCenter API
  - **Binance Pay**: a C2C transfer to the store's own Binance ID; the bot generates a unique amount per transaction and watches the payment history through Binance's official API (`GET /sapi/v1/pay/transactions`, an ordinary API key is enough — no Merchant account), crediting the balance automatically once the transaction is detected
- New-order notifications to every admin
- A full inline admin panel: add/remove products and variants, adjust user balances manually, look up orders
- **Auto Backup** — zips the full project source code (except `node_modules` and `.npm`) and sends it automatically to a Telegram group at an interval the admin sets
- **3-level bulk discount tiers** (1-49 / 50-499 / 500+ pcs) per variant — sale prices can be typed in directly (🎁 Set Bulk Discount Tiers) or computed automatically as a markup% on the supplier cost (📊 Set 3-Tier Markup), with a **🔒 Lock Manual Price** option for Supplier API variants so auto-sync cannot overwrite them
- A local JSON file database (`data/db.json`) — no database server to set up

## Installation

1. Make sure Node.js is installed (**v18+ required** — the built-in `fetch` is used when calling the PayKita and on-chain APIs).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`, then fill in:
   ```
   BOT_TOKEN=token_from_botfather
   ADMIN_IDS=123456789,987654321
   STORE_NAME=Your Store Name
   BOT_USERNAME=YourBotUsername
   REFERRAL_REWARD=1
   ```
   - Get `BOT_TOKEN` from [@BotFather](https://t.me/BotFather).
   - Get your own Telegram ID from [@userinfobot](https://t.me/userinfobot).
   - `BOT_USERNAME` is the bot username **without** `@` (for example `PremiumStoreBot`) — used to build each user's personal referral link. If it is empty, the Referral menu shows a warning instead.
   - `REFERRAL_REWARD` is the balance (USD) the referrer earns each time a friend tops up their balance for the first time through their referral link. Default: 1.
4. Also fill in the **Automatic Wallet Topup** configuration (see the section below).
5. Start the bot:
   ```bash
   npm start
   ```

## 💳 Automatic Wallet Topup

There are 4 payment methods, each enabled independently of the others — if one is left unconfigured, the bot shows the user a warning when they pick that method (rather than erroring or crashing).

### 1) QRIS via PayKita

PayKita is a *payment tool* that turns your own static QRIS (ShopeePay Partner / GoPay Merchant / another provider via Listener) into a dynamic per-transaction QRIS with automatic payment detection.

**Setup:**
1. Register and log in at [pay.digikita.id/register](https://pay.digikita.id/register)
2. Connect one of your QRIS providers from the dashboard (read the integration-risk page linked there first)
3. Test the payment flow from the dashboard until an order reaches **PAID** status — this can be tried free, without a subscription
4. Once you are satisfied, activate the API subscription (from Rp5,000/month) to unlock the **REST API**
5. Create an API key (`pk_live_...`) from the dashboard, then set it in `.env`:
   ```
   PAYKITA_API_KEY=pk_live_xxxxxxxxxxxx
   PAYKITA_API_BASE=https://paykita.biz.id
   ```

**⚠️ Integration note (worth reading):**
PayKita's official documentation page (`https://pay.digikita.id/documentation`) requires a merchant dashboard login to open, so the exact API response field names (the QR field name, the check-status-by-id endpoint, and so on) could not be verified without that access. The integration code (`payment.js`) is written defensively — it tries several possible field names and endpoints based on what is publicly available on PayKita's main page:
- Create order endpoint: `POST https://paykita.biz.id/api/orders` with an `x-api-key` header and a `{ base_amount, reference }` body
- An order changes to `PAID` status automatically once a matching payment arrives

If the QR does not appear, or payment status is not detected automatically after you add your API key, open `payment.js` and read the comment at the top of the file (it lists exactly what to check and adjust once you have logged into the PayKita dashboard and seen a real API response). Nothing else in `bot.js` needs changing afterwards.

### 2) USDT on BEP20 (BNB Smart Chain)

This method watches incoming transfers **directly on the blockchain**, reading from a public BSC RPC node via JSON-RPC `eth_getLogs` — free, no API key, and no dependency on a paid block-explorer API. It needs no phone or app running continuously.

**Setup:**
1. Prepare your own BEP20 (BSC) wallet address to receive USDT
2. Set it in `.env`:
   ```
   USDT_BEP20_ADDRESS=0xYourWalletAddress
   ```
   This store already uses USD as its main currency, and USDT is pegged ~1:1 to USD, so the USD topup amount is used directly as the USDT amount — no conversion rate needed.
3. Optional: set `BSC_RPC_URL` in `.env` (comma separated) to use your own RPC endpoints instead of the default public one. See the comments in `payment.js` — of the public RPCs tested, only `bsc.publicnode.com` still serves `eth_getLogs` for free, which is why it is the default.

**How automatic matching works:** because a USDT transfer on the blockchain has no memo/note field, the bot adds a small 4-decimal variation (for example `50` USD → `50.0672` USDT rather than a flat `50.0000`) to every topup request so each amount is unique. It then polls the chain roughly every 20 seconds looking for an incoming transfer to your wallet with an exactly matching amount, and credits the user's balance as soon as it finds one. Users are asked to send the **EXACT** amount to 4 decimals and **must** use the BEP20 network (not TRC20/ERC20/anything else).

Every matched transfer is also checked against previously used transaction hashes before any balance is credited, so a single on-chain transaction can never be replayed to credit two deposits.

### 3) TON (The Open Network)

The same concept as USDT, but monitored through the [TonCenter](https://toncenter.com) API — free and usable without an API key (with a more generous rate limit if you register one).

**Setup:**
1. Prepare your own TON wallet address to receive payments
2. Set it in `.env`:
   ```
   TON_ADDRESS=YourTonAddress
   TONCENTER_API_KEY=optional_key_from_toncenter
   ```

The USD amount the user requests is converted to TON automatically using the live CoinGecko rate (cached for 5 minutes), then given a small unique variation just like USDT. Users should send from a real TON wallet (Tonkeeper, Tonhub, and so on) rather than an exchange that rounds or trims the amount sent.

### 4) Binance Pay (C2C transfer to a personal Binance ID)

This method suits you if you **do not have** a Binance Pay merchant account (which requires business registration) — an ordinary personal Binance account is enough. The bot watches incoming payments through Binance's **official** "Get Pay Trade History" endpoint (`GET /sapi/v1/pay/transactions`), which is a regular API (not the Merchant API), so a single API key from your own Binance account is all you need.

**Setup:**
1. Open [binance.com](https://www.binance.com) → log in → **Profile** (top-right icon) → **API Management**
2. **Create API** → choose **System generated** → give it any name (for example `bot-topup-readonly`)
3. Once created, on that API key's permission page, tick **ONLY** ✅ **Enable Reading**. Do **NOT** enable "Enable Spot & Margin Trading" or "Enable Withdrawals" at all — this feature purely reads Pay transaction history, and enabling anything else only adds risk if the key ever leaks
4. Copy the **API Key** and **Secret Key** into `.env`:
   ```
   BINANCE_API_KEY=apikey_from_binance
   BINANCE_API_SECRET=secretkey_from_binance
   BINANCE_PAY_ID=1273523449
   ```
5. `BINANCE_PAY_ID` is your own Binance ID (open the Binance app → **Pay** tab → profile/QR icon top-right → the number under your name). This is what buyers are shown so they can send via **Pay → Send**.

**How automatic matching works:** exactly the same concept as USDT/TON above — because a Binance Pay transfer need not carry a reliable memo, the bot adds a small 4-decimal variation to each topup request so the amount is unique, then polls the Binance Pay history roughly every 20 seconds for an incoming transaction (`orderType: C2C`) with an exactly matching amount within the last 2 hours, and credits the user's balance as soon as it finds one. Users are asked to send the **EXACT** amount to 4 decimals via **Pay → Send** to the Binance ID above (not P2P or an ordinary wallet transfer).

The asset must be **USDT** as well: a transfer of any other asset will never match, even if the number is identical. That check exists deliberately — without it, a buyer could send the same numeric amount in a near-worthless asset and still be credited in full.

⚠️ **Security note:** never share `BINANCE_API_SECRET` with anyone, and keep this key **read-only** as instructed above — then even if it leaks, an attacker can do nothing but read transaction history (no trading, no withdrawals).

## How to Use (User)

- `/start` → open the main menu
- Pick **🛒 Buy Product** → a flat list of every product with price and stock, 🟢 = in stock, 🔴 = out of stock
- Pick **👤 Profile** → name, username, Chat ID, Wallet balance, total orders, and total referrals, plus **💳 Wallet** and **🧾 My Orders** shortcut buttons
- Tap a product → its **product description page** (specifications, terms and conditions) with buttons:
  - **❗️ How to Use** → the redeem/activation guide
  - **✅ Buy Now** → continue to choose a quantity
  - **‹ Back** → back to the product list
- On the quantity page → quick buttons (1/5/10/20/30/50/100) or **Custom Amount**, then **Order Confirmation** (total price, wallet balance, stock) → **Place Order** / **Cancel Order**
- Pick **💳 Wallet** → choose **QRIS**, **USDT (BEP20)**, **TON**, or **Binance Pay**:
  - **QRIS** → a **Choose Deposit Amount** menu with quick buttons ($1/$5/$10/$25/$50/$100) or **✏️ Custom Amount** to type your own → the bot builds the QRIS with a **❌ Cancel Payment** button (cancelling deletes the QR and returns to the main menu)
  - **USDT (BEP20)**, **TON**, and **Binance Pay** → type the amount directly, and the bot returns a unique amount plus the address/Binance ID to send to
  - The balance is credited **automatically**, with no waiting on an admin
- **🧾 My Orders** → the 5 most recent orders (Order ID, product, quantity, status) with **🏅 Recover Product** (resend a previously delivered link/code, just type its Order ID) and **❌ Cancel** (back to the main menu)
- **❗️ How to Use** → a list of every product; tap one to see its usage guide (the same text as `howToUse` on the product description page), plus a **❌ Close menu** button
- **🎁 Refer & Earn** → the personal referral link, referral count, and total referral earnings, plus a **📤 Share Referral Link** button to share straight into another chat. Once a friend who joined through that link tops up their balance for the first time, the referrer's balance increases by `REFERRAL_REWARD` automatically.
- **📞 Support** → a **Contact Support** button that opens a private chat with the bot owner (the first admin in `ADMIN_IDS`), plus **‹ Back** to the main menu.

## Main Menu Button Colours 🎨

Since Telegram **Bot API 9.4** (released 9 Feb 2026), inline keyboard buttons can be given a background colour via the `style` field — this works for ALL bots and needs no Telegram Premium at all (unlike custom emoji). The main menu (`/start`) already uses it:
- Ordinary buttons (Buy Product, My Balance, Wallet, My Orders) → `style: 'primary'` (blue)
- The Refer & Earn button → `style: 'success'` (green), so it stands out

To change another button's colour, just wrap it with the `withStyle(button, 'primary' | 'success' | 'danger')` helper in `bot.js`.

## Premium Emoji (Custom Emoji) ⚡

There are **2 different mechanisms** for Telegram Premium custom emoji in this bot:

### 1. Product Descriptions & How to Use — AUTOMATIC, no ID configuration at all

When the admin (owner) fills in a **product description** (via ➕ Add Product) or **How to Use** (via ✏️ Set How to Use), the text is **entirely free form** — as many lines as you like, and HTML tags such as `<b>...</b>` for bold.

If, while typing, the owner **picks a premium emoji straight from their own Telegram Premium emoji panel** (rather than just typing a plain unicode character), Telegram automatically includes that emoji's ID in the message data the bot receives. The bot locks that ID into the stored text immediately — so the emoji **appears as premium to every buyer**, with no ID to paste into any file.

If the owner only types a plain unicode emoji (rather than picking from the Premium panel), it simply renders as an ordinary emoji — which is expected, since it is not a custom emoji.

The legacy `{e}` placeholder (once required to produce the "⚡" bullet in front of each point) is still supported as an alias, but is now optional — that bullet uses the ID from `EMOJI_ID_PRODUCT_DESC` in `emoji-id-text.js` when set, or falls back to a plain "⚡" when empty.

### 2. Menu/Notification Text & Button Icons — manual, set in a file

For text that is **not** written freely by an admin (the `/start` welcome, the "🎉 ORDER SUCCESSFUL!" message, admin panel headers, icons on menu button labels), the custom emoji are set manually in 2 files:

| File | Variable | Used for |
|---|---|---|
| `emoji-id-text.js` | `EMOJI_ID_MENU_NOTIF` | The bot's built-in "⚡" bullet in menu/notification text |
| `emoji-id-menu-inline.js` | `EMOJI_IDS` (an object, one key per button) | Icons on inline menu button labels — each button (Buy Product, My Balance, How to Use, the admin panel buttons, and so on) has its own key and ID, so every button can have a different icon. See the full key list and its comments in that file. Applied via the `icon_custom_emoji_id` field (a Bot API 9.4 feature). |

If any ID is left empty, it falls back to a plain unicode emoji automatically (not an error).

**An important note about buttons** — for buttons that are NOT given an icon via `withButtonIcon()`/`withButtonIconPreferProduct()` (such as "❌ Cancel Order"), the emoji in the label always renders as standard unicode. The `icon_custom_emoji_id` field only applies to buttons that explicitly use it; that is a limitation of the Telegram Bot API itself, not a bug in this bot.

**Important (verified against the [official Bot API changelog](https://core.telegram.org/bots/api-changelog#february-9-2026), Bot API 9.4, released 9 February 2026)** — a bot **may** send custom emoji in message text, but **the bot owner's account must have a Telegram Premium subscription**. This applies to both mechanisms above: hardcoded IDs as well as IDs captured automatically from the owner's typing. If the owner is not Premium, any custom emoji falls back to plain unicode for that slot — it never errors. The same Bot API 9.4 also added the `icon_custom_emoji_id` field for icons on inline keyboard button labels.

How to obtain a custom emoji ID for the manual mechanism (mechanism 2 above):
1. Forward a message containing that custom emoji to a bot such as `@RawDataBot` or `@userinfobot`
2. Find the `custom_emoji_id` field inside the `entities` section of the JSON it returns
3. Paste the numeric ID into `emoji-id-text.js` (`EMOJI_ID_MENU_NOTIF`) and/or the matching key in the `EMOJI_IDS` object in `emoji-id-menu-inline.js` (for example `buy_product`, `admin_statistics`, and so on — see the full list in that file)

You can also set these from inside the bot: `/admin` → 🎨 Manage Emoji ID, then forward a message containing the emoji. The ID is captured automatically and stored in `data/db.json`, which takes priority over the values in the files. `node check-emoji.js` verifies that every ID you have set still exists on Telegram.

### The "Buy" button icon follows the product's own emoji

The **✅ Buy Now** button (product description page) and **🛒 Order Now** (channel notification) PREFER the product's own premium emoji (`product.emojiId` — the same one `productEmojiHtml()` uses in the "per-product premium emoji" mechanism), when the product has one. So if product X has its own ✨ premium emoji, the Buy Now button on product X's page uses that ✨ icon too — rather than a single generic icon for every product.

If that product has no `emojiId` of its own, both buttons fall back to the global `buy_now` key icon (set manually via `EMOJI_IDS` in `emoji-id-menu-inline.js`) — with no error in either case.

## 🖼️ Product Logos in Channel Notifications

This is a **different** feature from the premium emoji above — not `<tg-emoji>` (which needs Telegram Premium and is still an emoji character), but an actual app logo IMAGE (the official Netflix, Spotify, or Gemini logo, say), sent as a photo in the "🎉 New Purchase!" channel notification.

**Setup:** `/admin` → 🖼️ Set Product Logo → pick a product → send the logo image URL (it must be `http://` or `https://`; hosting the logo yourself is recommended so the link stays stable). Type `-` at any time to remove the logo and go back to the plain emoji.

**How it works:**
- If the purchased product has a stored logo, the "🎉 New Purchase!" channel notification is sent as a **photo** (the logo becomes the image) with the text as its *caption* — the caption keeps the same HTML formatting as usual (`<b>`, `<code>`, and premium `<tg-emoji>` all still render inside a caption).
- If that product has no logo (or none has been set), the notification is sent as usual (text plus a `🛒`/`📦` emoji), with **no error**.
- Telegram caps photo captions at 1024 characters (versus 4096 for ordinary text) — if the content happens to be longer, the bot falls back automatically to a plain text message without the logo, so the notification is still delivered.
- If the logo URL turns out to be broken or unreachable by Telegram at send time, the bot also falls back to plain text — so a notification never fails because of a problem with a logo.

This feature applies only to channel notifications (New Purchase), not yet to the "🎉 ORDER SUCCESSFUL!" message sent to the buyer — that one deliberately stays plain text because it often carries long redeem links or codes (which could be truncated if forced into a photo caption).

## Adding descriptions and guides for other products

The easiest route is `/admin` → ➕ Add Product (or ✏️ Set How to Use) and typing straight into the chat — and if you pick a premium emoji from the Telegram Premium panel while typing, it is stored as premium automatically (see the section above).

To edit `data/db.json` directly instead, add a `description` and `howToUse` field to the target variant (a string, multiple lines and `<b>...</b>` HTML tags are fine). For a custom emoji on this route, paste the `<tg-emoji emoji-id="...">🔥</tg-emoji>` tag into the text by hand (the ID is obtained the same way as mechanism 2 above), for example:

```json
"description": "{e} First line\n<tg-emoji emoji-id=\"5373141891321699086\">🔥</tg-emoji> Second line\n\n{e} <b>Important note:</b>\nNote content here."
```

## 💾 Auto Backup

This feature builds a `.zip` containing the **entire project source code** (every file and folder except `node_modules` and `.npm` — so it stays small rather than many MB) and sends it automatically to a Telegram group at an interval (minutes/hours) the admin sets. It is useful as a safeguard if the server/VPS has problems — just download the latest zip from the group, extract it, run `npm install`, and start again.

**Setup via `/admin` → 💾 Auto Backup:**
1. **🆔 Set Group ID** — enter the destination Telegram Group ID (for example `-1001234567890`). The bot **must** already be a member of that group, or delivery will fail. How to get the Group ID: invite the bot to the group, forward any message from that group to `@userinfobot` or `@RawDataBot`, and read its `id` field.
2. **⏱️ Set Interval** — type the interval in minutes, for example `60` for hourly, `15` for every 15 minutes, `1440` for daily.
3. **▶️ Enable** — turn the schedule on (this button stays locked until a Group ID is set).
4. **📤 Backup Now** — trigger one manually at any time, without waiting for the schedule.

All settings (on/off, interval, Group ID) are stored permanently in `data/db.json`, so they survive a bot restart. `BACKUP_GROUP_ID` and `BACKUP_INTERVAL_MINUTES` in `.env` are optional and only seed the values on the very first run.

**⚠️ Security note:** `.env` is **NOT included** in the backup (it is excluded automatically — see `backup.js`), because it holds the bot token and other sensitive API keys. The consequence: **restoring from a backup zip does NOT restore `.env`** — the admin must fill `.env` in by hand on the new server (from their own notes or password manager, NOT from any chat or zip). The backup still contains all other source code plus `data/db.json` (user data and balances), so make sure the destination group is **private** and contains only people you genuinely trust.

**User data and balances ARE fully backed up** — because `data/db.json` (where every Wallet balance, order history, deposit, product, and so on is stored) goes into the zip as is (the only exclusions are `node_modules` and `.npm`, which hold library dependencies rather than store data). So if the server breaks or is lost, extract the latest backup zip, put the extracted `data/db.json` back into the new project folder, run `npm install`, then `npm start` — every user's balance and data comes back exactly as it was when that backup was made. That is also why it matters to keep the backup interval reasonably tight (hourly, say): if something goes wrong, the most you can lose is the transactions from the last hour.

## 📢 Broadcast

Send one message to **ALL users** who have ever pressed `/start`, via `/admin` → 📢 Broadcast.

**How to use:**
1. Press 📢 Broadcast, then send the message straight to the bot:
   - **Text only** — type freely.
   - **Photo + caption** — send it as an ordinary Telegram photo with a caption.
   - **Photo only** — send a photo with no caption.
2. The text/caption is **free form** — as many lines as you like, standard Telegram HTML tags allowed (`<b>`, `<i>`, `<u>`, `<s>`, `<a href="...">`, `<code>`, `<blockquote>` for quotes, and so on), and if you pick a **premium emoji** straight from your own Telegram Premium emoji panel (rather than just typing plain unicode), it is delivered as premium to every recipient too — the same mechanism as in Premium Emoji, mechanism 1.
3. The bot then shows a **preview** of exactly what users will receive, plus **✅ Yes, Send Now** / **❌ Cancel** buttons.
4. Once confirmed, the bot sends to every user one at a time (with a small delay between messages to stay under Telegram's rate limit), then reports a **succeeded vs failed** summary (a failure usually means that user has blocked or deleted the bot — not an error on your side).

## How to Use (Admin)

Send `/admin` in a private chat with the bot to open the **full inline admin panel** (everything is a button; no commands to memorise). The panel is grouped into 5 categories:

| Button | Function |
|---|---|
| 📦 Product List | See every product with its id, price, and stock |
| ➕ Add Product | Create a new product — just 3 steps: **name → price → description** |
| 🗑️ Delete Product | Pick a product from the list, then confirm deletion |
| 📥 Add Stock | Pick a product, then send redeem links/codes one at a time or in bulk |
| ➕ Add Variant (multi-variant products) | For advanced cases: add a 2nd, 3rd, etc. variant to an existing product (Netflix Sharing vs Private, say) |
| 🖼️ Set Product Logo | Set an app logo image URL (the official Netflix/Spotify/Gemini logo you host yourself) per product — used in the "🎉 New Purchase!" channel notification so it appears as an image rather than just an emoji. Type `-` to remove it (back to the plain emoji) |
| 💰 Manage User Balance | Add to or subtract from a specific user's balance manually |
| 📜 Delivery Log | See the 10 most recent auto-delivered orders along with the links that were sent |
| 🔍 Check Order ID | Look up one specific order by ID and see its details and delivered links |
| 📊 Statistics | Total users, total balance in circulation, total orders, total revenue, and the number of Wallet topups still pending (awaiting payment) |
| 🎁 Set Bulk Discount Tiers | Type 3 USD sale prices directly (1-49 / 50-499 / 500+ pcs) per variant — for Supplier API variants there is a **🔒 Lock Manual Price** button so auto-sync cannot overwrite them — see [🎁 Bulk Discount Tiers & Automatic Markup](#-bulk-discount-tiers--automatic-markup) |
| 🔌 Supplier API (AIVerse Hub) | Link/unlink a local product variant to an AIVerse Hub `service_id` (showing the cost vs sale margin plus quick markup buttons at link time), check the store's balance at AIVerse Hub, and view **🧾 Order History**, **📊 Statistics**, and **🔍 Check Order ID (API)** — see [🔌 Supplier API](#-supplier-api-aiverse-hub) |
| 🔌 Canboso API | A second supplier (separate from AIVerse Hub) — link/unlink a local product variant to a Canboso product, set prices, refresh cost and stock — see [🔌 Canboso API](#-canboso-api-the-second-supplier) |
| 🎁 Gift (Userbot) | Buy Gift / Confess Gift via a GramJS userbot: check the Stars balance, gift order history, manage gift emoji, and set gift pricing |
| 🛠️ Bot Maintenance | Put the bot into maintenance mode (non-admin users are blocked and shown one message), with a preview and an optional custom message |
| 🔐 Force Join Channel/Group | Require users to join one or more channels/groups before they can use the bot |
| 📣 Set Channel Notifications | Post automatically to a channel/group on every purchase, topup, referral, and maintenance change |
| 🎨 Manage Emoji ID | Capture premium custom emoji IDs by forwarding a message, per button and per text slot |
| 💾 Auto Backup | Enable/disable scheduled backups, set the interval (minutes) and destination Group ID, or trigger a manual backup — see [💾 Auto Backup](#-auto-backup) |
| 📢 Broadcast | Send a message (text or photo+caption) to ALL users at once — see [📢 Broadcast](#-broadcast) |

`/cancel` is still available to abort a text input in progress (a mistyped price or stock entry, say).

When a **new order** arrives, every admin automatically receives a notification with the user and product details.

### ➕ Add Product (name + price + description)

Creating a new product takes just 3 steps, with no need to think about ids, variants, or stock first:

1. `/admin` → **➕ Add Product**
2. Type the **product name**, for example: `Gemini Pro 18 Months`
3. Type the **price in USD** (numbers only, decimals allowed), for example: `5.99`
4. Type the **description** (free form, multiple lines and `<b>...</b>` HTML tags are fine), or type `-` to skip it for now

The bot creates one complete product with one default variant holding that price and description, with stock starting at **0**. The next step is simply adding stock via **📥 Add Stock**.

If you need a product with several prices/variants at once (Netflix Sharing vs Private, say), use **➕ Add Variant (multi-variant products)** to add a 2nd or later variant to a product you have already created.

### 📥 Add Stock — pick a product, then pick a method (Link/Code or Manual Number)

"Add Stock" is used to add stock to an existing product (`Gemini Pro 18 Months`, for instance), via **2 methods** you choose between each time:

- **📋 Link/Code (Auto-Delivery)** — enter real redeem links/codes so delivery to the buyer is **automatic**, with no manual sending by the admin.
- **🔢 Number Only (Manual)** — only increases the stock **count**, with no links or codes, for products the admin sends to the buyer themselves after an order arrives (not auto-delivery).

The flow:
1. `/admin` → **📥 Add Stock**
2. Pick a product. If it has only one variant (from an ordinary "➕ Add Product"), the bot continues straight away. For a multi-variant product (Netflix, say), it asks you to pick a variant first.
3. The bot shows the choose-method screen — press **📋 Send Link/Code (Auto-Delivery)** or **🔢 Add Number Only (Manual)**.
4a. If you choose **📋 Link/Code**: send the redeem links/codes, in either of 2 ways (freely mixed):

   **Way 1 — one at a time:** send one link per message, repeating for each new link.
   ```
   Message 1: https://redeem-link-1...
   (the bot confirms)
   Message 2: https://redeem-link-2...
   (the bot confirms again)
   ```

   **Way 2 — in bulk:** send many links in one message, **1 line = 1 unit of stock**.
   ```
   https://redeem-link-1...
   https://redeem-link-2...
   https://redeem-link-3...
   ```
   The bot confirms how many were added plus the current auto-delivery stock total. You can keep sending more lines, or `/cancel` when done.

   Each line may instead be an **account combo** — `email|password|2fa|link`, separated by `|` in that fixed order. For the 2FA field, enter the **TOTP secret key** (not a static 6-digit code) and the bot computes the currently valid code live for the buyer, matching what Google Authenticator would show. When a middle field is missing, leave it empty between two `|` marks rather than removing the segment, so the later fields do not shift position.

4b. If you choose **🔢 Number Only (Manual)**: just type a number (`10`, say) and the bot adds that much to `variant.stock` with no links/codes. You can type another number to add more, or `/cancel` when done. ⚠️ If the same variant is also used via 📋 Link/Code, the manual stock here can be overwritten by the number of stored links/codes — do not mix the two methods on the same variant.

**Once stock has been added by EITHER method above**, the bot automatically sends a **"🔔 NEW STOCK AVAILABLE!"** notification (product name, quantity added, total stock, price — every icon using premium custom emoji via "🎨 Manage Emoji ID" → the "🔔 Live Stock Notification" group) plus an inline **✅ Buy Now** button to **ALL registered users** — pressing it goes straight into the choose-quantity flow for that product. The broadcast runs in the background (so the admin is not kept waiting), and the admin who triggered it gets a succeeded/failed summary once it finishes.

When a user buys a product stocked this way:
- The user's balance is debited immediately, the topmost link (FIFO) is taken and sent to their chat in a neatly formatted **"🎉 ORDER SUCCESSFUL!"** message with premium ⚡ emoji, complete with product details, quantity, total, and order ID.
- The admin gets a light notification (`✅ Auto-delivered`) — **nothing to send manually**.
- If there turn out to be fewer links than the quantity bought (or the product has never been stocked via this menu), the bot falls back automatically to the old flow: the user still gets an order-successful message, while the admin is notified to send the account/details manually. Neither case produces an error or debits stock incorrectly.

Stock remaining via this route also appears in **📦 Product List** tagged `🤖 auto-delivery: N`.

### 📜 Delivery Log & 🔍 Check Order ID

Every time a product is delivered automatically, the bot records **exactly which link/code went to which order ID** (not just the count) — so if a user complains "my link does not work", the admin can audit it directly rather than guessing.

- **📜 Delivery Log** — shows the 10 most recent auto-delivered orders: order ID, user, product, time, and the exact link/code delivered.
- **🔍 Check Order ID** — type a specific order ID (from a new-order notification or a user's purchase history) and the bot returns that order's full details. If it was auto-delivered, the delivered link is included; if it was manual, it is marked "Sent manually by an admin".

When a **Wallet topup succeeds** (QRIS, USDT, TON, or Binance Pay), the user's balance increases automatically with no notification or action needed from an admin.

## 🔌 Supplier API (AIVerse Hub)

This feature links a local product variant to a `service_id` at [AIVerse Hub](https://aiversehub.store) (`AIVERSEHUB_API_KEY` and `AIVERSEHUB_BASE_URL` in `.env`). As soon as a buyer purchases a linked variant, the bot **orders automatically through the AIVerse Hub API** (rather than from local stock) and forwards the code/link the API returns straight to the buyer — much like automated dropshipping. Any local/manual stock on that variant is used FIRST, and only the shortfall is ordered from the supplier. The buyer's balance is debited only **after** the API order succeeds, so no balance is taken without a product being delivered when the API fails (the store's AIVerse Hub balance running out, remote stock being empty, and so on) — in that case the admin is notified and the buyer's balance stays intact.

The cost and stock of linked variants are synced **automatically** every `SUPPLIER_SYNC_INTERVAL_MINUTES` minutes (default 10; set 0 in `.env` to disable) — so there is no need to click "🔄 Refresh Cost & Stock" manually for the stock numbers buyers see to stay live. If a link breaks (the service_id no longer exists at AIVerse Hub) during an auto-sync, every admin is notified automatically; the manual refresh button remains in the Supplier API menu for checking at any time outside the schedule.

**🔔 Live Stock Notifications to ALL users** — as soon as this auto-sync detects that the TOTAL stock of one or more variants has changed (up OR down) since the previous sync, the bot broadcasts a "STOCK UPDATED!" message (product name, old → new stock, price) plus a **✅ Buy Now** button per variant to ALL registered users — the same mechanism as the live stock notification in the manual 📥 Add Stock flow (see that section for how the broadcast and its premium custom emoji work). When several variants change within the same sync cycle, they are combined into ONE message (rather than one per variant) so users are not flooded. ⚠️ This fires whenever a sync detects a CHANGE in the numbers (including small rises and falls, not only a restock from 0) — so if `SUPPLIER_SYNC_INTERVAL_MINUTES` is set tight and the supplier's stock fluctuates often, users may be notified fairly frequently; tune the sync interval to taste.

**Setup via `/admin` → 🔌 Supplier API (AIVerse Hub):**
1. **➕ Link a Product** — pick a local product → pick a variant (for a multi-variant product) → pick a service from the AIVerse Hub product list (fetched live via the API). This variant's local stock may be left at 0 — the stock shown to buyers comes from the synced live number, and the buy button is not locked.

   Once linked, the bot immediately shows a **cost vs sale price comparison** (the margin), with a clear ⚠️ warning if the current sale price is equal to or below the AIVerse Hub cost (so you cannot sell at a loss unknowingly). On the same screen there are quick markup buttons **+10% / +20% / +30% / +50%** (computed from the cost) to set the sale price right away, or **✏️ Custom Price** to type your own.
2. **🗑️ Unlink** — release a variant from the Supplier API; it goes back to local stock as usual.
3. **🧾 Order History** — our store's order history on the AIVerse Hub side (order ID, product, quantity, amount, status, time), with ‹ Previous / Next › navigation.
4. **📊 Statistics** — a summary of deposits and sales (today / 7 days / 30 days / 1 year / all time) plus the best-selling products on the AIVerse Hub side.
5. **🔍 Check Order ID (API)** — type one AIVerse Hub Order ID (not the bot's local Order ID) and the bot returns that order's details (service, quantity, amount, status, delivered products) straight from `GET /api/v1/order/{id}`. Useful when a buyer reports a supplier code not working, without opening the AIVerse Hub dashboard.
6. **🔄 Refresh Cost & Stock** — appears once at least one variant is linked. Calls `GET /api/v1/products` **once** (not per variant, saving AIVerse Hub's 3 req/second rate limit), updates the cost of ALL linked variants at once, shows each variant's latest margin, and warns ⚠️ when AIVerse Hub stock is down to ≤5 (so you can top up there before a buyer fails to purchase) or when a service has been removed from AIVerse Hub.

The **🗑️ Unlink** button asks for confirmation first ("✅ Yes, Unlink" / "❌ Cancel") before actually breaking the link — the same confirmation pattern as 🗑️ Delete Product, so it cannot be pressed by accident.

This menu's main page also shows the connection status (🟢 connected plus the store's balance at AIVerse Hub, or 🔴 if the connection check fails) and a list of every currently linked variant **with its margin** (cost, sale price, profit/loss per pcs) — calculated from the cost snapshotted when the link was first made, and refreshable at any time via 🔄 Refresh Cost & Stock above.

**A note on sale prices:** the base price (tier 1) shown to buyers is set manually via 💲 Set Product Price (the main admin menu) or the quick markup buttons at link time, and NEVER changes automatically for variants that are **not** linked to the Supplier API. For variants that **are** linked and whose price tiers are computed from a markup% (📊 Set 3-Tier Markup), the sale price is DELIBERATELY allowed to rise and fall automatically on every auto-sync so it always matches the latest cost — unless you lock it via 🔒 Lock Manual Price. Full details in [🎁 Bulk Discount Tiers & Automatic Markup](#-bulk-discount-tiers--automatic-markup) below.

## 🎁 Bulk Discount Tiers & Automatic Markup

Every variant has tiered pricing based on quantity: **1-49 pcs / 50-499 pcs / 500+ pcs**, each able to have a different price (a bulk discount). There are 2 ways to set them, plus one safeguard specific to Supplier API variants:

**1. 🎁 Set Bulk Discount Tiers** — `/admin` → pick a product/variant → type 3 USD sale prices separated by commas, for example `0.65,0.69,0.65` (meaning 1-49 pcs = $0.65, 50-499 pcs = $0.69, 500+ pcs = $0.65). Suitable for every kind of variant, including those not linked to the Supplier API.

**2. 📊 Set 3-Tier Markup** — specific to variants linked to the Supplier API. Type 3 **markup percentages** separated by commas, for example `10,7,5` (meaning tier 1-49 = cost+10%, 50-499 = cost+7%, 500+ = cost+5%). The price is computed from the CURRENT supplier cost straight away, and the markup is stored permanently to be reused on every subsequent auto-sync — so the sale price follows the supplier's live cost up and down automatically, with no need to retype it whenever the cost changes.

**⚠️ Interaction with the Supplier API auto-sync:** if you set a price via method 1 (🎁 Set Bulk Discount Tiers) on a variant linked to the Supplier API, that price will be **OVERWRITTEN** as soon as the next auto-sync runs (every `SUPPLIER_SYNC_INTERVAL_MINUTES` minutes, or when you click "🔄 Refresh Cost & Stock" manually) — because a sync always recomputes the tiers from a markup% (the `DEFAULT_SUPPLIER_TIER_MARKUP` default in `config.js`, unless one has already been set via method 2 above). This is **deliberate**, not a bug — the aim is that Supplier API variant prices always track the latest cost and never go stale or start losing money when the cost rises.

If you genuinely want particular tier prices **not** to follow auto-sync (a short-term promotional price, say), press the **🔒 Lock Manual Price** button on the "🎁 Set Bulk Discount Tiers" screen after setting the price. While it is locked:
- The price tiers (1-49/50-499/500+) are guaranteed **not** to be recomputed by auto-sync or a manual refresh.
- The cost (`supplierCost`) and **stock** of the variant are still synced as usual — only the sale price tiers are skipped.
- If the supplier cost swings by ≥20% since the previous sync, the admin is still notified (so the margin can be checked by hand), but the message makes clear that the sale price did NOT change because it is locked.
- Press the same button (now **🔓 Unlock Manual Price**) at any time to return to automatic markup mode.

The lock status (🔒/🔓) is always shown on the "🎁 Set Bulk Discount Tiers" screen and marked with `🔒` in the Supplier API sync report, so it is easy to see which variants are locked.

## 🔌 Canboso API (the second supplier)

A SECOND supplier, separate from the Supplier API (AIVerse Hub) above — it works the same way (link a local variant to a remote product, auto-order and auto-forward to the buyer, with the buyer's balance debited only after the API order succeeds), but connects to [Canboso](https://canboso.com) (`CANBOSO_API_KEY` and `CANBOSO_BASE_URL` in `.env`). Canboso's official documentation: https://canboso.com/api/swagger.

Canboso exposes only 2 public endpoints (`GET /api/v2/telegram-buyer/products` and `POST /api/v2/telegram-buyer/purchase`), so the **🔌 Canboso API** menu in `/admin` is more compact than the Supplier API one — there is no Order History, Statistics, or API Check Order ID. Auto-sync of cost and stock **does** exist (see `CANBOSO_SYNC_INTERVAL_SECONDS` below), plus a **🔄 Refresh Price & Stock** button to trigger one manually at any time.

**Auto-sync of cost and stock** — similar to `SUPPLIER_SYNC_INTERVAL_MINUTES` in the Supplier API (AIVerse Hub), but measured in **seconds** via `CANBOSO_SYNC_INTERVAL_SECONDS` in `.env` (default `60`, i.e. every minute). This exists purely to keep the numbers the admin sees in the panel fresh — buyers ALREADY get a live stock check every time they open a product page (cached for 20 seconds, see `supplierCanboso.js`), so it does not have to be set tight. Set `0` to disable it (manual refresh only). Values of 1-9 seconds are raised automatically to a minimum of 10 seconds so Canboso's 429 rate limit is not triggered. If a link breaks or a stock field cannot be read, every admin is notified automatically (with a cooldown, so it does not spam on every sync).

**🔔 Live Stock Notifications to ALL users** — as in the Supplier API (AIVerse Hub) above: as soon as this auto-sync detects that the TOTAL stock of one or more variants has changed, the bot broadcasts "STOCK UPDATED!" plus a Buy Now button to all users. ⚠️ Because `CANBOSO_SYNC_INTERVAL_SECONDS` defaults to just 60 seconds (far tighter than the Supplier API's 10-MINUTE default), this can send notifications far more often if Canboso stock moves frequently — consider raising the interval in `.env` if it feels too frequent.

**Setup via `/admin` → 🔌 Canboso API:**
1. **➕ Link a Product** — pick a local product → pick a variant → pick a product from the Canboso list (fetched live via the API). As with the Supplier API, you immediately get a cost vs sale price comparison plus quick markup buttons **+10% / +20% / +30% / +50%** or **✏️ Custom Price**.
2. **💲 Price** — reset the sale price at any time without unlinking and relinking.
3. **🗑️ Unlink** (with confirmation) — release the variant from Canboso, back to local stock.
4. **🔄 Refresh Price & Stock** — re-fetch the Canboso product list and update the cost and stock of every linked variant at once (the sale price does NOT change automatically — unlike the Supplier API, here you reset it yourself if the cost moves significantly).

**Important note on the wallet:** the balance used for `POST /purchase` is **this Canboso account's wallet balance** (not a buyer's Wallet balance in the bot) — it must be topped up directly on the Canboso side before this feature can be used, exactly like the store balance at AIVerse Hub.

**A note on API auth:** the Canboso API key is sent via 2 headers at once (`Authorization: Bearer <key>` and `X-API-Key: <key>`) in `supplierCanboso.js` so it works whatever convention is used — if Canboso turns out to need a different scheme, adjust it in that one place.

## 🎁 Buy Gift / 💌 Confess Gift (GramJS userbot)

Sending a Telegram Star Gift to any user — including someone who has never pressed `/start` on this bot — is only possible from a real user account over MTProto, not through the Bot API. So this feature uses a separate GramJS **userbot**:

1. Get `USERBOT_API_ID` and `USERBOT_API_HASH` from [my.telegram.org](https://my.telegram.org) → API Development Tools.
2. Run `node userbot-login.js` **once** and follow the prompts (phone number, OTP, 2FA password). It prints a session string — put it in `.env` as `USERBOT_SESSION`.
3. ⚠️ Use a **separate Telegram account** for this, not your main personal one: automated activity can attract Telegram rate limits or flags, and the session string is as sensitive as the account password itself.

Buyers then get **🎁 Buy Gift** (sent on behalf of the store account, no message) and **💌 Confess Gift** (gift plus an anonymous message, with the sender's identity hidden). The gift sale price is the Stars cost × `STARS_TO_USD_RATE` plus `GIFT_MARKUP_PCT`, both overridable live from `/admin` → 🎁 Gift (Userbot) → 💲 Set Gift Pricing without a restart. If a send fails for any reason, the buyer's balance is refunded automatically and every admin is notified.

## Default products

`data/db.json` ships **empty** (`"products": []`) so you start from a clean store. Add your own products via `/admin` → ➕ Add Product, or edit `data/db.json` directly.

## Notes

- All data (balances, products, orders, deposits/topups) is stored in `data/db.json`. Back this file up regularly — see [💾 Auto Backup](#-auto-backup).
- The bot uses `polling`, so it is enough to run `npm start` on a server/VPS that stays on (or use PM2 for auto-restart).
- If the bot is restarted while a topup is still pending (unpaid), it automatically resumes monitoring that QRIS/USDT/TON/Binance payment once it comes back up — nothing is lost.
- Errors are forwarded to every admin over Telegram (rate-limited to once per 10 minutes per error type), so problems do not sit unnoticed in the server log.
