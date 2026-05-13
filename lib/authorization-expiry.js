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
