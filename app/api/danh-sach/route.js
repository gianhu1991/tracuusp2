import { NextResponse } from 'next/server';

/** Chỉ có 1 URL: lấy danh sách và tra cứu đều gọi URL này (với tham số khác nhau). */
const URL_DANH_SACH_VA_TRACUU = 'https://api-onebss.vnpt.vn/web-ecms/tracuu/ds_splitter_theo_port_olt';

function log(tag, ...args) {
  try { console.log('[TracuuSP2 API danh-sach]', tag, ...args); } catch (_) {}
}

async function callOneBssList({ auth, loai, toKyThuat, tramBts }) {
  const url = process.env.BACKEND_URL || process.env.TRACUU_BACKEND_URL || URL_DANH_SACH_VA_TRACUU;

  const q = new URLSearchParams();
  q.set('loai', loai);
  if (toKyThuat) q.set('toKyThuat', toKyThuat);
  if (tramBts) q.set('tramBts', tramBts);
  const query = q.toString();
  const body = { loai, toKyThuat: toKyThuat || undefined, tramBts: tramBts || undefined };

  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  // Chỉ gọi đúng URL này: GET với ?loai=... hoặc POST với body { loai, ... }
  log('GET', `${url}?${query}`);
  let res = await fetch(`${url}?${query}`, { method: 'GET', headers: { Authorization: auth } });
  if (res.ok) {
    log('OK GET');
    return res;
  }
  const txt1 = await res.clone().text().catch(() => '');
  log('GET FAIL', res.status, txt1?.slice(0, 200));

  log('POST', url, body);
  res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.ok) {
    log('OK POST');
    return res;
  }
  const txt2 = await res.clone().text().catch(() => '');
  log('POST FAIL', res.status, txt2?.slice(0, 200));

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
