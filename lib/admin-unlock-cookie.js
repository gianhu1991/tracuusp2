import crypto from 'crypto';

/** Cookie httpOnly sau khi nhập đúng UNLOCK_PASSWORD (Cài đặt / Báo cáo / upload TB). */
const COOKIE_NAME = 'tracuu_sp2_admin_unlock';
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function adminUnlockCookieName() {
  return COOKIE_NAME;
}

/** Có bật khóa UI quản trị + upload TB hay không (biến UNLOCK_PASSWORD). */
export function adminUnlockConfigured() {
  return String(process.env.UNLOCK_PASSWORD || '').trim().length > 0;
}

function signingSecret() {
  const explicit = String(process.env.ADMIN_UNLOCK_COOKIE_SECRET || '').trim();
  if (explicit) return explicit;
  const p = String(process.env.UNLOCK_PASSWORD || '').trim();
  if (!p) return '';
  return crypto.createHash('sha256').update(`admin-unlock-v1|${p}`, 'utf8').digest();
}

export function createAdminUnlockToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_MAX_AGE_MS }), 'utf8').toString('base64url');
  const secret = signingSecret();
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminUnlockToken(token) {
  if (!adminUnlockConfigured()) return true;
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const secret = signingSecret();
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

export function assertAdminUnlockCookie(cookieValue) {
  if (!adminUnlockConfigured()) return { ok: true };
  if (!verifyAdminUnlockToken(cookieValue)) {
    return { ok: false, message: 'Cần mở khóa mã quản trị (Cài đặt hoặc form upload TB).' };
  }
  return { ok: true };
}

/** So khớp mật khẩu không lộ độ dài qua so sánh từng byte. */
export function timingSafePasswordMatch(input, expectedPlain) {
  const ha = crypto.createHash('sha256').update(String(input ?? ''), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(expectedPlain ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}
