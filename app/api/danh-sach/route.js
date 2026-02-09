import { NextResponse } from 'next/server';

const BASE_TRACUU = 'https://api-onebss.vnpt.vn/web-ecms/tracuu';
const BASE_ECMS = 'https://api-onebss.vnpt.vn/web-ecms';

/**
 * Lấy danh sách (TTVT, Tổ QL, Vệ tinh, Card OLT, OLT) từ OneBSS.
 * Thử nhiều base URL và path (GET/POST). Cấu hình LIST_API_BASE nếu OneBSS dùng đường dẫn khác.
 */
function log(tag, ...args) {
  try { console.log('[TracuuSP2 API danh-sach]', tag, ...args); } catch (_) {}
}

async function callOneBssList({ auth, loai, toKyThuat, tramBts }) {
  const listPaths = {
    to_ky_thuat: ['/danh_sach_to_ky_thuat', '/ds_to_ky_thuat', '/to_ky_thuat', '/get_to_ky_thuat', '/danh_sach'],
    ttvt: ['/danh_sach_ttvt', '/ds_ttvt', '/ttvt', '/get_ttvt', '/danh_sach'],
    tram_bts: ['/danh_sach_tram_bts', '/ds_tram_bts', '/ve_tinh', '/get_tram_bts', '/danh_sach'],
    card_olt: ['/danh_sach_card_olt', '/ds_card_olt', '/get_card_olt', '/danh_sach'],
    olt: ['/danh_sach_olt', '/ds_olt', '/get_olt', '/danh_sach'],
  };
  const bases = [
    process.env.LIST_API_BASE || process.env.TRACUU_LIST_BASE,
    BASE_TRACUU,
    `${BASE_ECMS}/tracuu`,
    BASE_ECMS,
  ].filter(Boolean);
  const defaultBase = bases[0] || BASE_TRACUU;

  const q = new URLSearchParams();
  if (toKyThuat) q.set('toKyThuat', toKyThuat);
  if (tramBts) q.set('tramBts', tramBts);
  const query = q.toString();
  const body = { loai, toKyThuat: toKyThuat || undefined, tramBts: tramBts || undefined };

  const list = listPaths[loai] || [`/${loai}`];
  const path = list[0];

  const attempts = [];
  for (const base of bases.length ? bases : [defaultBase]) {
    const B = base.replace(/\/$/, '');
    const urlGet = `${B}${path}${query ? '?' + query : ''}`;
    attempts.push({ method: 'GET', url: urlGet });
    attempts.push({ method: 'POST', url: B + path, body });
  }
  for (let i = 1; i < list.length; i++) {
    const p = list[i];
    if (p === '/danh_sach') {
      attempts.push({ method: 'GET', url: `${defaultBase}${p}?loai=${loai}${query ? '&' + query : ''}` });
      attempts.push({ method: 'POST', url: defaultBase + p, body: { ...body, loai } });
    } else {
      attempts.push({ method: 'GET', url: `${defaultBase}${p}${query ? '?' + query : ''}` });
      attempts.push({ method: 'POST', url: defaultBase + p, body });
    }
  }

  let lastRes = null;
  for (const att of attempts) {
    const { method, url } = att;
    const bodyPayload = att.body !== undefined ? att.body : body;
    log('thu', method, url);
    const opt = method === 'GET'
      ? { method: 'GET', headers: { Authorization: auth } }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(bodyPayload) };
    const res = await fetch(url, opt);
    lastRes = res;
    if (res.ok) {
      log('OK', method, url);
      return res;
    }
    const txt = await res.clone().text().catch(() => '');
    log('FAIL', res.status, url, txt?.slice(0, 300));
  }
  return lastRes;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const loai = searchParams.get('loai');
    const toKyThuat = searchParams.get('toKyThuat') || '';
    const tramBts = searchParams.get('tramBts') || searchParams.get('veTinh') || '';

    const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';

    if (!loai || !auth) {
      return NextResponse.json(
        { message: 'Thiếu loai hoặc Authorization' },
        { status: 400 }
      );
    }

    const validLoai = ['to_ky_thuat', 'ttvt', 'tram_bts', 've_tinh', 'card_olt', 'olt'];
    const loaiKey = loai === 've_tinh' ? 'tram_bts' : loai;
    if (!validLoai.includes(loaiKey)) {
      return NextResponse.json({ message: 'loai không hợp lệ' }, { status: 400 });
    }

    const res = await callOneBssList({ auth, loai: loaiKey, toKyThuat, tramBts });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      log('Kết quả lỗi', { loai: loaiKey, status: res.status, data });
      return NextResponse.json(
        { message: data.message || data.error || 'API lỗi' },
        { status: res.status }
      );
    }
    log('Kết quả OK', { loai: loaiKey, dataKeys: Object.keys(data), isArray: Array.isArray(data) });
    return NextResponse.json(data);
  } catch (err) {
    log('Exception', err?.message, err);
    return NextResponse.json(
      { message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
