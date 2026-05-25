import { NextResponse } from 'next/server';
import {
  tbServerConfigured,
  tbServerGetTransferHistory,
  tbServerAppendTransferBatch,
  tbServerDeleteTransferRow,
  tbServerConfirmTransferRow,
} from '../../../lib/tb-server-cache';

export async function GET() {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình lưu trữ.', batches: [] }, { status: 503 });
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
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình lưu trữ.' }, { status: 503 });
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

export async function DELETE(request) {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình lưu trữ.' }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const batchId = String(body?.batchId || '');
    const rowIndex = Number(body?.rowIndex ?? -1);
    const deleted = await tbServerDeleteTransferRow({ batchId, rowIndex });
    if (!deleted.ok) {
      return NextResponse.json({ ok: false, message: deleted.message || 'Không xóa được lịch sử chuyển.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!(await tbServerConfigured())) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình lưu trữ.' }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const batchId = String(body?.batchId || '');
    const rowIndex = Number(body?.rowIndex ?? -1);
    const confirmed = await tbServerConfirmTransferRow({ batchId, rowIndex });
    if (!confirmed.ok) {
      return NextResponse.json({ ok: false, message: confirmed.message || 'Không xác nhận được lịch sử chuyển.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}
