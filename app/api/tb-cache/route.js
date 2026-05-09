import { NextResponse } from 'next/server';
import {
  tbServerConfigured,
  tbServerGetSharedRows,
  tbServerSetSharedRows,
  tbServerClearSharedChunks,
  tbServerSaveSharedChunk,
  tbServerFinalizeSharedUpload,
} from '../../../lib/tb-server-cache';

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
      partialRecovery: Boolean(payload.partialRecovery),
      emptyReason: typeof payload.emptyReason === 'string' ? payload.emptyReason : '',
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
    const mode = String(body?.mode || '').trim().toLowerCase();
    if (mode === 'chunk') {
      const uploadId = String(body?.uploadId || '').trim();
      const fileName = String(body?.fileName || '').trim();
      const chunkIndex = Number(body?.chunkIndex ?? -1);
      const totalChunks = Number(body?.totalChunks ?? 0);
      const totalCount = Number(body?.totalCount ?? 0);
      const uploadedAt = String(body?.uploadedAt || new Date().toISOString());
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      if (!uploadId || !Number.isFinite(chunkIndex) || chunkIndex < 0 || !Number.isFinite(totalChunks) || totalChunks <= 0) {
        return NextResponse.json({ ok: false, message: 'Chunk không hợp lệ.' }, { status: 400 });
      }
      if (chunkIndex === 0) {
        const cleared = await tbServerClearSharedChunks();
        if (!cleared.ok) return NextResponse.json({ ok: false, message: cleared.message || 'Không dọn dữ liệu cũ.' }, { status: 500 });
      }
      const savedChunk = await tbServerSaveSharedChunk({ uploadId, chunkIndex, rows, uploadedAt });
      if (!savedChunk.ok) {
        return NextResponse.json({ ok: false, message: savedChunk.message || 'Không lưu được chunk.' }, { status: 500 });
      }
      if (chunkIndex === totalChunks - 1) {
        const finalized = await tbServerFinalizeSharedUpload({ uploadId, fileName, totalChunks, totalCount, uploadedAt });
        if (!finalized.ok) {
          return NextResponse.json({ ok: false, message: finalized.message || 'Không chốt được upload.' }, { status: 500 });
        }
        return NextResponse.json({
          ok: true,
          fileName: finalized.payload?.fileName || '',
          uploadedAt: finalized.payload?.uploadedAt || uploadedAt,
          count: Number(finalized.payload?.totalCount || totalCount || 0),
        });
      }
      return NextResponse.json({ ok: true, chunkIndex, totalChunks });
    }

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
