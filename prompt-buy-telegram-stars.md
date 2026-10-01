# Feature: Buy Telegram Stars — via the Userbot's Stars Balance (official Telegram MTProto)

**Context:** Adding a new feature to an existing Node.js Telegram bot (`bot.js`, `payment.js`, `lang.js`, `db.js`, `userbot.js`). It follows the architecture of the **Buy Gift** feature already running in `userbot.js`.

> **❌ STATUS: THE FEATURE HAS BEEN REMOVED ENTIRELY** (including the TON/Fragment mode that was added afterwards — see `prompt-fragment-ton-auto.md`). All related code in `bot.js`, `db.js`, `userbot.js`, `config.js`, `lang.js` and `backup.js` has been cleaned up, and the files `ton-fragment.js` / `generate-ton-wallet.js` have been deleted from the project. This document is kept ONLY as a historical archive of the specification — do not use it as a blueprint for re-implementation without restarting the specification from scratch.

---

## 0. Notes on Changes to the Specification (MUST READ)

The original specification asked for Stars purchases to be executed through a **TON transaction to the Fragment.com smart contract** (a store TON wallet plus a seed phrase in `.env`). After reviewing the existing code, that approach was **replaced** with one that is safer and more consistent with this bot's architecture. The reasons:

1. **Fragment.com has no official API/SDK** for buying Stars programmatically through a smart contract on behalf of a target username. Building `buildAndSignTx()` for this would mean reverse-engineering Fragment's undocumented on-chain behaviour — if Fragment changed its contract schema, the store's TON funds could be lost with no path to recovery, and there would be no way for us to validate the result.
2. This bot **already has** the "🎁 Buy Gift" feature (see `userbot.js`), which runs through a GramJS userbot account (MTProto, logged in with a real Telegram account) and is proven to work. Telegram has an **official** MTProto method for sending plain Stars straight to another user's balance: `InputInvoiceStarsGift` + `payments.GetPaymentForm` + `payments.SendStarsForm` — exactly the "Gift Stars" feature in the official Telegram app.
3. With this approach, **no TON wallet, seed phrase or Fragment.com access is needed at all**. The Stars cost price comes from the Stars balance of the same userbot account used by the Buy Gift feature (the admin tops it up manually via Settings → Stars on that userbot account, just as today).

Implication for the rest of this document: every reference to "Fragment", "TON", "smart contract" and "seed phrase" in the original plan **no longer applies** and is superseded by the version below.

---

## 1. User Flow (final)

