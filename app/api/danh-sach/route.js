import { NextResponse } from 'next/server';

const BASE_ECMS = 'https://api-onebss.vnpt.vn/web-ecms';
/** Tổ kỹ thuật + Vệ tinh (chọn Tổ QL và Vệ tinh). */
const URL_LAY_DS_VE_TINH = BASE_ECMS + '/danhmuc/layDsVeTinh';
/** Danh sách OLT theo Vệ tinh (danhmuc). */
const URL_OLT_THEO_VE_TINH = BASE_ECMS + '/danhmuc/layDsOltTheoVeTinh';
/** Danh sách Card OLT theo OLT (danhmuc). */
const URL_CARD_OLT_THEO_OLT = BASE_ECMS + '/danhmuc/layDsCardOltTheoOlt';
/** Danh sách Port OLT theo Card OLT (danhmuc). */
const URL_PORT_OLT_THEO_CARD_OLT = BASE_ECMS + '/danhmuc/layDsPortOltTheoCardOlt';

function log(tag, ...args) {
  try { console.log('[TracuuSP2 API danh-sach]', tag, ...args); } catch (_) {}
}

async function callOneBssList({ auth, loai, toKyThuat, tramBts, olt, cardOlt }) {
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  // Port OLT: gọi URL riêng layDsPortOltTheoCardOlt (cần cardOlt)
  if (loai === 'port_olt') {
    const url = process.env.URL_PORT_OLT_THEO_CARD_OLT || URL_PORT_OLT_THEO_CARD_OLT;
    const q = new URLSearchParams();
    if (cardOlt) q.set('cardOlt', cardOlt);
    if (tramBts) q.set('veTinh', tramBts);
    if (tramBts) q.set('tramBts', tramBts);
    if (toKyThuat) q.set('toKyThuat', toKyThuat);
    if (olt) q.set('olt', olt);
    const query = q.toString();
    const body = { cardOlt: cardOlt || undefined, veTinh: tramBts || undefined, tramBts: tramBts || undefined, toKyThuat: toKyThuat || undefined, olt: olt || undefined };
    const urlGet = query ? `${url}?${query}` : url;
    log('PortOlt GET', urlGet);
    let res = await fetch(urlGet, { method: 'GET', headers: { Authorization: auth } });
    const txtGet = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('PortOlt GET OK', res.status, 'body sample', txtGet?.slice(0, 500));
      return res;
    }
    log('PortOlt GET FAIL', res.status, txtGet?.slice(0, 300));
    log('PortOlt POST', url, body);
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txtPost = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('PortOlt POST OK', res.status, txtPost?.slice(0, 500));
      return res;
    }
    log('PortOlt POST FAIL', res.status, txtPost?.slice(0, 300));
    return res;
  }

  // Card OLT: gọi URL riêng layDsCardOltTheoOlt (cần tramBts, có thể cần olt)
  if (loai === 'card_olt') {
    const url = process.env.URL_CARD_OLT_THEO_OLT || URL_CARD_OLT_THEO_OLT;
    const q = new URLSearchParams();
    if (tramBts) q.set('veTinh', tramBts);
    if (tramBts) q.set('tramBts', tramBts);
    if (toKyThuat) q.set('toKyThuat', toKyThuat);
    if (olt) q.set('olt', olt);
    const query = q.toString();
    const body = { veTinh: tramBts || undefined, tramBts: tramBts || undefined, toKyThuat: toKyThuat || undefined, olt: olt || undefined };
    const urlGet = query ? `${url}?${query}` : url;
    log('CardOlt GET', urlGet);
    let res = await fetch(urlGet, { method: 'GET', headers: { Authorization: auth } });
    const txtGet = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('CardOlt GET OK', res.status, 'body sample', txtGet?.slice(0, 500));
      return res;
    }
    log('CardOlt GET FAIL', res.status, txtGet?.slice(0, 300));
    log('CardOlt POST', url, body);
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txtPost = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('CardOlt POST OK', res.status, txtPost?.slice(0, 500));
      return res;
    }
    log('CardOlt POST FAIL', res.status, txtPost?.slice(0, 300));
    return res;
  }

  // OLT: gọi URL riêng layDsOltTheoVeTinh (cần tramBts/veTinh)
  if (loai === 'olt') {
    const url = process.env.URL_OLT_THEO_VE_TINH || URL_OLT_THEO_VE_TINH;
    const q = new URLSearchParams();
    if (tramBts) q.set('veTinh', tramBts);
    if (tramBts) q.set('tramBts', tramBts);
    if (toKyThuat) q.set('toKyThuat', toKyThuat);
    const query = q.toString();
    const body = { veTinh: tramBts || undefined, tramBts: tramBts || undefined, toKyThuat: toKyThuat || undefined };
    const urlGet = query ? `${url}?${query}` : url;
    log('OLT GET', urlGet);
    let res = await fetch(urlGet, { method: 'GET', headers: { Authorization: auth } });
    const txtGet = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('OLT GET OK', res.status, 'body sample', txtGet?.slice(0, 500));
      return res;
    }
    log('OLT GET FAIL', res.status, txtGet?.slice(0, 300));
    log('OLT POST', url, body);
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txtPost = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('OLT POST OK', res.status, txtPost?.slice(0, 500));
      return res;
    }
    log('OLT POST FAIL', res.status, txtPost?.slice(0, 300));
    return res;
  }

  // Tổ QL (to_ky_thuat) và Vệ tinh (tram_bts): gọi layDsVeTinh (không tham số = Tổ QL, có toKyThuat = Vệ tinh)
  if (loai === 'to_ky_thuat' || loai === 'tram_bts') {
    const url = process.env.URL_LAY_DS_VE_TINH || URL_LAY_DS_VE_TINH;
    const q = new URLSearchParams();
    if (toKyThuat) q.set('toKyThuat', toKyThuat);
    if (tramBts) q.set('tramBts', tramBts);
    if (tramBts) q.set('veTinh', tramBts);
    const query = q.toString();
    const body = { toKyThuat: toKyThuat || undefined, tramBts: tramBts || undefined, veTinh: tramBts || undefined };
    const urlGet = query ? `${url}?${query}` : url;
    log('layDsVeTinh GET', urlGet);
    let res = await fetch(urlGet, { method: 'GET', headers: { Authorization: auth } });
    const txtGet = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('layDsVeTinh GET OK', res.status, 'body sample', txtGet?.slice(0, 500));
      return res;
    }
    log('layDsVeTinh GET FAIL', res.status, txtGet?.slice(0, 300));
    log('layDsVeTinh POST', url, body);
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txtPost = await res.clone().text().catch(() => '');
    if (res.ok) {
      log('layDsVeTinh POST OK', res.status, txtPost?.slice(0, 500));
      return res;
    }
    log('layDsVeTinh POST FAIL', res.status, txtPost?.slice(0, 300));
    return res;
  }

  // ttvt: mặc định không gọi API (trung tâm cố định Nho Quan) - trả về danh sách 1 phần tử
  if (loai === 'ttvt') {
    const fixed = [{ ma: 'Trung tâm viễn thông Nho Quan', ten: 'Trung tâm viễn thông Nho Quan' }];
    return new Response(JSON.stringify(fixed), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ message: 'Loại không hỗ trợ' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const loai = searchParams.get('loai');
    const toKyThuat = searchParams.get('toKyThuat') || '';
    const tramBts = searchParams.get('tramBts') || searchParams.get('veTinh') || '';
    const olt = searchParams.get('olt') || searchParams.get('thietBiOlt') || '';
    const cardOlt = searchParams.get('cardOlt') || '';

    const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';

    if (!loai || !auth) {
      return NextResponse.json(
        { message: 'Thiếu loai hoặc Authorization' },
        { status: 400 }
      );
    }

    const validLoai = ['to_ky_thuat', 'ttvt', 'tram_bts', 've_tinh', 'card_olt', 'olt', 'port_olt'];
    const loaiKey = loai === 've_tinh' ? 'tram_bts' : loai;
    if (!validLoai.includes(loaiKey)) {
      return NextResponse.json({ message: 'loai không hợp lệ' }, { status: 400 });
    }

    const res = await callOneBssList({ auth, loai: loaiKey, toKyThuat, tramBts, olt, cardOlt });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      log('Kết quả lỗi', { loai: loaiKey, status: res.status, data });
      return NextResponse.json(
        { message: data.message || data.error || 'API lỗi' },
        { status: res.status }
      );
    }
    const list = Array.isArray(data) ? data : (data?.data ?? data?.result ?? data?.list ?? []);
    log('Kết quả OK', { loai: loaiKey, dataKeys: Object.keys(data), isArray: Array.isArray(data), listLength: Array.isArray(list) ? list.length : '-', dataSample: JSON.stringify(data).slice(0, 400) });
    return NextResponse.json(data);
  } catch (err) {
    log('Exception', err?.message, err);
    return NextResponse.json(
      { message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
