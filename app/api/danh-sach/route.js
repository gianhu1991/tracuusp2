import { NextResponse } from 'next/server';

const BASE = 'https://api-onebss.vnpt.vn/web-ecms/tracuu';

/**
 * Lấy danh sách (TTVT, Tổ QL, Vệ tinh, Card OLT, OLT) từ OneBSS.
 * Dữ liệu dropdown bắt buộc lấy từ API, không nhập tay.
 * Thử GET trước, nếu 404 thì thử POST với body.
 */
function log(tag, ...args) {
  try { console.log('[TracuuSP2 API danh-sach]', tag, ...args); } catch (_) {}
}

async function callOneBssList({ auth, loai, toKyThuat, tramBts }) {
  const paths = {
    to_ky_thuat: ['/danh_sach_to_ky_thuat', '/ds_to_ky_thuat', '/to_ky_thuat'],
    ttvt: ['/danh_sach_ttvt', '/ds_ttvt', '/ttvt'],
    tram_bts: ['/danh_sach_tram_bts', '/ds_tram_bts', '/ve_tinh'],
    card_olt: ['/danh_sach_card_olt', '/ds_card_olt'],
    olt: ['/danh_sach_olt', '/ds_olt'],
  };
  const list = paths[loai] || []; const path = list[0] || `/${loai}`;
  const q = new URLSearchParams();
  if (toKyThuat) q.set('toKyThuat', toKyThuat);
  if (tramBts) q.set('tramBts', tramBts);
  const query = q.toString();
  const urlGet = `${BASE}${path}${query ? '?' + query : ''}`;
  const body = { loai, toKyThuat: toKyThuat || undefined, tramBts: tramBts || undefined };

  log('callOneBssList', { loai, toKyThuat, tramBts, urlGet });

  let res = await fetch(urlGet, { method: 'GET', headers: { Authorization: auth } });
  if (res.ok) { log('GET OK', urlGet); return res; }
  const text = await res.clone().text().catch(() => '');
  log('GET FAIL', urlGet, 'status', res.status, 'body', text?.slice(0, 400));

  res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
  if (res.ok) { log('POST OK', BASE + path); return res; }
  const text2 = await res.clone().text().catch(() => '');
  log('POST FAIL', BASE + path, 'status', res.status, 'body', text2?.slice(0, 400));

  for (let i = 1; i < list.length; i++) {
    const u = `${BASE}${list[i]}${query ? '?' + query : ''}`;
    res = await fetch(u, { method: 'GET', headers: { Authorization: auth } });
    if (res.ok) { log('GET alt OK', u); return res; }
    log('GET alt FAIL', u, 'status', res.status);
  }
  return res;
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
