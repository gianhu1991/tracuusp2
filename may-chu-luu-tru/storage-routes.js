/**
 * Route lưu trữ cho app Tra cứu SP2/TB.
 * Dữ liệu lưu trong bộ nhớ + 1 file JSON duy nhất (nhanh, không tạo hàng nghìn file).
 *
 * Thêm vào server.js:
 *   const storageRoutes = require('./storage-routes');
 *   app.use('/storage', storageRoutes);
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const ROOT = path.join(__dirname, '_storage');
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const DATA_FILE = path.join(ROOT, 'data.json');

const KEY_FILE = path.join(__dirname, 'storage-key.txt');
function loadKey() {
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  const key = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(KEY_FILE, key, 'utf8');
  console.log('[storage] Da tao storage-key.txt:', key);
  return key;
}
const API_KEY = loadKey();
console.log('[storage] STORAGE_API_KEY =', API_KEY);
console.log('[storage] Du lieu luu tai:', DATA_FILE);

/* ---- In-memory store ---- */
let db = { config: {}, cache: {} };

function loadDb() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') db = parsed;
    } catch (e) {
      console.error('[storage] Loi doc data.json, dung du lieu trong:', e.message);
    }
  }
  if (!db.config || typeof db.config !== 'object') db.config = {};
  if (!db.cache || typeof db.cache !== 'object') db.cache = {};
}

loadDb();
console.log('[storage] Config keys:', Object.keys(db.config).length, '| Cache keys:', Object.keys(db.cache).length);

let saveTimer = null;
let saving = false;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(flushToDisk, 1000);
}

function flushToDisk() {
  saveTimer = null;
  if (saving) { scheduleSave(); return; }
  saving = true;
  const tmp = DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(db), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error('[storage] Loi ghi data.json:', e.message);
  }
  saving = false;
}

process.on('exit', () => { if (saveTimer) { clearTimeout(saveTimer); flushToDisk(); } });
process.on('SIGINT', () => { if (saveTimer) { clearTimeout(saveTimer); flushToDisk(); } process.exit(0); });
process.on('SIGTERM', () => { if (saveTimer) { clearTimeout(saveTimer); flushToDisk(); } process.exit(0); });

/* ---- Auth middleware ---- */
function checkKey(req, res, next) {
  const provided = req.headers['x-storage-key'] || '';
  if (provided !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Sai khoa API (X-Storage-Key).' });
  }
  next();
}

router.use(checkKey);

/* ---- API ---- */
router.post('/', (req, res) => {
  const body = req.body || {};
  const action = body.action || '';
  try {
    switch (action) {
      case 'ping':
        return res.json({ ok: true, message: 'storage ok', keys: Object.keys(db.cache).length });

      case 'config_get': {
        const key = String(body.key || '').trim();
        if (!key) return res.status(400).json({ ok: false, error: 'Thieu key.' });
        const val = db.config[key];
        return res.json({ ok: true, value: val !== undefined ? val : null });
      }

      case 'config_set': {
        const key = String(body.key || '').trim();
        if (!key) return res.status(400).json({ ok: false, error: 'Thieu key.' });
        db.config[key] = body.value ?? '';
        scheduleSave();
        return res.json({ ok: true });
      }

      case 'config_delete': {
        const key = String(body.key || '').trim();
        if (!key) return res.status(400).json({ ok: false, error: 'Thieu key.' });
        delete db.config[key];
        scheduleSave();
        return res.json({ ok: true });
      }

      case 'cache_get': {
        const ck = String(body.cache_key || '').trim();
        if (!ck) return res.status(400).json({ ok: false, error: 'Thieu cache_key.' });
        const row = db.cache[ck] || null;
        return res.json({ ok: true, row });
      }

      case 'cache_upsert': {
        const rows = body.rows || [];
        if (!Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'rows khong hop le.' });
        for (const row of rows) {
          if (!row || !row.cache_key) continue;
          db.cache[row.cache_key] = {
            cache_key: row.cache_key,
            data: row.data ?? null,
            updated_at: row.updated_at || new Date().toISOString(),
          };
        }
        scheduleSave();
        return res.json({ ok: true });
      }

      case 'cache_delete_eq': {
        const ck = String(body.cache_key || '').trim();
        if (!ck) return res.status(400).json({ ok: false, error: 'Thieu cache_key.' });
        delete db.cache[ck];
        scheduleSave();
        return res.json({ ok: true });
      }

      case 'cache_delete_like': {
        const prefix = String(body.prefix || '');
        for (const k of Object.keys(db.cache)) {
          if (k.startsWith(prefix)) delete db.cache[k];
        }
        scheduleSave();
        return res.json({ ok: true });
      }

      case 'cache_delete_sp2_only': {
        for (const k of Object.keys(db.cache)) {
          if (k.startsWith('tb_subscriber_v1|') || k.startsWith('tb_transfer_history_v1|')) continue;
          delete db.cache[k];
        }
        scheduleSave();
        return res.json({ ok: true });
      }

      case 'cache_list': {
        const prefix = body.prefix ? String(body.prefix) : null;
        const offset = Math.max(0, Number(body.offset) || 0);
        const limit = Math.min(100000, Math.max(1, Number(body.limit) || 1000));
        let keys = Object.keys(db.cache).sort();
        if (prefix) keys = keys.filter((k) => k.startsWith(prefix));
        const slice = keys.slice(offset, offset + limit);
        return res.json({
          ok: true,
          rows: slice.map((k) => ({
            cache_key: db.cache[k].cache_key,
            data: db.cache[k].data ?? null,
            updated_at: db.cache[k].updated_at ?? null,
          })),
        });
      }

      default:
        return res.status(400).json({ ok: false, error: 'action khong hop le: ' + action });
    }
  } catch (e) {
    console.error('[storage] Loi xu ly:', action, e.message);
    return res.status(500).json({ ok: false, error: e.message || 'Loi server.' });
  }
});

module.exports = router;
