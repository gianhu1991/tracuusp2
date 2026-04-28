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
  sp2ServerGetPonOneSp2DetailRows,
  sp2ServerGetPonSp2DetailRowsByOlt,
} from '../../../lib/sp2-server-cache';
import { sp2CacheKey } from '../../../lib/sp2-cache-key';

function adminPasswordOk(password) {
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.AUTH_PASSWORD || '';
  return adminPassword && password === adminPassword;
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function toQlId(item) {
  if (!item || typeof item !== 'object') return '';
  return pickFirst(item.donviId, item.DONVI_ID, item.id, item.ma, item.value, item.code);
}

function tramId(item) {
  if (!item || typeof item !== 'object') return '';
  return pickFirst(item.DONVI_ID, item.donviId, item.id, item.ma, item.value, item.code);
}

function oltId(item) {
  if (!item || typeof item !== 'object') return '';
  return pickFirst(item.THIETBI_ID, item.OLT_ID, item.id, item.ma, item.value, item.code);
}

function cardId(item) {
  if (!item || typeof item !== 'object') return '';
  const keyVal = typeof item.KEY === 'string' ? item.KEY : '';
  const fromKey = keyVal.includes('#') ? keyVal.split('#')[1]?.trim() || '' : '';
  return pickFirst(fromKey, item.CARD_ID, item.THIETBI_ID, item.SLOT_ID, item.PORTVL_ID, item.VITRI, item.id, item.ma, item.value, item.code);
}

function portId(item) {
  if (!item || typeof item !== 'object') return '';
  return pickFirst(item.PORTVL_ID, item.VITRI, item.id, item.value, item.code);
}

function toQlName(item, fallback = '') {
  if (!item || typeof item !== 'object') return fallback;
  return pickFirst(item.ten, item.TEN_DV, item.name, item.label, item.title, fallback);
}

function tramName(item, fallback = '') {
  if (!item || typeof item !== 'object') return fallback;
  return pickFirst(item.TEN_DV, item.ten, item.name, item.label, item.title, fallback);
}

function oltName(item, fallback = '') {
  if (!item || typeof item !== 'object') return fallback;
  return pickFirst(item.TEN_OLT, item.TEN_TB, item.ten, item.name, item.label, item.title, fallback);
}

function cardName(item, fallback = '') {
  if (!item || typeof item !== 'object') return fallback;
  const vitri = item.VITRI !== undefined && item.VITRI !== null ? `Slot ${item.VITRI}` : '';
  return pickFirst(item.TEN_TB, vitri, item.ten, item.name, item.label, item.title, fallback);
}

function portName(item, fallback = '') {
  if (!item || typeof item !== 'object') return fallback;
  return pickFirst(item.VITRI, item.PORTVL_ID, item.ten, item.name, item.label, item.title, fallback);
}

function naturalNumToken(v) {
  const m = String(v || '').match(/\d+/);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

function buildBrowseNameMaps(snapshot) {
  const snap = snapshot && snapshot.v === 1 ? snapshot : null;
  const toNameById = new Map();
  const tramNameByToTram = new Map();
  const oltNameByToTramOlt = new Map();
  const cardNameByPath = new Map();
  const portNameByPath = new Map();

  const toList = Array.isArray(snap?.toKyThuat) ? snap.toKyThuat : [];
  for (const item of toList) {
    const id = toQlId(item);
    if (!id) continue;
    toNameById.set(id, toQlName(item, id));
  }

  const tramByTo = snap?.tramByTo && typeof snap.tramByTo === 'object' ? snap.tramByTo : {};
  for (const [toId, list] of Object.entries(tramByTo)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = tramId(item);
      if (!id) continue;
      tramNameByToTram.set(`${toId}|${id}`, tramName(item, id));
    }
  }

  const oltByTram = snap?.oltByTram && typeof snap.oltByTram === 'object' ? snap.oltByTram : {};
  for (const [toTram, list] of Object.entries(oltByTram)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = oltId(item);
      if (!id) continue;
      oltNameByToTramOlt.set(`${toTram}|${id}`, oltName(item, id));
    }
  }

  const cardByOlt = snap?.cardByOlt && typeof snap.cardByOlt === 'object' ? snap.cardByOlt : {};
  for (const [oltIdKey, list] of Object.entries(cardByOlt)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = cardId(item);
      if (!id) continue;
      cardNameByPath.set(`${oltIdKey}|${id}`, cardName(item, id));
    }
  }

  const portByCard = snap?.portByCard && typeof snap.portByCard === 'object' ? snap.portByCard : {};
  for (const [cardIdKey, list] of Object.entries(portByCard)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = portId(item);
      if (!id) continue;
      portNameByPath.set(`${cardIdKey}|${id}`, portName(item, id));
    }
  }

  return { toNameById, tramNameByToTram, oltNameByToTramOlt, cardNameByPath, portNameByPath };
}