1. The user picks **"⭐ Buy Telegram Stars"** from the main menu → callback `stars:menu`
2. The user picks a preset amount (`stars:preset:<amount>`) or the **"✏️ Custom Amount"** button (`stars:custom` → free text input, pending action `stars_amount`)
3. The user enters the recipient's Telegram username/ID (pending action `stars_target`)
4. The bot shows a summary: number of Stars, target, price (Stars cost price × rate + store markup), and asks for confirmation → `stars:confirm:<token>`
5. After confirmation:
   - Check that the user's wallet balance is enough — if not, show a quick-topup button for exactly the shortfall (the pending action is **not** cleared, so the user can simply tap again after topping up)
   - Check that the userbot account's Stars balance is enough **before** deducting the user's balance — if not, the order is rejected with a clear message and the user's balance is **not** deducted at all
   - Deduct the user's wallet balance
   - Send the Stars via `userbot.sendStarsGiftToUser()` (official MTProto, from the userbot's Stars balance)
   - Success → send a success notification to the user + a notification to the admin
   - Failure → automatically refund the user's balance + send a failure notification to the user + a notification to the admin
   - The admin notification (in both cases) contains: buyer username/ID, number of Stars, target, selling price, order ID, status (+ the error message on failure)

There is no blockchain polling (no longer relevant) — `payments.SendStarsForm` is synchronous: the outcome (success/failure) is known directly from the API response, with no need to wait for an on-chain confirmation.

## 2. The Module That Is Extended — `userbot.js` (not a new `supplierFragmentStars.js` module)

Because the Stars cost price comes from the userbot's own account (not a third-party API), no separate "supplier" module is needed. Two new functions are added directly to `userbot.js`, following the existing `sendGiftToUser()` pattern:

- `getStarsGiftPresets()` — fetch the list of preset Stars amounts from Telegram (`payments.GetStarsGiftOptions`), with a safe fallback to an empty array if the method fails or has a different schema (the caller then falls back to the static presets from `.env`)
- `sendStarsGiftToUser({ targetUsernameOrId, stars })` — resolve the target into an `InputUser`, build an `InputInvoiceStarsGift`, then call `payments.GetPaymentForm` + `payments.SendStarsForm` (paid automatically from the userbot's Stars balance, just like a gift)

The existing `getUserbotStarsBalance()` function is reused for the balance pre-check — **the same single pool of Stars** is shared with the Buy Gift feature, so the "Stars running low" notification (`maybeNotifyLowStars()`) is automatically relevant to both features with no extra changes.

## 3. Changes Per File (final)

| File | Change |
|---|---|
| `config.js` | New env vars: `STARS_MARKUP_PCT`, `STARS_GIFT_MIN`, `STARS_GIFT_MAX`, `STARS_GIFT_PRESETS` |
| `userbot.js` | New functions: `getStarsGiftPresets()`, `sendStarsGiftToUser()` |
| `bot.js` | Main-menu button `⭐ Buy Telegram Stars`; handlers for `stars:menu`, `stars:preset:<n>`, `stars:custom`, `stars:confirm:<token>`; text input handlers for the pending actions `stars_amount` & `stars_target`; functions `starsPriceUsd()`, `starsMenuKeyboard()`, `showStarsConfirmation()`, `executeStarsSend()` |
| `lang.js` | New text keys for the whole flow (menu, ask amount, invalid amount, ask target, invalid target, confirmation summary, success, failure + refund, out of Stars) |
| `db.js` | New array `starsOrders` (auto-migrated in `readDb()`) plus `createStarsOrder()`, `updateStarsOrder()`, `getStarsOrdersByUser()`, `getStarsPricingSettings()` / `setStarsPricingSettings()` (identical to the `giftOrders` / `giftPricing` pattern, but kept separate) |
| `payment.js` | **No changes** — deducting/refunding the balance is handled well enough by the existing `db.updateBalance()` (same as the Buy Gift flow); no separate lock function is needed because the `pendingOrderConfirms` lock in `bot.js` already covers it (see section 6) |

## 4. New ENV Vars (final)

```
STARS_MARKUP_PCT=20          # markup % on top of the Stars cost price, SEPARATE from GIFT_MARKUP_PCT
STARS_GIFT_MIN=50            # minimum number of Stars per order
STARS_GIFT_MAX=1000000       # maximum number of Stars per order
STARS_GIFT_PRESETS=50,100,250,500,1000   # quick-button preset amounts (fallback if the live presets cannot be fetched from Telegram)
```

There is no `TON_WALLET_SEED` / `TON_WALLET_ADDRESS` — they are no longer needed (see section 0). This feature reuses the existing `USERBOT_API_ID` / `USERBOT_API_HASH` / `USERBOT_SESSION` from the Buy Gift feature.

## 5. Pricing Formula (final)

```
costUsd      = stars × STARS_TO_USD_RATE   (the same rate the Gift feature uses; can be overridden via db.settings.starsPricing)
sellingPrice = costUsd × (1 + STARS_MARKUP_PCT / 100)
```

The markup (`STARS_MARKUP_PCT`) is independent of `GIFT_MARKUP_PCT`, as originally requested — it is stored separately in `db.settings.starsPricing` (not `db.settings.giftPricing`), even though the cost price and the delivery mechanism now both come from the userbot's Stars balance.

## 6. Security & Edge Cases (final)

- ~~The seed phrase lives ONLY in the server's own `.env`~~ → **no longer applies**, there is no TON wallet or seed phrase in this feature
- **The userbot's Stars balance is checked** before execution (`getUserbotStarsBalance()`) — if it is short, the order is rejected with a clear message and the user's balance is not deducted
- **Race condition on the user's balance**: double-tapping the confirm button is prevented by an in-memory `Set` called `pendingOrderConfirms`, keyed by `chatId` (exactly the pattern used for normal product orders and Buy Gift) — this stops two order executions running at the same time for the same user
- ~~Timeout while polling the on-chain tx status~~ → **not relevant**, `payments.SendStarsForm` is synchronous (the result comes straight from the response, with no polling)
- **Idempotency**: if the bot restarts exactly while a `pending` order is being processed (between deducting the balance and learning the result of `sendStarsGiftToUser`), that order is not resumed automatically — this is a **limitation inherited from the existing Buy Gift pattern** (not a new regression introduced by this feature). Mitigation: after a restart the admin can check `starsOrders` with status `pending` manually in the DB. If auto-resume is needed, it should be added as a separate improvement for BOTH features (Gift & Stars) at once, since they share the same pattern.
- **Input validation**: the number of Stars is validated against `STARS_GIFT_MIN` / `STARS_GIFT_MAX` before moving on to the target step; the username/ID format is validated (at least 3 characters) before moving on to the pricing step

## 7. Acceptance Criteria

- [x] The user can complete the flow end to end and the Stars arrive in the target account
- [x] The user's balance is deducted only once per successful order (guarded by the `pendingOrderConfirms` lock)
- [x] A failed order → the user's balance is restored in full automatically, with no manual action
- [x] The admin receives a complete notification for every order (success & failure)
- [x] An order cannot be executed if the store's (userbot's) Stars balance is insufficient — and the user's balance is not deducted
- [x] Order history is saved in the DB (`starsOrders`) and can be queried per user (`getStarsOrdersByUser`) or by order ID

## 8. What Is Needed From the Owner

~~A TON wallet address, a seed phrase, Fragment.com KYC access~~ → **no longer needed**. The only prerequisite: a GramJS userbot account (`USERBOT_API_ID` / `USERBOT_API_HASH` / `USERBOT_SESSION`) that is already configured and **has enough Stars** (topped up manually via Settings → Stars in the Telegram app on that account) — exactly the prerequisite that already applies to the current Buy Gift feature.
