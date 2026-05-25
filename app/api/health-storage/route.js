import { NextResponse } from 'next/server';
import { storageHealthCheck } from '../../../lib/storage-health';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

/** GET: kiểm tra Vercel → máy chủ lưu trữ. */
export async function GET() {
  try {
    const result = await storageHealthCheck();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: NO_STORE,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi kiểm tra storage.' },
      { status: 500, headers: NO_STORE }
    );
  }
}
