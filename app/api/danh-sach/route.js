import { NextResponse } from 'next/server';
import { getStoredAuth } from '../../../lib/auth-store';

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

  // Port OLT: OneBSS layDsPortOltTheoCardOlt — body { id: number } = Card OLT id đã chọn
  if (loai === 'port_olt') {
    const url = process.env.URL_PORT_OLT_THEO_CARD_OLT || URL_PORT_OLT_THEO_CARD_OLT;
    const idNum = cardOlt === '' || cardOlt == null ? null : Number(cardOlt);
    const body = idNum !== null && !Number.isNaN(idNum) ? { id: idNum } : {};
    log('layDsPortOltTheoCardOlt POST', url, body);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await res.clone().text().catch(() => '');
    if (res.ok) log('PortOlt POST OK', res.status);
    else log('PortOlt POST FAIL', res.status, txt?.slice(0, 300));
    return res;
  }

  // Card OLT: OneBSS layDsCardOltTheoOlt — body { id: number } = THIETBI_ID (Thiết bị OLT đã chọn)
  if (loai === 'card_olt') {
    const url = process.env.URL_CARD_OLT_THEO_OLT || URL_CARD_OLT_THEO_OLT;
    const idNum = olt === '' || olt == null ? null : Number(olt);
    const body = idNum !== null && !Number.isNaN(idNum) ? { id: idNum } : {};
    log('layDsCardOltTheoOlt POST', url, body);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await res.clone().text().catch(() => '');
    if (res.ok) log('CardOlt POST OK', res.status);
    else log('CardOlt POST FAIL', res.status, txt?.slice(0, 300));
    return res;
  }

  // OLT: OneBSS layDsOltTheoVeTinh — body { id: number } = DONVI_ID của Vệ tinh đã chọn
  if (loai === 'olt') {
    const url = process.env.URL_OLT_THEO_VE_TINH || URL_OLT_THEO_VE_TINH;
    const idNum = tramBts === '' || tramBts == null ? null : Number(tramBts);
    const body = idNum !== null && !Number.isNaN(idNum) ? { id: idNum } : {};
    log('layDsOltTheoVeTinh POST', url, body);
    let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await res.clone().text().catch(() => '');
    if (res.ok) log('OLT POST OK', res.status);
    else log('OLT POST FAIL', res.status, txt?.slice(0, 300));
    return res;
  }

  // Tổ QL (to_ky_thuat): 2 tổ kỹ thuật, layDsVeTinh cần body { id: số } (donviId)
  if (loai === 'to_ky_thuat') {
    const fixedToQL = [
      { id: 'd4febad9-f7b4-41a4-85ab-1e8fc1fd754a', donviId: 1002688, ten: 'Tổ Kỹ thuật Địa bàn Gia Viễn' },
      { id: '5f0ad13b-53ee-4869-a66f-4023cba821a7', donviId: 1002689, ten: 'Tổ Kỹ thuật Địa bàn Nho Quan' },
    ];
    log('to_ky_thuat fixed', fixedToQL.length);
    return new Response(JSON.stringify(fixedToQL), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Vệ tinh (tram_bts): OneBSS layDsVeTinh nhận body { id: number } (donviId tổ KT)
  if (loai === 'tram_bts') {
    const url = process.env.URL_LAY_DS_VE_TINH || URL_LAY_DS_VE_TINH;
    const idNum = toKyThuat === '' || toKyThuat == null ? null : Number(toKyThuat);
    const body = idNum !== null && !Number.isNaN(idNum) ? { id: idNum } : {};
    log('layDsVeTinh POST', url, body);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const txt = await res.clone().text().catch(() => '');
    if (res.ok) log('layDsVeTinh POST OK', res.status);
    else log('layDsVeTinh POST FAIL', res.status, txt?.slice(0, 300));
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

    // Token: client gửi → env → Redis (quản trị đổi token trên web)
    const authHeader = (request.headers.get('Authorization') || request.headers.get('authorization') || '').trim();
    const authEnv = process.env.ONE_BSS_AUTHORIZATION || process.env.AUTHORIZATION || '';
    const authRedis = await getStoredAuth();
    const auth = authHeader || authEnv || authRedis || '';

    if (!loai) {
      return NextResponse.json({ message: 'Thiếu loai' }, { status: 400 });
    }
    if (!auth) {
      return NextResponse.json(
        { message: 'Thiếu Authorization. Nhập token trong Cài đặt hoặc nhờ quản trị cấu hình ONE_BSS_AUTHORIZATION trên server.' },
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
    // OneBSS trả success khi error === "200" hoặc 200 (số), data trong data.data
    const okError = data?.error === '200' || data?.error === 200;
    if (data && data.error !== undefined && !okError) {
      log('OneBSS lỗi', { loai: loaiKey, error: data.error, message: data.message });
      return NextResponse.json(
        { message: data.message || data.message_detail || 'Lỗi OneBSS' },
        { status: 400 }
      );
    }
    // Chuẩn hóa list: OneBSS Vệ tinh trả data[], mỗi item có DONVI_ID, TEN_DV
    let list = Array.isArray(data) ? data : null;
    if (!list && data && typeof data === 'object') {
      if (loaiKey === 'to_ky_thuat') {
        list = data.listToKyThuat ?? data.toKyThuat ?? data.danhSachToKyThuat ?? data.data ?? data.result ?? data.list ?? data.danhSach;
      } else if (loaiKey === 'tram_bts') {
        list = data.listVeTinh ?? data.veTinh ?? data.danhSachVeTinh ?? data.tramBts ?? data.data ?? data.result ?? data.list ?? data.danhSach;
      } else if (loaiKey === 'olt') {
        list = data.listOlt ?? data.olt ?? data.danhSachOlt ?? data.data ?? data.result ?? data.list ?? data.danhSach;
      } else if (loaiKey === 'card_olt') {
        list = data.listCardOlt ?? data.listCard ?? data.cardOlt ?? data.danhSachCardOlt ?? data.data ?? data.result ?? data.list ?? data.danhSach;
      } else {
        list = data.data ?? data.result ?? data.list ?? data.listOlt ?? data.olt ?? data.listToKyThuat ?? data.toKyThuat ?? data.listVeTinh ?? data.veTinh ?? data.danhSach;
      }
    }
    if (!Array.isArray(list)) list = [];
    log('Kết quả OK', { loai: loaiKey, dataKeys: Object.keys(data || {}), listLength: list.length, dataSample: JSON.stringify(data).slice(0, 400) });
    return NextResponse.json(Array.isArray(data) ? data : { data: list });
  } catch (err) {
    log('Exception', err?.message, err);
    return NextResponse.json(
      { message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
