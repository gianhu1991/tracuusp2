import { NextResponse } from 'next/server';
import {
  sp2ServerConfigured,
  sp2ServerGetBrowseSnapshot,
  sp2ServerLookupS2Rows,
} from '../../../lib/sp2-server-cache';
import { getStoredAuth } from '../../../lib/auth-store';
import { pickAuthorizationForApi } from '../../../lib/authorization-expiry';

const DEFAULT_BACKEND_URL = 'https://api-onebss.vnpt.vn/web-ecms/tracuu/ds_splitter_theo_port_olt';

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
    };
  });
}

function pickFirstDefined(item, keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim() !== '') {
      return item[key];
    }
  }
  return undefined;
}

function normalizeS2Text(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function isCap2(item) {
  const cap = item?.CAP_SP ?? item?.cap_sp ?? item?.Cap_Sp;
  if (cap === undefined || cap === null) return false;
  return cap === 2 || cap === '2' || Number(cap) === 2 || String(cap).trim() === '2';
}

function mapOnlineRowsForQuery(query, sourceRows = []) {
  const queryNorm = normalizeS2Text(query);
  return (Array.isArray(sourceRows) ? sourceRows : [])
    .filter((item) => isCap2(item))
    .map((item) => {
      const toQL = String(
        pickFirstDefined(item, ['TO_ID', 'TOKT_ID', 'DONVI_ID', 'toQL', 'to_id', 'tokt_id']) || ''
      ).trim();
      const veTinh = String(
        pickFirstDefined(item, ['TRAMTB_ID', 'TRAM_ID', 'veTinh', 'tramtb_id']) || ''
      ).trim();
      const thietBiOlt = String(
        pickFirstDefined(item, ['OLT_ID', 'THIETBI_ID', 'thietBiOlt', 'olt_id']) || ''
      ).trim();
      const cardOlt = String(
        pickFirstDefined(item, ['CARDOLT_ID', 'CARD_ID', 'SLOT_ID', 'cardOlt']) || ''
      ).trim();
      const portOlt = String(
        pickFirstDefined(item, ['PORTVL_ID', 'PORT_ID', 'VITRI', 'portOlt']) || ''
      ).trim();
      const kyHieu = String(
        pickFirstDefined(item, ['KYHIEU', 'KY_HIEU', 'ky_hieu', 'MA_SP', 'ID_SPLITTER']) || ''
      ).trim();
      const tenSplitter = String(
        pickFirstDefined(item, ['TEN_KC', 'TEN_SPLITTER', 'TEN_SP', 'ten', 'name', 'TEN']) || ''
      ).trim();
      const diaChi = String(
        pickFirstDefined(item, ['DIA_CHI', 'DIACHI', 'DIA_CHI_LAP_DAT', 'dia_chi', 'diaChi']) || ''
      ).trim();
      return {
        queryS2: String(query || ''),
        toQL,
        veTinh,
        thietBiOlt,
        cardOlt,
        portOlt,
        kyHieu,
        tenSplitter,
        diaChi,
        matchType: normalizeS2Text(kyHieu) === queryNorm || normalizeS2Text(tenSplitter) === queryNorm ? 'exact' : 'partial',
        source: 'online',
        cacheKey: '',
      };
    });
}

async function lookupOnlineByS2({ s2, authorization, backendUrl }) {
  const payload = { ky_hieu: s2, dia_chi: null };
  const res = await fetch(backendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, message: data?.message || data?.error || `Online lookup failed (${res.status}).`, rows: [] };
  }
  let list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? data?.danhSach);
  if (!Array.isArray(list)) list = [];
  return { ok: true, rows: mapOnlineRowsForQuery(s2, list) };
}

export async function POST(request) {
  try {
    const configured = await sp2ServerConfigured();
    if (!configured) {
      return NextResponse.json({ ok: false, message: 'Chưa cấu hình Supabase.', rows: [] }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const s2List = Array.isArray(body?.s2List) ? body.s2List : [];
    const cleaned = Array.from(new Set(
      s2List
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));
    if (cleaned.length === 0) {
      return NextResponse.json({ ok: true, rows: [], notFound: [] });
    }
    if (cleaned.length > 2000) {
      return NextResponse.json({ ok: false, message: 'Danh sách S2 quá lớn. Tối đa 2000 dòng/lần tra cứu.', rows: [] }, { status: 400 });
    }

    const authFromHeader = (request.headers.get('Authorization') || request.headers.get('authorization') || '').trim();
    const authStored = await getStoredAuth();
    const authEnv =
      process.env.ONE_BSS_AUTHORIZATION || process.env.AUTHORIZATION || process.env.TRACUU_AUTHORIZATION || '';
    const authorization = pickAuthorizationForApi(
      authFromHeader || String(body?.authorization || '').trim(),
      authStored,
      authEnv
    );
    const backendUrl = process.env.BACKEND_URL || process.env.TRACUU_BACKEND_URL || DEFAULT_BACKEND_URL;
    const onlineRows = [];
    const needCacheSet = new Set(cleaned);

    // Co Authorization: uu tien tra online truoc, cache chi fallback cho ma khong co ket qua online.
    if (authorization) {
      for (const code of cleaned) {
        try {
          const online = await lookupOnlineByS2({ s2: code, authorization, backendUrl });
          if (!online.ok) continue;
          if (Array.isArray(online.rows) && online.rows.length > 0) {
            onlineRows.push(...online.rows);
            needCacheSet.delete(code);
          }
        } catch {
          // Neu online loi, se fallback cache ben duoi.
        }
      }
    }

    let cacheRows = [];
    const needCache = Array.from(needCacheSet);
    if (needCache.length > 0) {
      const lookupRes = await sp2ServerLookupS2Rows(needCache);
      if (!lookupRes.ok) {
        return NextResponse.json({ ok: false, message: lookupRes.message || 'Lỗi tra cứu S2.', rows: [] }, { status: 500 });
      }
      cacheRows = Array.isArray(lookupRes.rows) ? lookupRes.rows : [];
    }

    const mergedRows = [...onlineRows, ...cacheRows];
    const browseRes = await sp2ServerGetBrowseSnapshot();
    const maps = buildBrowseNameMaps(browseRes?.ok ? browseRes?.snapshot : null);
    const rows = enrichPortRows(mergedRows, maps);
    const foundSet = new Set(rows.map((r) => String(r?.queryS2 || '').trim()).filter(Boolean));
    const notFound = cleaned.filter((item) => !foundSet.has(item));
    return NextResponse.json({ ok: true, rows, notFound });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi server khi tra cứu S2.', rows: [] },
      { status: 500 }
    );
  }
}