function enrichPortRows(rows, maps) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const toId = String(r?.toQL || '');
    const tramIdKey = String(r?.veTinh || '');
    const oltIdKey = String(r?.thietBiOlt || '');
    const cardIdKey = String(r?.cardOlt || '');
    const portIdKey = String(r?.portOlt || '');
    const toTen = maps.toNameById.get(toId) || toId;
    const tramTen = maps.tramNameByToTram.get(`${toId}|${tramIdKey}`) || tramIdKey;
    const oltTen = maps.oltNameByToTramOlt.get(`${toId}|${tramIdKey}|${oltIdKey}`) || oltIdKey;
    const cardTen = maps.cardNameByPath.get(`${oltIdKey}|${cardIdKey}`) || cardIdKey;
    const portTen = maps.portNameByPath.get(`${cardIdKey}|${portIdKey}`) || portIdKey;
    return {
      ...r,
      toTen,
      tramTen,
      oltTen,
      cardTen,
      portTen,
      _cardOrder: naturalNumToken(cardTen || cardIdKey),
      _portOrder: naturalNumToken(portTen || portIdKey),
    };
  });
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

    if (searchParams.get('stats') === 'one_sp2_excel') {
      const configured = await sp2ServerConfigured();
      if (!configured) {
        return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.' }, { status: 503 });
      }
      const toQlFilter = (searchParams.get('toQL') || '').trim();
      const detailRes = await sp2ServerGetPonOneSp2DetailRows();
      if (!detailRes.ok) {
        return NextResponse.json({ ok: false, message: detailRes.message || 'Lỗi xuất dữ liệu.' }, { status: 500 });
      }

      const xlsx = await import('xlsx');
      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const rowsSrc = Array.isArray(detailRes.rows) ? detailRes.rows : [];
      const filteredRows = toQlFilter ? rowsSrc.filter((r) => String(r?.toQL || '') === toQlFilter) : rowsSrc;
      const browseRes = await sp2ServerGetBrowseSnapshot();
      const maps = buildBrowseNameMaps(browseRes?.ok ? browseRes?.snapshot : null);
      const enrichedRows = enrichPortRows(filteredRows, maps);
      enrichedRows.sort((a, b) =>
        String(a.toTen || '').localeCompare(String(b.toTen || '')) ||
        String(a.tramTen || '').localeCompare(String(b.tramTen || '')) ||
        String(a.oltTen || '').localeCompare(String(b.oltTen || '')) ||
        (a._cardOrder - b._cardOrder) ||
        String(a.cardTen || '').localeCompare(String(b.cardTen || '')) ||
        (a._portOrder - b._portOrder) ||
        String(a.portTen || '').localeCompare(String(b.portTen || ''))
      );
      const safeToQl = toQlFilter ? toQlFilter.replace(/[^a-zA-Z0-9_-]+/g, '_') : '';
      const filename = toQlFilter
        ? `pon_1sp2_chi_tiet_toql_${safeToQl || 'loc'}_${datePart}.xlsx`
        : `pon_1sp2_chi_tiet_${datePart}.xlsx`;
      const excelRows = enrichedRows.map((r, idx) => ({
        STT: idx + 1,
        TO_KT_TEN: r.toTen || '',
        TO_KT_ID: r.toQL || '',
        TRAM_BTS_TEN: r.tramTen || '',
        TRAM_BTS_ID: r.veTinh || '',
        OLT_TEN: r.oltTen || '',
        OLT_ID: r.thietBiOlt || '',
        CARD_OLT_TEN: r.cardTen || '',
        CARD_OLT_ID: r.cardOlt || '',
        PORT_OLT_TEN: r.portTen || '',
        PORT_OLT_ID: r.portOlt || '',
        TEN_SP2: r.tenSp2 || '',
        CACHE_KEY: r.cacheKey || '',
      }));
      const ws = xlsx.utils.json_to_sheet(excelRows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'PON_1_SP2');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (searchParams.get('stats') === 'olt_pon_detail') {
      const configured = await sp2ServerConfigured();
      if (!configured) {
        return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', rows: [] }, { status: 503 });
      }
      const detailRes = await sp2ServerGetPonSp2DetailRowsByOlt();
      if (!detailRes.ok) {
        return NextResponse.json({ ok: false, message: detailRes.message || 'Lỗi đọc dữ liệu OLT/PON.', rows: [] }, { status: 500 });
      }
      const browseRes = await sp2ServerGetBrowseSnapshot();
      const maps = buildBrowseNameMaps(browseRes?.ok ? browseRes?.snapshot : null);
      const enrichedRows = enrichPortRows(detailRes.rows, maps);
      enrichedRows.sort((a, b) =>
        String(a.oltTen || '').localeCompare(String(b.oltTen || '')) ||
        (Number(a._cardOrder) - Number(b._cardOrder)) ||
        String(a.cardTen || '').localeCompare(String(b.cardTen || '')) ||
        (Number(a._portOrder) - Number(b._portOrder)) ||
        String(a.portTen || '').localeCompare(String(b.portTen || '')) ||
        String(a.toTen || '').localeCompare(String(b.toTen || ''))
      );
      const olts = Array.from(new Map(
        enrichedRows
          .filter((r) => String(r?.thietBiOlt || ''))
          .map((r) => [String(r.thietBiOlt), String(r.oltTen || r.thietBiOlt)])
      ).entries()).map(([id, name]) => ({ id, name }));
      return NextResponse.json({ ok: true, rows: enrichedRows, olts });
    }

    if (searchParams.get('stats') === 'olt_pon_excel') {
      const configured = await sp2ServerConfigured();
      if (!configured) {
        return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.' }, { status: 503 });
      }
      const oltFilter = (searchParams.get('thietBiOlt') || '').trim();
      const detailRes = await sp2ServerGetPonSp2DetailRowsByOlt();
      if (!detailRes.ok) {
        return NextResponse.json({ ok: false, message: detailRes.message || 'Lỗi xuất dữ liệu OLT/PON.' }, { status: 500 });
      }
      const browseRes = await sp2ServerGetBrowseSnapshot();
      const maps = buildBrowseNameMaps(browseRes?.ok ? browseRes?.snapshot : null);
      const enrichedRows = enrichPortRows(detailRes.rows, maps)
        .filter((r) => !oltFilter || String(r?.thietBiOlt || '') === oltFilter)
        .sort((a, b) =>
          String(a.oltTen || '').localeCompare(String(b.oltTen || '')) ||
          (Number(a._cardOrder) - Number(b._cardOrder)) ||
          String(a.cardTen || '').localeCompare(String(b.cardTen || '')) ||
          (Number(a._portOrder) - Number(b._portOrder)) ||
          String(a.portTen || '').localeCompare(String(b.portTen || '')) ||
          String(a.toTen || '').localeCompare(String(b.toTen || ''))
        );
      const xlsx = await import('xlsx');
      const datePart = new Date().toISOString().slice(0, 10);
      const safeOlt = oltFilter.replace(/[^a-zA-Z0-9_-]+/g, '_');
      const filename = oltFilter
        ? `bao_cao_s2_chi_tiet_olt_${safeOlt || 'loc'}_${datePart}.xlsx`
        : `bao_cao_s2_chi_tiet_theo_olt_${datePart}.xlsx`;
      const excelRows = enrichedRows.map((r, idx) => ({
        STT: idx + 1,
        TO_KT_TEN: r.toTen || '',
        TO_KT_ID: r.toQL || '',
        TRAM_BTS_TEN: r.tramTen || '',
        TRAM_BTS_ID: r.veTinh || '',
        OLT_TEN: r.oltTen || '',
        OLT_ID: r.thietBiOlt || '',
        CARD_OLT_TEN: r.cardTen || '',
        CARD_OLT_ID: r.cardOlt || '',
        PORT_PON: r.portTen || '',
        PORT_PON_ID: r.portOlt || '',
        SO_LUONG_SP2: Number(r.sp2Count || 0),
        DANH_SACH_SP2: r.tenSp2List || '',
        CACHE_KEY: r.cacheKey || '',
      }));
      const ws = xlsx.utils.json_to_sheet(excelRows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'OLT_PON_S2');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
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
