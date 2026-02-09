import { NextResponse } from 'next/server';

const BASE_ECMS = 'https://api-onebss.vnpt.vn/web-ecms';
const URL_TRACUU = BASE_ECMS + '/tracuu/ds_splitter_theo_port_olt';
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

  // Các loại khác (ttvt, to_ky_thuat, tram_bts): gọi URL tra cứu với ?loai=...
  const url = process.env.BACKEND_URL || process.env.TRACUU_BACKEND_URL || URL_TRACUU;
  const q = new URLSearchParams();
  q.set('loai', loai);
  if (toKyThuat) q.set('toKyThuat', toKyThuat);
  if (tramBts) q.set('tramBts', tramBts);
  const query = q.toString();
  const body = { loai, toKyThuat: toKyThuat || undefined, tramBts: tramBts || undefined };

  const urlGet = `${url}?${query}`;
  log('GET url', urlGet);
  let res = await fetch(urlGet, { method: 'GET', headers: { Authorization: auth } });
  const txtGet = await res.clone().text().catch(() => '');
  if (res.ok) {
    log('GET OK', res.status, 'body length', txtGet?.length, 'body sample', txtGet?.slice(0, 500));
    return res;
  }
  log('GET FAIL', res.status, 'body', txtGet?.slice(0, 500));

  log('POST url', url, 'body', JSON.stringify(body));
  res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const txtPost = await res.clone().text().catch(() => '');
  if (res.ok) {
    log('POST OK', res.status, 'body length', txtPost?.length, 'body sample', txtPost?.slice(0, 500));
    return res;
  }
  log('POST FAIL', res.status, 'body', txtPost?.slice(0, 500));

  return res;
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
