/**
 * OneBSS đôi khi trả HTTP 200 nhưng error khác "200", hoặc HTTP 4xx với message phiên hết hạn.
 * Dùng để thử lại với Authorization lưu trên server khi token gửi từ client đã cũ.
 */
export function oneBssLooksLikeSessionOrAuthError(status, data) {
  const msg = String(data?.message || data?.message_detail || data?.error || '').toLowerCase();
  if (status === 401 || status === 403) return true;
  if (msg.includes('hết hạn') || msg.includes('het han')) return true;
  if (msg.includes('đăng nhập lại') || msg.includes('dang nhap lai')) return true;
  if (msg.includes('phiên') && msg.includes('hết')) return true;
  if (msg.includes('token') && (msg.includes('hết hạn') || msg.includes('invalid') || msg.includes('expired'))) return true;
  if (msg.includes('unauthor') || msg.includes('forbidden')) return true;
  return false;
}

/** OneBSS envelope: error phải là "200" hoặc 200 mới coi là thành công nghiệp vụ. */
export function oneBssEnvelopeOk(data) {
  if (data == null || typeof data !== 'object') return true;
  if (data.error === undefined) return true;
  return data.error === '200' || data.error === 200;
}
