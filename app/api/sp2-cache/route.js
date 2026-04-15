import { NextResponse } from 'next/server';
import {
  sp2ServerConfigured,
  sp2ServerGetPort,
  sp2ServerGetMeta,
  sp2ServerSetMeta,
  sp2ServerTruncate,
  sp2ServerUpsertBatch,
  sp2ServerGetBrowseSnapshot,
  sp2ServerSetBrowseSnapshot,
  sp2ServerGetPonOneSp2StatsByToQL,
} from '../../../lib/sp2-server-cache';
import { sp2CacheKey } from '../../../lib/sp2-cache-key';

function adminPasswordOk(password) {
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.AUTH_PASSWORD || '';
  return adminPassword && password === adminPassword;
}

/** GET: ?toQL=&veTinh=&thietBiOlt=&cardOlt=&portOlt= → đọc cache chung; ?meta=1 → meta đồng bộ */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('meta') === '1') {
      const { ok, meta } = await sp2ServerGetMeta();
      if (!ok) {
        return NextResponse.json({ ok: false, message: 'Supabase chưa cấu hình.' }, { status: 503 });
      }
      return NextResponse.json({ ok: true, meta });
    }

    if (searchParams.get('browse') === '1') {
      const configured = await sp2ServerConfigured();
      if (!configured) {
        return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', snapshot: null }, { status: 503 });
      }
      const { ok, snapshot } = await sp2ServerGetBrowseSnapshot();
      if (!ok) {
        return NextResponse.json({ ok: false, message: 'Lỗi đọc snapshot danh mục.', snapshot: null }, { status: 500 });
      }
      return NextResponse.json({ ok: true, snapshot });
    }

    if (searchParams.get('stats') === '1') {
      const configured = await sp2ServerConfigured();
      if (!configured) {
        return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', rows: [] }, { status: 503 });
      }
      const resStats = await sp2ServerGetPonOneSp2StatsByToQL();
      if (!resStats.ok) {
        return NextResponse.json({ ok: false, message: resStats.message || 'Lỗi đọc thống kê.', rows: [] }, { status: 500 });
      }
      return NextResponse.json({ ok: true, rows: resStats.rows ?? [] });
    }

    const keyBody = {
      toQL: searchParams.get('toQL') || '',
      veTinh: searchParams.get('veTinh') || '',
      thietBiOlt: searchParams.get('thietBiOlt') || '',
      cardOlt: searchParams.get('cardOlt') || '',
      portOlt: searchParams.get('portOlt') || '',
    };
    const cacheKey = sp2CacheKey(keyBody);

    const configured = await sp2ServerConfigured();
    if (!configured) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', hit: false }, { status: 503 });
    }

    const res = await sp2ServerGetPort(cacheKey);
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: res.message, hit: false }, { status: 500 });
    }
    if (!res.hit) {
      return NextResponse.json({ ok: true, hit: false });
    }
    return NextResponse.json({ ok: true, hit: true, data: res.data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err.message || 'Lỗi server', hit: false },
      { status: 500 }
    );
  }
}

/**
 * POST: quản trị — body JSON
 * { password, action: 'clear' | 'batch' | 'meta' | 'set_browse', batch?: [{ key, data }], meta?: object, snapshot?: object }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body.password ?? '';
    const action = body.action ?? '';

    if (!adminPasswordOk(password)) {
      return NextResponse.json(
        { ok: false, message: 'Mật khẩu quản trị không đúng hoặc chưa cấu hình ADMIN_PASSWORD.' },
        { status: 401 }
      );
    }

    if (!(await sp2ServerConfigured())) {
      return NextResponse.json(
        { ok: false, message: 'Chưa cấu hình Supabase (URL + key) trên server.' },
        { status: 503 }
      );
    }

    if (action === 'clear') {
      const r = await sp2ServerTruncate();
      if (!r.ok) {
        return NextResponse.json({ ok: false, message: r.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, message: 'Đã xóa cache port trên server.' });
    }

    if (action === 'batch') {
      const batch = Array.isArray(body.batch) ? body.batch : [];
      if (batch.length === 0) {
        return NextResponse.json({ ok: false, message: 'batch rỗng.' }, { status: 400 });
      }
      const normalized = batch
        .map((item) => ({
          key: typeof item.key === 'string' ? item.key : '',
          data: Array.isArray(item.data) ? item.data : [],
        }))
        .filter((item) => item.key);
      if (normalized.length === 0) {
        return NextResponse.json({ ok: false, message: 'Không có mục hợp lệ trong batch.' }, { status: 400 });
      }
      const r = await sp2ServerUpsertBatch(normalized);
      if (!r.ok) {
        return NextResponse.json({ ok: false, message: r.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, written: normalized.length });
    }

    if (action === 'meta') {
      const ok = await sp2ServerSetMeta(body.meta ?? {});
      if (!ok) {
        return NextResponse.json({ ok: false, message: 'Không lưu được meta.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'set_browse') {
      const snap = body.snapshot;
      if (!snap || typeof snap !== 'object' || snap.v !== 1) {
        return NextResponse.json({ ok: false, message: 'snapshot không hợp lệ (cần v: 1).' }, { status: 400 });
      }
      const ok = await sp2ServerSetBrowseSnapshot(snap);
      if (!ok) {
        return NextResponse.json({ ok: false, message: 'Không lưu được snapshot danh mục.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, message: 'action không hợp lệ.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err.message || 'Lỗi server' }, { status: 500 });
  }
}
