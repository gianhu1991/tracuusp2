import crypto from 'crypto';

const COOKIE_NAME = 'tb_upload_gate';
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function tbUploadGateCookieName() {
  return COOKIE_NAME;
}

export function tbUploadGateConfigured() {
  return String(process.env.TB_UPLOAD_PASSWORD || '').trim().length > 0;
}

function gateSecret() {
  const explicit = String(process.env.TB_UPLOAD_AUTH_SECRET || '').trim();
  if (explicit) return explicit;
  const p = String(process.env.TB_UPLOAD_PASSWORD || '').trim();
  if (!p) return '';
  return crypto.createHash('sha256').update(`tb-upload-gate-v1|${p}`, 'utf8').digest();
}

export function createTbUploadGateToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_MAX_AGE_MS }), 'utf8').toString('base64url');
  const secret = gateSecret();
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyTbUploadGateToken(token) {
  if (!tbUploadGateConfigured()) return true;
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const secret = gateSecret();
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    const exp = Number(obj?.exp);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function assertTbUploadGateCookie(cookieValue) {
  if (!tbUploadGateConfigured()) return { ok: true };
  if (!verifyTbUploadGateToken(cookieValue)) {
    return { ok: false, message: 'Cần mở khóa upload TB (nhập mật khẩu).' };
  }
  return { ok: true };
}

export function timingSafePasswordMatch(input, expectedPlain) {
  const a = Buffer.from(String(input || ''), 'utf8');
  const b = Buffer.from(String(expectedPlain || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
