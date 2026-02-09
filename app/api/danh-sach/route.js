import { NextResponse } from 'next/server';

const BASE = 'https://api-onebss.vnpt.vn/web-ecms/tracuu';

/**
 * GET /api/danh-sach?loai=to_ky_thuat | loai=tram_bts&toKyThuat=xxx | loai=olt&toKyThuat=xxx&tramBts=yyy
 * Lấy danh sách Tổ kỹ thuật, Trạm BTS (Vệ tinh), hoặc OLT từ OneBSS (gửi Authorization header).
 */
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

    let url = '';
    if (loai === 'to_ky_thuat') {
      url = `${BASE}/danh_sach_to_ky_thuat`;
    } else if (loai === 'ttvt') {
      url = `${BASE}/danh_sach_ttvt`;
    } else if (loai === 'tram_bts' || loai === 've_tinh') {
      url = toKyThuat ? `${BASE}/danh_sach_tram_bts?toKyThuat=${encodeURIComponent(toKyThuat)}` : `${BASE}/danh_sach_tram_bts`;
    } else if (loai === 'card_olt') {
      const p = new URLSearchParams();
      if (toKyThuat) p.set('toKyThuat', toKyThuat);
      if (tramBts) p.set('tramBts', tramBts);
      url = `${BASE}/danh_sach_card_olt${p.toString() ? '?' + p.toString() : ''}`;
    } else if (loai === 'olt') {
      const params = new URLSearchParams();
      if (toKyThuat) params.set('toKyThuat', toKyThuat);
      if (tramBts) params.set('tramBts', tramBts);
      url = `${BASE}/danh_sach_olt${params.toString() ? '?' + params.toString() : ''}`;
    } else {
      return NextResponse.json({ message: 'loai không hợp lệ' }, { status: 400 });
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { message: data.message || data.error || 'API lỗi' },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
