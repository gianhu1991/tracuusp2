import { NextResponse } from 'next/server';
import { tbServerConfigured, tbServerGetRowOkKeys, tbServerMarkRowOk } from '../../../lib/tb-server-cache';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET() {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', keys: [] }, { status: 503, headers: NO_STORE });
    }
    const res = await tbServerGetRowOkKeys();
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: res.message || 'Lỗi đọc trạng thái OK.', keys: [] }, { status: 500, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, keys: Array.isArray(res.keys) ? res.keys : [] }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.', keys: [] }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request) {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.' }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const row = body?.row && typeof body.row === 'object' ? body.row : null;
    if (!row) {
      return NextResponse.json({ ok: false, message: 'Thiếu thông tin dòng thuê bao.' }, { status: 400 });
    }
    const saved = await tbServerMarkRowOk(row);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, message: saved.message || 'Không lưu được trạng thái OK.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, key: saved.key, markedAt: saved.markedAt });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}
