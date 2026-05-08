import { NextResponse } from 'next/server';
import { tbServerConfigured, tbServerGetSharedRows, tbServerSetSharedRows } from '../../../lib/tb-server-cache';

export async function GET() {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', rows: [] }, { status: 503 });
    }
    const res = await tbServerGetSharedRows();
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: res.message || 'Lỗi đọc dữ liệu dùng chung.', rows: [] }, { status: 500 });
    }
    const payload = res.payload || {};
    return NextResponse.json({
      ok: true,
      fileName: String(payload.fileName || ''),
      uploadedAt: String(payload.uploadedAt || ''),
      rows: Array.isArray(payload.rows) ? payload.rows : [],
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.', rows: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.' }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const fileName = String(body?.fileName || '');
    const saved = await tbServerSetSharedRows({ fileName, rows });
    if (!saved.ok) {
      return NextResponse.json({ ok: false, message: saved.message || 'Không lưu được dữ liệu dùng chung.' }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      fileName: saved.payload?.fileName || '',
      uploadedAt: saved.payload?.uploadedAt || '',
      count: Array.isArray(saved.payload?.rows) ? saved.payload.rows.length : 0,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}
