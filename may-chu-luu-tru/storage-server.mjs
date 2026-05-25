/**
 * May chu luu tru don gian — chi can Node.js, khong can XAMPP/PHP.
 * POST http://localhost:3920/api  (cung API nhu api.php)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.STORAGE_PORT || 3920);
const ROOT = path.join(__dirname, '_storage');
const CONFIG_DIR = path.join(ROOT, 'config');
const CACHE_DIR = path.join(ROOT, 'cache');
const KEY_FILE = path.join(__dirname, 'storage-key.txt');

for (const d of [ROOT, CONFIG_DIR, CACHE_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

function loadKey() {
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  const key = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(KEY_FILE, key, 'utf8');
  return key;
}

const API_KEY = loadKey();

function safeName(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex') + '.json';
}

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
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
    if (!doc?.cache_key) continue;
    if (prefix && !String(doc.cache_key).startsWith(prefix)) continue;
    out.push(doc);
  }
  out.sort((a, b) => String(a.cache_key).localeCompare(String(b.cache_key)));
  return out;
}

function isSp2Key(key) {
  if (!key || key.startsWith('tb_subscriber_v1|') || key.startsWith('tb_transfer_history_v1|')) return false;
  if (key.startsWith('tb_excel_shared_rows_v1')) return false;
  const parts = key.split('|');
  return parts.length === 5 && parts.every((p) => String(p).trim() !== '');
}

function handle(body) {
  const action = body?.action || '';
  switch (action) {
    case 'ping':
      return { ok: true, message: 'storage ok' };
    case 'config_get': {
      const key = String(body.key || '').trim();
      const doc = readJson(path.join(CONFIG_DIR, safeName(key)));
      return { ok: true, value: doc?.value ?? null };
    }
    case 'config_set': {
      const key = String(body.key || '').trim();
      writeJson(path.join(CONFIG_DIR, safeName(key)), { key, value: body.value ?? '' });
      return { ok: true };
    }
    case 'config_delete': {
      const key = String(body.key || '').trim();
      const p = path.join(CONFIG_DIR, safeName(key));
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return { ok: true };
    }
    case 'cache_get': {
      const ck = String(body.cache_key || '').trim();
      return { ok: true, row: readJson(path.join(CACHE_DIR, safeName(ck))) };
    }
    case 'cache_upsert': {
      for (const row of body.rows || []) {
        if (!row?.cache_key) continue;
        writeJson(path.join(CACHE_DIR, safeName(row.cache_key)), {
          cache_key: row.cache_key,
          data: row.data ?? null,
          updated_at: row.updated_at || new Date().toISOString(),
        });
      }
      return { ok: true };
    }
    case 'cache_delete_eq': {
      const p = path.join(CACHE_DIR, safeName(String(body.cache_key || '').trim()));
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return { ok: true };
    }
    case 'cache_delete_like': {
      for (const doc of listCache(String(body.prefix || ''))) {
        const p = path.join(CACHE_DIR, safeName(doc.cache_key));
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      return { ok: true };
    }
    case 'cache_delete_sp2_only': {
      for (const doc of listCache(null)) {
        const ck = doc.cache_key;
        if (ck.startsWith('tb_subscriber_v1|') || ck.startsWith('tb_transfer_history_v1|')) continue;
        const p = path.join(CACHE_DIR, safeName(ck));
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      return { ok: true };
    }
    case 'cache_list': {
      const prefix = body.prefix ? String(body.prefix) : null;
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(2000, Math.max(1, Number(body.limit) || 1000));
      const slice = listCache(prefix).slice(offset, offset + limit);
      return {
        ok: true,
        rows: slice.map((d) => ({
          cache_key: d.cache_key,
          data: d.data ?? null,
          updated_at: d.updated_at ?? null,
        })),
      };
    }
    default:
      return { ok: false, error: `action khong hop le: ${action}` };
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && (req.url === '/api' || req.url === '/api.php')) {
    const provided = req.headers['x-storage-key'] || '';
    if (provided !== API_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Sai khoa API' }));
      return;
    }
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'JSON khong hop le' }));
        return;
      }
      try {
        const out = handle(body);
        const code = out.ok === false ? 400 : 200;
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e?.message || 'loi' }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end('May chu luu tru — dung POST /api');
});

function readPublicUrl() {
  if (process.env.STORAGE_PUBLIC_URL) return process.env.STORAGE_PUBLIC_URL.trim();
  const f = path.join(__dirname, 'public-url.txt');
  if (fs.existsSync(f)) {
    const line = fs.readFileSync(f, 'utf8').trim();
    if (line.match(/^https?:\/\//i)) return line.replace(/\/$/, '');
  }
  return `http://localhost:${PORT}`;
}

server.listen(PORT, () => {
  const publicUrl = readPublicUrl();
  const vercelFile = path.join(__dirname, 'VERCEL-NGROK-COPY.txt');
  const apiUrl = `${publicUrl.replace(/\/$/, '')}/api`;
  fs.writeFileSync(
    vercelFile,
    `=== COPY LEN VERCEL ===\n\nSTORAGE_API_URL=${apiUrl}\nSTORAGE_API_KEY=${API_KEY}\n\nMay chu: giu cua so nay mo. Du lieu: ${ROOT}\n`,
    'utf8'
  );
  console.log('');
  console.log('May chu luu tru dang chay.');
  console.log(`  Noi bo:  http://localhost:${PORT}/api`);
  console.log(`  Khoa:    ${API_KEY}`);
  console.log(`  File Vercel: ${vercelFile}`);
  console.log('');
  console.log('De Vercel goi duoc: chay ngrok http', PORT, '(hoac Cloudflare Tunnel co dinh).');
  console.log('Sua STORAGE_PUBLIC_URL trong bat roi chay lai neu can.');
  console.log('');
});
