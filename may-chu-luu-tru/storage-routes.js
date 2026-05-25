/**
 * Route lưu trữ cho app Tra cứu SP2/TB.
 * Copy file này vào C:\server\ trên máy server.
 * Thêm vào file server chính 2 dòng:
 *   const storageRoutes = require('./storage-routes');
 *   app.use('/storage', storageRoutes);
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const ROOT = path.join(__dirname, '_storage');
const CONFIG_DIR = path.join(ROOT, 'config');
const CACHE_DIR = path.join(ROOT, 'cache');

for (const d of [ROOT, CONFIG_DIR, CACHE_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

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
console.log('[storage] Du lieu luu tai:', ROOT);

function checkKey(req, res, next) {
  const provided = req.headers['x-storage-key'] || '';
  if (provided !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Sai khoa API (X-Storage-Key).' });
  }
  next();
}

function safeName(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex') + '.json';
}

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, data) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, p);
}

function listCache(prefix) {
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    const doc = readJson(path.join(CACHE_DIR, f));
    if (!doc || !doc.cache_key) continue;
    if (prefix && !String(doc.cache_key).startsWith(prefix)) continue;
    out.push(doc);
  }
  out.sort((a, b) => String(a.cache_key).localeCompare(String(b.cache_key)));
  return out;
}

router.use(checkKey);

router.post('/', (req, res) => {
  const body = req.body || {};
  const action = body.action || '';
  try {
    switch (action) {
      case 'ping':
        return res.json({ ok: true, message: 'storage ok' });

      case 'config_get': {
        const key = String(body.key || '').trim();
        if (!key) return res.status(400).json({ ok: false, error: 'Thieu key.' });
        const doc = readJson(path.join(CONFIG_DIR, safeName(key)));
        return res.json({ ok: true, value: doc ? doc.value : null });
      }

      case 'config_set': {
        const key = String(body.key || '').trim();
        if (!key) return res.status(400).json({ ok: false, error: 'Thieu key.' });
        writeJson(path.join(CONFIG_DIR, safeName(key)), { key, value: body.value ?? '' });
        return res.json({ ok: true });
      }

      case 'config_delete': {
        const key = String(body.key || '').trim();
        if (!key) return res.status(400).json({ ok: false, error: 'Thieu key.' });
        const p = path.join(CONFIG_DIR, safeName(key));
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return res.json({ ok: true });
      }

      case 'cache_get': {
        const ck = String(body.cache_key || '').trim();
        if (!ck) return res.status(400).json({ ok: false, error: 'Thieu cache_key.' });
        return res.json({ ok: true, row: readJson(path.join(CACHE_DIR, safeName(ck))) });
      }

      case 'cache_upsert': {
        const rows = body.rows || [];
        if (!Array.isArray(rows)) return res.status(400).json({ ok: false, error: 'rows khong hop le.' });
        for (const row of rows) {
          if (!row || !row.cache_key) continue;
          writeJson(path.join(CACHE_DIR, safeName(row.cache_key)), {
            cache_key: row.cache_key,
            data: row.data ?? null,
            updated_at: row.updated_at || new Date().toISOString(),
          });
        }
        return res.json({ ok: true });
      }

      case 'cache_delete_eq': {
        const ck = String(body.cache_key || '').trim();
        if (!ck) return res.status(400).json({ ok: false, error: 'Thieu cache_key.' });
        const p = path.join(CACHE_DIR, safeName(ck));
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return res.json({ ok: true });
      }

      case 'cache_delete_like': {
        const prefix = String(body.prefix || '');
        for (const doc of listCache(prefix)) {
          const p = path.join(CACHE_DIR, safeName(doc.cache_key));
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        return res.json({ ok: true });
      }

      case 'cache_delete_sp2_only': {
        for (const doc of listCache(null)) {
          const ck = doc.cache_key;
          if (ck.startsWith('tb_subscriber_v1|') || ck.startsWith('tb_transfer_history_v1|')) continue;
          const p = path.join(CACHE_DIR, safeName(ck));
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        return res.json({ ok: true });
      }

      case 'cache_list': {
        const prefix = body.prefix ? String(body.prefix) : null;
        const offset = Math.max(0, Number(body.offset) || 0);
        const limit = Math.min(2000, Math.max(1, Number(body.limit) || 1000));
        const slice = listCache(prefix).slice(offset, offset + limit);
        return res.json({
          ok: true,
          rows: slice.map((d) => ({
            cache_key: d.cache_key,
            data: d.data ?? null,
            updated_at: d.updated_at ?? null,
          })),
        });
      }

      default:
        return res.status(400).json({ ok: false, error: 'action khong hop le: ' + action });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Loi server.' });
  }
});

module.exports = router;
