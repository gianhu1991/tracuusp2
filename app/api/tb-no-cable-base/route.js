import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStore } from '../../../lib/kv-backend';
import { assertAdminUnlockCookie, adminUnlockCookieName } from '../../../lib/admin-unlock-cookie';

const BASE_KEY = 'tb_no_cable_base_v1';
const PENDING_KEY = 'tb_no_cable_base_pending_v1';

function asText(v) {
  return String(v == null ? '' : v).trim();
}

function uniqNonEmpty(list) {
  const out = [];
  const seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const s = asText(x);
    if (!s) continue;
    const k = s.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export async function GET() {
  try {
    const store = getStore();
    const r = await store.configGet(BASE_KEY);
    if (!r.ok) return NextResponse.json({ ok: false, message: r.error || 'Không đọc được dữ liệu gốc.' }, { status: 500 });
    const payload = r.value && typeof r.value === 'object' ? r.value : null;
    if (!payload) return NextResponse.json({ ok: true, configured: false, fileName: '', uploadedAt: '', count: 0 });
    const maTbList = Array.isArray(payload.maTbList) ? payload.maTbList : [];
    return NextResponse.json({
      ok: true,
      configured: maTbList.length > 0,
      fileName: asText(payload.fileName),
      uploadedAt: asText(payload.uploadedAt),
      count: maTbList.length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const gate = assertAdminUnlockCookie(cookies().get(adminUnlockCookieName())?.value);
    if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const mode = asText(body?.mode).toLowerCase();
    const store = getStore();

    if (mode === 'chunk') {
      const uploadId = asText(body?.uploadId);
      const chunkIndex = Number(body?.chunkIndex ?? -1);
      const totalChunks = Number(body?.totalChunks ?? 0);
      const fileName = asText(body?.fileName);
      const uploadedAt = asText(body?.uploadedAt) || new Date().toISOString();
      const maTbList = uniqNonEmpty(body?.maTbList);

      if (!uploadId || !Number.isFinite(chunkIndex) || chunkIndex < 0 || !Number.isFinite(totalChunks) || totalChunks <= 0) {
        return NextResponse.json({ ok: false, message: 'Chunk không hợp lệ.' }, { status: 400 });
      }
      if (chunkIndex === 0) {
        await store.configSet(PENDING_KEY, { uploadId, fileName, uploadedAt, chunks: {} });
      }

      const pending = await store.configGet(PENDING_KEY);
      const p = pending.ok && pending.value && typeof pending.value === 'object' ? pending.value : null;
      if (!p || asText(p.uploadId) !== uploadId) {
        return NextResponse.json({ ok: false, message: 'Phiên upload không hợp lệ (hết hạn hoặc bị ghi đè).' }, { status: 400 });
      }
      const chunks = p.chunks && typeof p.chunks === 'object' ? p.chunks : {};
      chunks[String(chunkIndex)] = maTbList;
      await store.configSet(PENDING_KEY, { ...p, fileName: fileName || p.fileName, uploadedAt: uploadedAt || p.uploadedAt, chunks });

      if (chunkIndex !== totalChunks - 1) {
        return NextResponse.json({ ok: true, chunkIndex, totalChunks });
      }

      // Finalize
      const all = [];
      for (let i = 0; i < totalChunks; i++) {
        const part = chunks[String(i)];
        if (Array.isArray(part)) all.push(...part);
      }
      const finalList = uniqNonEmpty(all);
      await store.configSet(BASE_KEY, { fileName: fileName || p.fileName, uploadedAt: uploadedAt || p.uploadedAt, maTbList: finalList });
      await store.configSet(PENDING_KEY, { uploadId: '', chunks: {} });
      return NextResponse.json({ ok: true, fileName: fileName || p.fileName, uploadedAt: uploadedAt || p.uploadedAt, count: finalList.length });
    }

    const fileName = asText(body?.fileName);
    const uploadedAt = asText(body?.uploadedAt) || new Date().toISOString();
    const maTbList = uniqNonEmpty(body?.maTbList);
    if (maTbList.length === 0) {
      return NextResponse.json({ ok: false, message: 'File không có MA_TB hợp lệ.' }, { status: 400 });
    }
    await store.configSet(BASE_KEY, { fileName, uploadedAt, maTbList });
    return NextResponse.json({ ok: true, fileName, uploadedAt, count: maTbList.length });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}

