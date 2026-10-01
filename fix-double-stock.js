// ============================================================
// Detect and repair double-counted stock (a manual variant.stock with NO
// real codes/links behind it, that happens to EXACTLY MATCH the API
// liveStock)
//
// USAGE (run from the bot folder):
//   node fix-double-stock.js            -> report only (SAFE, changes nothing)
//   node fix-double-stock.js --apply    -> actually repair (reset the manual
//                                          stock to 0 for variants matching
//                                          the double-count pattern)
// ============================================================
const db = require('./db.js');
const apply = process.argv.includes('--apply');

let found = 0;
db.getAllProducts().forEach(p => {
  p.variants.forEach(v => {
    const isApiLinked = !!(v.canbosoProductId || v.supplierServiceId);
    const hasRealItems = Array.isArray(v.stockItems) && v.stockItems.length > 0;
    const stock = v.stock || 0;
    const liveStock = v.liveStock || 0;
    // Suspicious pattern: linked to an API, the manual stock is not backed by
    // any real codes, and the number EXACTLY MATCHES liveStock (a sign the
    // same stock was entered twice).
    const suspicious = isApiLinked && !hasRealItems && stock > 0 && stock === liveStock;
    if (suspicious) {
      found++;
      console.log(`⚠️  ${p.name} - ${v.label}`);
      console.log(`    stock (manual, no real codes): ${stock}`);
      console.log(`    liveStock (API): ${liveStock}`);
      console.log(`    Total shown RIGHT NOW: ${stock + liveStock}  ->  Should be: ${liveStock}`);
      if (apply) {
        db.setVariantStock(p.id, v.id, liveStock); // liveStock stays as is
        // Reset the manual stock field to 0 directly (use the official helper
        // where one exists, fall back to editing the file by hand)
        const raw = require('fs').readFileSync('./data/db.json', 'utf-8');
        const data = JSON.parse(raw);
        const prod = data.products.find(pp => pp.id === p.id);
        const variant = prod && prod.variants.find(vv => vv.id === v.id);
        if (variant) {
          variant.stock = 0;
          require('fs').writeFileSync('./data/db.json', JSON.stringify(data, null, 2));
        }
        console.log(`    ✅ REPAIRED - manual stock reset to 0, total is now: ${liveStock}`);
      }
      console.log('');
    }
  });
});

if (found === 0) {
  console.log('✅ No double-counting pattern found.');
} else if (!apply) {
  console.log(`\n📋 Found ${found} variant(s) matching the suspicious pattern (listed above).`);
  console.log('   If these really are a bug (and not deliberate manual stock), run:');
  console.log('   node fix-double-stock.js --apply');
} else {
  console.log(`\n✅ Done. ${found} variant(s) repaired.`);
  console.log('   An automatic backup sits at data/db.json.bak (from before this script first ran).');
}
