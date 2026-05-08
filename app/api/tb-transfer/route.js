import { NextResponse } from 'next/server';
import { tbServerConfigured, tbServerGetTransferHistory, tbServerAppendTransferBatch } from '../../../lib/tb-server-cache';

export async function GET() {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', batches: [] }, { status: 503 });
    }
    const res = await tbServerGetTransferHistory();
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: res.message || 'Lỗi đọc lịch sử chuyển.', batches: [] }, { status: 500 });
    }
    return NextResponse.json({ ok: true, batches: Array.isArray(res.batches) ? res.batches : [] });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.', batches: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.' }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const batch = body?.batch && typeof body.batch === 'object' ? body.batch : null;
    if (!batch) {
      return NextResponse.json({ ok: false, message: 'Thiếu batch.' }, { status: 400 });
    }
    const saved = await tbServerAppendTransferBatch(batch);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, message: saved.message || 'Không lưu được lịch sử chuyển.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}
