// ============================================================
// AUTO BACKUP — zips the project's full source code (except node_modules,
// .npm, and any .zip file - see isZipFile() below)
// ============================================================
// Used by bot.js for the "💾 Auto Backup" feature in /admin: builds a .zip
// containing EVERY project file (code, config, data/db.json, and so on)
// WITHOUT the node_modules and .npm folders, WITHOUT `.env` (see EXCLUDE_FILES
// - excluded because it holds the bot token and API keys), and WITHOUT any
// other .zip file that may have ended up in the project folder — so the file
// stays small (not many MB) and does not balloon on every backup run.
//
// Uses the "archiver" package (pure JS, lightweight, widely used) to build the
// zip. If it is not installed yet, run: npm install
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PROJECT_ROOT = __dirname;
// Destination folder for the temporary .zip before it is sent to Telegram; it
// is deleted again by cleanupBackupFile() once the upload finishes.
const BACKUP_TMP_DIR = path.join(PROJECT_ROOT, 'backup_tmp');

// Folders EXCLUDED from the backup. Deliberately only node_modules and .npm,
// as requested (so the full source code plus data is included and restoring is
// just another `npm install`). .git and backup_tmp are skipped too, so the
// large git history and the zip currently being written do not get zipped in.
// Folders EXCLUDED from the backup. Besides the exact names in
// EXPLICIT_EXCLUDE_DIRS below, ANY folder whose name starts with "backup_" is
// ALSO skipped automatically - see isJunkBackupDir() (PATCH v7).
const EXPLICIT_EXCLUDE_DIRS = new Set(['node_modules', '.npm', '.git', 'backup_tmp']);

// ===== PATCH v7: exclude manual backup folders whatever they are named =====
// Previously EXCLUDE_DIRS was only the 4 exact names above - a manual backup
// folder an admin created before a risky operation (for example
// "backup_manual_before_removing_stars/", holding copies of bot.js/db.js/etc.)
// was NEVER skipped when placed in the project root - so that folder got zipped
// in again on EVERY subsequent auto-backup, forever (not just once), permanently
// inflating the zip by the size of its contents. Now any folder whose name
// starts with "backup_" (other than "backup_tmp", already excluded separately)
// is skipped automatically - so the habit of creating a "backup_manual_..."
// folder before a risky operation is safe again and no longer inflates the
// auto-backup size.
function isJunkBackupDir(name) {
  return name.toLowerCase().startsWith('backup_');
}

function isExcludedDir(name) {
  return EXPLICIT_EXCLUDE_DIRS.has(name) || isJunkBackupDir(name);
}

// A file with a .zip extension is NEVER included in a backup, whatever folder it
// sits in. This matters: if an old backup file (re-downloaded from the Telegram
// group, or a manual backup) is put back into the project folder deliberately or
// by accident, the NEXT backup would zip that old zip into the new one -> the
// size grows on every run (and can even become "a zip inside a zip inside a
// zip" if left alone). Skipping them entirely keeps the backup size consistently
// small.
function isZipFile(name) {
  return name.toLowerCase().endsWith('.zip');
}

// ===== PATCH v6: exclude backup/.bak files from the zip =====
// Previously only .zip files were skipped (see isZipFile() above), but CODE
// backup files (bot.js.bak, bot.js.bak.<timestamp> from update.sh,
// data/db.json.bak, data/db.json.before-fix-*) were NOT skipped - so on every
// auto-backup run that clutter was carried into the zip, and the backup kept
// GROWING each time the admin ran update.sh (one more bot.js.bak.* every time).
// The patterns *.bak, *.bak.*, and *.before-fix-* are now skipped as well, so a
// backup always holds only the ACTIVE source code and its size stays
// consistent.
//
// ===== PATCH v7: fix the .bak regex bug and add the .beforeupdate pattern =====
// The old bug: the regex `/\.bak\.\d+/` only caught the DOT-before-digits form
// ("bot.js.bak.123"), while the .bak names actually produced on this VPS use a
// DASH ("bot.js.bak-1788584382") - so they slipped past the filter and were
// zipped in every time. The regex now accepts a dot OR a dash (`[.\-]`). The
// ".beforeupdate" pattern (for example "data/db.json.beforeupdate") was also
// added, having never been on the list before.
function isJunkBackupFile(name) {
  const n = name.toLowerCase();
  return n.endsWith('.bak')
    || /\.bak[.\-]\d+/.test(n)
    || n.includes('.before-fix-')
    || n.endsWith('.beforeupdate');
}

function isSkippedFile(name) {
  return isZipFile(name) || isJunkBackupFile(name);
}

// Specific files (exact name, case-insensitive) that MUST be skipped from the
// backup even though this bot's auto-backup did not create them — for example a
// full-project source zip an admin deliberately put in this folder for some
// other purpose, which still must not be carried into the next backup. Add more
// file names here if a similar case comes up later.
//
// `.env` MUST be excluded from the auto-backup - it holds the bot token,
// supplier/payment API keys, and other credentials that must not be shipped to
// BACKUP_GROUP_ID every time a backup runs. Restoring still works normally: the
// admin fills in .env by hand on the new server from their own records (a
// password manager and so on), NOT from a backup zip floating around Telegram.
const EXCLUDE_FILES = new Set(['premium-akun-bot-update-full.zip', '.env']);
function isExcludedFile(name) {
  return EXCLUDE_FILES.has(name.toLowerCase());
}

function pad(n) { return String(n).padStart(2, '0'); }

function timestampForFilename(date) {
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    '_' + pad(date.getHours()) + '-' + pad(date.getMinutes()) + '-' + pad(date.getSeconds())
  );
}

// Build a single .zip holding the whole project (except EXCLUDE_DIRS above).
// Resolves with { zipPath, sizeBytes, fileName }.
function createBackupZip() {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(BACKUP_TMP_DIR)) fs.mkdirSync(BACKUP_TMP_DIR, { recursive: true });

      const fileName = `backup-${timestampForFilename(new Date())}.zip`;
      const zipPath = path.join(BACKUP_TMP_DIR, fileName);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve({ zipPath, sizeBytes: archive.pointer(), fileName }));
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') return; // file vanished mid-run - ignore it rather than failing everything
        reject(err);
      });
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      // A manual walk (rather than archive.glob) so excluded folders are never
      // opened or read at all - faster and reliably safe.
      (function addDir(dirAbs, dirRel) {
        const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && isExcludedDir(entry.name)) continue; // see isExcludedDir() above
          const absPath = path.join(dirAbs, entry.name);
          const relPath = dirRel ? `${dirRel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            addDir(absPath, relPath);
          } else if (entry.isFile()) {
            if (isSkippedFile(entry.name)) continue; // see isZipFile()/isJunkBackupFile() above
            if (isExcludedFile(entry.name)) continue; // see the EXCLUDE_FILES comment above
            archive.file(absPath, { name: relPath });
          }
        }
      })(PROJECT_ROOT, '');

      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

// Delete the temporary .zip once it has been sent (best-effort, never throws).
function cleanupBackupFile(zipPath) {
  fs.unlink(zipPath, () => {});
}

module.exports = { createBackupZip, cleanupBackupFile, BACKUP_TMP_DIR };
