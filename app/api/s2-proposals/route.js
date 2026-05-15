import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertAdminUnlockCookie, adminUnlockCookieName } from '../../../lib/admin-unlock-cookie';
import { s2ProposalAdd, s2ProposalConfigured, s2ProposalDeleteById, s2ProposalList } from '../../../lib/s2-proposal-store';

export async function GET() {
  try {
    if (!(await s2ProposalConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', rows: [] }, { status: 503 });
    }
    const res = await s2ProposalList();
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: res.message, rows: [] }, { status: 500 });
    }
    return NextResponse.json({ ok: true, rows: res.rows ?? [] });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.', rows: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await s2ProposalConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.' }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const tenSp2 = String(body?.tenSp2 || '').trim();
    const tenNvDiaBan = String(body?.tenNvDiaBan || '').trim();
    const deXuat = String(body?.deXuat || '').trim();
    let diaChi = String(body?.diaChi || '').trim();
    const toaDo = String(body?.toaDo || '').trim();
    const latitude = body?.latitude == null || body?.latitude === '' ? null : Number(body.latitude);
    const longitude = body?.longitude == null || body?.longitude === '' ? null : Number(body.longitude);

    if (!tenSp2) {
      return NextResponse.json({ ok: false, message: 'Thiếu tên Splitter cấp 2.' }, { status: 400 });
    }
    if (!tenNvDiaBan) {
      return NextResponse.json({ ok: false, message: 'Vui lòng chọn Tên NV địa bàn.' }, { status: 400 });
    }
    if (!deXuat) {
      return NextResponse.json({ ok: false, message: 'Vui lòng nhập nội dung đề xuất.' }, { status: 400 });
    }
    if (!toaDo && (latitude == null || Number.isNaN(latitude) || longitude == null || Number.isNaN(longitude))) {
      return NextResponse.json({ ok: false, message: 'Không có tọa độ GPS. Cho phép truy cập vị trí khi lưu.' }, { status: 400 });
    }

    const saved = await s2ProposalAdd({
      tenSp2,
      tenNvDiaBan,
      deXuat,
      diaChi,
      toaDo: toaDo || `${latitude}, ${longitude}`,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    });
    if (!saved.ok) {
      return NextResponse.json({ ok: false, message: saved.message || 'Không lưu được.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, row: saved.row });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!(await s2ProposalConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.' }, { status: 503 });
    }
    const cookieStore = await cookies();
    const unlock = assertAdminUnlockCookie(cookieStore.get(adminUnlockCookieName())?.value);
    if (!unlock.ok) {
      return NextResponse.json({ ok: false, message: unlock.message }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || new URL(request.url).searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ ok: false, message: 'Thiếu id đề xuất.' }, { status: 400 });
    }
    const res = await s2ProposalDeleteById(id);
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: res.message || 'Không xóa được.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}
