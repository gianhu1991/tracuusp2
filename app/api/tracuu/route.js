import { NextResponse } from 'next/server';

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

    const payload = {
      ttvt: ttvt ?? body.ttvt,
      veTinh: veTinh ?? body.veTinh,
      cardOlt: cardOlt ?? body.cardOlt,
      toQL: toQL ?? toKyThuat ?? body.toQL ?? body.toKyThuat,
      thietBiOlt: thietBiOlt ?? olt ?? body.thietBiOlt ?? body.olt,
      portOlt: portOlt ?? port ?? body.portOlt ?? body.port,
    };

    const backendUrl = process.env.BACKEND_URL || process.env.TRACUU_BACKEND_URL || body.backendUrl || DEFAULT_BACKEND_URL;
    const authFromHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const authorization = authFromHeader || body.authorization || process.env.AUTHORIZATION || process.env.TRACUU_AUTHORIZATION || '';

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
    console.log('[TracuuSP2 API tracuu] Response', { status: res.status, ok: res.ok, dataKeys: Object.keys(data || {}), isArray: Array.isArray(data), length: Array.isArray(data) ? data.length : (data?.data?.length ?? '-') });
    if (!res.ok) {
      return NextResponse.json(
        { message: data.message || data.error || 'API lỗi' },
        { status: res.status }
      );
    }
    return NextResponse.json(Array.isArray(data) ? { data } : data);
  } catch (err) {
    console.log('[TracuuSP2 API tracuu] Exception', err?.message, err);
    return NextResponse.json(
      { message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
