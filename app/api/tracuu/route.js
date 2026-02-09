import { NextResponse } from 'next/server';
import { getStoredAuth } from '../../../lib/auth-store';

/** URL mặc định API tra cứu splitter theo port OLT - OneBSS VNPT */
const DEFAULT_BACKEND_URL = 'https://api-onebss.vnpt.vn/web-ecms/tracuu/ds_splitter_theo_port_olt';

/**
 * API tra cứu SP2.
 * Gọi API OneBSS (URL mặc định cứng). Chỉ cần gửi Authorization (header hoặc body).
 * Request body: { ttvt?, veTinh?, cardOlt?, toQL?, thietBiOlt?, portOlt? } hoặc { toKyThuat?, olt?, slot?, port? }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      ttvt, veTinh, cardOlt, toQL, thietBiOlt, portOlt,
      toKyThuat, olt, slot, port,
    } = body;

    const num = (v) => (v === '' || v == null) ? undefined : (Number(v) || undefined);
    const str = (v) => (v === '' || v == null) ? undefined : String(v);
    // OneBSS ds_splitter_theo_port_olt nhận payload: ttvt_id, tokt_id, tramtb_id, olt_id, cardolt_id, lst_port_vl_id, dia_chi?, ky_hieu?
    const payloadRaw = {
      ttvt_id: body.ttvt_id ?? num(body.ttvt_id) ?? (body.ttvt && String(body.ttvt).includes('Nho Quan') ? 301431 : undefined),
      tokt_id: num(toQL ?? toKyThuat ?? body.toQL ?? body.toKyThuat),
      tramtb_id: num(veTinh ?? body.veTinh),
      olt_id: num(thietBiOlt ?? olt ?? body.thietBiOlt ?? body.olt),
      cardolt_id: str(cardOlt ?? body.cardOlt),
      lst_port_vl_id: str(portOlt ?? port ?? body.portOlt ?? body.port),
      dia_chi: body.dia_chi !== undefined ? body.dia_chi : null,
      ky_hieu: body.ky_hieu !== undefined ? body.ky_hieu : null,
    };
    const payload = Object.fromEntries(Object.entries(payloadRaw).filter(([, v]) => v !== undefined));

    const backendUrl = process.env.BACKEND_URL || process.env.TRACUU_BACKEND_URL || body.backendUrl || DEFAULT_BACKEND_URL;
    const authFromHeader = (request.headers.get('Authorization') || request.headers.get('authorization') || '').trim();
    const authRedis = await getStoredAuth();
    const authorization = authFromHeader || body.authorization || process.env.ONE_BSS_AUTHORIZATION || process.env.AUTHORIZATION || process.env.TRACUU_AUTHORIZATION || authRedis || '';

    const url = backendUrl.startsWith('http') ? backendUrl : DEFAULT_BACKEND_URL;
    console.log('[TracuuSP2 API tracuu] Request', { url, payload: Object.keys(payload), hasAuth: !!authorization });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    let list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? data?.danhSach);
    if (!Array.isArray(list)) list = [];
    // Chỉ lấy Splitter cấp 2: Cap_Sp = 2 (chấp nhận CAP_SP, cap_sp, kiểu số hoặc chuỗi)
    const isCap2 = (item) => {
      const cap = item?.CAP_SP ?? item?.cap_sp ?? item?.Cap_Sp;
      if (cap === undefined || cap === null) return false;
      return cap === 2 || cap === '2' || Number(cap) === 2 || String(cap).trim() === '2';
    };
    let listCap2 = list.filter(isCap2);
    // Nếu lọc ra 0 nhưng có dữ liệu gốc → trả hết (có thể OneBSS đặt tên field khác), frontend vẫn ưu tiên hiển thị
    if (listCap2.length === 0 && list.length > 0) {
      listCap2 = list;
      console.log('[TracuuSP2 API tracuu] listCap2=0, trả full list; sample keys:', Object.keys(list[0] || {}));
    }
    const bodySample = JSON.stringify(data).slice(0, 500);
    console.log('[TracuuSP2 API tracuu] Response', { status: res.status, ok: res.ok, listLength: list.length, listCap2Length: listCap2.length, bodySample });
    if (!res.ok) {
      return NextResponse.json(
        { message: data.message || data.error || 'API lỗi' },
        { status: res.status }
      );
    }
    return NextResponse.json(Array.isArray(data) ? listCap2 : { ...data, data: listCap2 });
  } catch (err) {
    console.log('[TracuuSP2 API tracuu] Exception', err?.message, err);
    return NextResponse.json(
      { message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
