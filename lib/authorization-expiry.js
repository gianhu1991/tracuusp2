/**
 * Đọc claim `exp` (giây UTC) từ JWT trong chuỗi Authorization (Bearer … hoặc raw).
 * @returns {number | null} thời điểm hết hạn theo ms, hoặc null nếu không phải JWT / không có exp
 */
function decodeJwtPayload(authorization) {
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
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function getJwtExpiryMs(authorization) {
  const payload = decodeJwtPayload(authorization);
  const exp = payload?.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

/** Payload JWT OneBSS (client hoặc token lưu server). */
export function getJwtPayload(authorization) {
  return decodeJwtPayload(authorization);
}

function findAddressDeep(obj, depth = 0) {
  if (!obj || depth > 6) return '';
  if (typeof obj === 'string') {
    const s = obj.trim();
    if (s.length >= 10 && /[,，]/.test(s) && /(xã|phường|huyện|tỉnh|thành|xóm|đường|ngõ|ninh bình)/i.test(s)) return s;
    return '';
  }
  if (typeof obj !== 'object') return '';
  for (const [k, v] of Object.entries(obj)) {
    if (/dia.?chi|diachi|address|dc_lap|diachi_lap|noi_cu_tru/i.test(String(k))) {
      const s = String(v ?? '').trim();
      if (s) return s;
    }
  }
  for (const v of Object.values(obj)) {
    const found = findAddressDeep(v, depth + 1);
    if (found) return found;
  }
  return '';
}

/** Địa chỉ / đơn vị từ claim JWT (hiển thị trên báo cáo đề xuất). */
export function getAuthAddressFromJwt(authorization) {
  const p = decodeJwtPayload(authorization);
  if (!p) return '';
  const candidates = [
    p.diaChi,
    p.dia_chi,
    p.DIA_CHI,
    p.address,
    p.Address,
    p.donViTen,
    p.tenDonVi,
    p.TEN_DON_VI,
    p.donvi,
    p.unitName,
    p.tenDV,
    p.TEN_DV,
    p.hoTen,
    p.HO_TEN,
    p.fullName,
    p.name,
    p.userName,
    p.username,
    p.sub,
    p.preferred_username,
  ];
  for (const v of candidates) {
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return findAddressDeep(p);
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
