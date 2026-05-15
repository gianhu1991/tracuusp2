/**
 * Đọc claim `exp` (giây UTC) từ JWT trong chuỗi Authorization (Bearer … hoặc raw).
 * @returns {number | null} thời điểm hết hạn theo ms, hoặc null nếu không phải JWT / không có exp
 */
export function getJwtExpiryMs(authorization) {
  const raw = String(authorization || '').trim();
  if (!raw) return null;
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += '='.repeat(pad);
    const json = atob(b64);
    const payload = JSON.parse(json);
    const exp = payload?.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
    return exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Còn dùng được để gọi API (chưa hết hạn theo JWT, hoặc token không phải JWT nhưng có nội dung).
 * @param {string} authorization
 * @param {number} [skewSec] dự phòng trước exp (mặc định 120s)
 */
export function authorizationSeemsUnexpired(authorization, skewSec = 120) {
  const s = String(authorization || '').trim();
  if (!s) return false;
  const expMs = getJwtExpiryMs(s);
  if (expMs == null) {
    return true;
  }
  return expMs > Date.now() + skewSec * 1000;
}

/**
 * Chọn token gọi OneBSS: JWT client còn hạn → client; không thì token server/env còn hạn.
 * Không trả token JWT đã hết hạn (tránh chặn fallback cache trên máy khác).
 */
/** Phản hồi OneBSS / API danh mục giống lỗi phiên hoặc token. */
export function looksLikeAuthError(status, data) {
  const msg = String(data?.message || data?.message_detail || data?.error || '').toLowerCase();
  if (status === 401 || status === 403) return true;
  if (msg.includes('token') && (msg.includes('hợp lệ') || msg.includes('hop le') || msg.includes('invalid') || msg.includes('hết hạn') || msg.includes('het han'))) return true;
  if (msg.includes('phiên') && (msg.includes('hết') || msg.includes('het'))) return true;
  if (msg.includes('unauthor') || msg.includes('forbidden')) return true;
  if (msg.includes('thiếu authorization') || msg.includes('thieu authorization')) return true;
  return false;
}

/** Header gọi OneBSS: không gửi JWT hết hạn để API server dùng token lưu chung. */
export function authHeadersForOneBss(authValue) {
  const trimmed = String(authValue || '').trim();
  return authorizationSeemsUnexpired(trimmed) ? { Authorization: trimmed } : {};
}

export function pickAuthorizationForApi(clientHeader, serverStored, envAuth = '') {
  const client = String(clientHeader || '').trim();
  const stored = String(serverStored || '').trim();
  const env = String(envAuth || '').trim();
  if (client && authorizationSeemsUnexpired(client)) return client;
  if (stored && authorizationSeemsUnexpired(stored)) return stored;
  if (env && authorizationSeemsUnexpired(env)) return env;
  return '';
}
