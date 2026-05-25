/**
 * Cache S2 trên máy chủ lưu trữ (STORAGE_API_URL hoặc Supabase). Chỉ gọi từ API route.
 */

import { getStorageAdapter, storageConfigured, storageNotConfiguredMessage } from './kv-backend';

const META_KEY = 'sp2_sync_meta';
const BROWSE_KEY = 'sp2_browse_snapshot';
const TB_SHARED_PREFIX = 'tb_subscriber_v1|';
const TB_TRANSFER_PREFIX = 'tb_transfer_history_v1|';

/** Chỉ khóa cache tra cứu S2: toQL|veTinh|thietBiOlt|cardOlt|portOlt (5 phần). */
function isSp2PortCacheKey(cacheKey) {
  const key = String(cacheKey || '').trim();
  if (!key) return false;
  if (key.startsWith(TB_SHARED_PREFIX)) return false;
  if (key.startsWith(TB_TRANSFER_PREFIX)) return false;
  if (key.startsWith('tb_excel_shared_rows_v1')) return false;
  if (key === META_KEY || key === BROWSE_KEY) return false;
  const parts = key.split('|');
  if (parts.length !== 5) return false;
  return parts.every((p) => String(p).trim() !== '');
}

function parseSp2PortCacheKey(cacheKey) {
  if (!isSp2PortCacheKey(cacheKey)) return null;
  const [toQL, veTinh, thietBiOlt, cardOlt, portOlt] = cacheKey.split('|');
  return { toQL, veTinh, thietBiOlt, cardOlt, portOlt };
}

async function listAllCacheRows() {
  const store = await getStorageAdapter();
  if (!store) return { ok: false, message: storageNotConfiguredMessage(), rows: [] };
  const rows = [];
  const pageSize = 50000;
  let offset = 0;
  while (true) {
    const page = await store.cacheListPage({ offset, limit: pageSize });
    if (!page.ok) return { ok: false, message: page.error || 'Lỗi đọc cache.', rows: [] };
    if (!page.rows.length) break;
    rows.push(...page.rows);
    if (page.rows.length < pageSize) break;
    offset += pageSize;
  }
  return { ok: true, rows };
}

export async function sp2ServerConfigured() {
  return storageConfigured();
}

/** @returns {Promise<{ ok: boolean, hit?: boolean, data?: unknown[], message?: string }>} */
export async function sp2ServerGetPort(cacheKey) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const got = await store.cacheGet(cacheKey);
  if (!got.ok) {
    return { ok: false, message: got.error || 'Lỗi đọc cache server.' };
  }
  if (!got.row) {
    return { ok: true, hit: false };
  }
  const arr = Array.isArray(got.row.data) ? got.row.data : [];
  return { ok: true, hit: true, data: arr };
}

export async function sp2ServerTruncate() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }

  const del = await store.cacheDeleteSp2Only();
  if (!del.ok) {
    return { ok: false, message: del.error || 'Không xóa được bảng cache.' };
  }
  await store.configDelete(BROWSE_KEY);
  return { ok: true };
}

/**
 * @param {Array<{ key: string, data: unknown[] }>} batch
 */
export async function sp2ServerUpsertBatch(batch) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const now = new Date().toISOString();
  const rows = batch.map((b) => ({
    cache_key: b.key,
    data: Array.isArray(b.data) ? b.data : [],
    updated_at: now,
  }));
  const up = await store.cacheUpsert(rows);
  if (!up.ok) {
    return { ok: false, message: up.error || 'Lỗi ghi cache.' };
  }
  return { ok: true };
}

export async function sp2ServerGetMeta() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, meta: null };
  }
  const cfg = await store.configGet(META_KEY);
  if (!cfg.ok || !cfg.value) {
    return { ok: true, meta: null };
  }
  try {
    const meta = JSON.parse(typeof cfg.value === 'string' ? cfg.value : '{}');
    return { ok: true, meta: meta && typeof meta === 'object' ? meta : null };
  } catch {
    return { ok: true, meta: null };
  }
}

export async function sp2ServerSetMeta(meta) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false };
  }
  const value = JSON.stringify(meta ?? {});
  const cfg = await store.configSet(META_KEY, value);
  return { ok: cfg.ok };
}

export async function sp2ServerGetBrowseSnapshot() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, snapshot: null };
  }
  const cfg = await store.configGet(BROWSE_KEY);
  if (!cfg.ok || !cfg.value) {
    return { ok: true, snapshot: null };
  }
  try {
    const snap = JSON.parse(typeof cfg.value === 'string' ? cfg.value : '{}');
    if (snap && typeof snap === 'object' && snap.v === 1) {
      return { ok: true, snapshot: snap };
    }
    return { ok: true, snapshot: null };
  } catch {
    return { ok: true, snapshot: null };
  }
}

export async function sp2ServerSetBrowseSnapshot(snapshot) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false };
  }
  const value = JSON.stringify(snapshot ?? {});
  const cfg = await store.configSet(BROWSE_KEY, value);
  return { ok: cfg.ok };
}

/**
 * Thống kê theo Tổ KT:
 * - totalPorts: số cổng đã cache
 * - oneSp2Ports: số cổng có đúng 1 SP2
 * - ratioOneSp2: tỷ lệ oneSp2Ports / totalPorts
 */
export async function sp2ServerGetPonOneSp2StatsByToQL() {
  const listed = await listAllCacheRows();
  if (!listed.ok) {
    return { ok: false, message: listed.message || 'Lỗi đọc dữ liệu thống kê.', rows: [] };
  }

  const byTo = new Map();
  for (const row of listed.rows) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parsed = parseSp2PortCacheKey(key);
      if (!parsed) continue;
      const { toQL } = parsed;

      const list = Array.isArray(row?.data) ? row.data : [];
      const stat = byTo.get(toQL) || { toQL, totalPorts: 0, oneSp2Ports: 0, withSp2Ports: 0 };
      stat.totalPorts += 1;
      if (list.length > 0) stat.withSp2Ports += 1;
      if (list.length === 1) stat.oneSp2Ports += 1;
      byTo.set(toQL, stat);
  }

  const rows = Array.from(byTo.values())
    .map((r) => ({
      ...r,
      ratioOneSp2: r.totalPorts > 0 ? r.oneSp2Ports / r.totalPorts : 0,
    }))
    .sort((a, b) => b.ratioOneSp2 - a.ratioOneSp2 || b.totalPorts - a.totalPorts);

  return { ok: true, rows };
}

/**
 * Danh sách chi tiết cổng PON có đúng 1 SP2.
 * Mỗi dòng gồm thông tin định danh cổng + tên SP2.
 */
export async function sp2ServerGetPonOneSp2DetailRows() {
  const listed = await listAllCacheRows();
  if (!listed.ok) {
    return { ok: false, message: listed.message || 'Lỗi đọc dữ liệu chi tiết.', rows: [] };
  }

  const rows = [];
  for (const row of listed.rows) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parsed = parseSp2PortCacheKey(key);
      if (!parsed) continue;
      const { toQL, veTinh, thietBiOlt, cardOlt, portOlt } = parsed;
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length !== 1) continue;

      const only = list[0] || {};
      const tenSp2 = only?.TEN_KC ?? only?.KYHIEU ?? only?.ten ?? only?.name ?? '';
      rows.push({
        toQL,
        veTinh,
        thietBiOlt,
        cardOlt,
        portOlt,
        tenSp2: tenSp2 != null ? String(tenSp2) : '',
        cacheKey: key,
      });
  }

  rows.sort((a, b) =>
    a.toQL.localeCompare(b.toQL) ||
    a.veTinh.localeCompare(b.veTinh) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt)
  );

  return { ok: true, rows };
}

/**
 * Danh sách chi tiết cache theo OLT + cổng PON.
 * Mỗi dòng gồm định danh cổng, số lượng SP2 và tên SP2 (nối bằng "; ").
 */
export async function sp2ServerGetPonSp2DetailRowsByOlt() {
  const listed = await listAllCacheRows();
  if (!listed.ok) {
    return { ok: false, message: listed.message || 'Lỗi đọc dữ liệu chi tiết OLT/PON.', rows: [] };
  }

  const rows = [];
  for (const row of listed.rows) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parsed = parseSp2PortCacheKey(key);
      if (!parsed) continue;
      const { toQL, veTinh, thietBiOlt, cardOlt, portOlt } = parsed;
      const list = Array.isArray(row?.data) ? row.data : [];
      const sp2Names = list
        .map((item) => item?.TEN_KC ?? item?.KYHIEU ?? item?.ten ?? item?.name ?? '')
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter(Boolean);
      rows.push({
        toQL,
        veTinh,
        thietBiOlt,
        cardOlt,
        portOlt,
        sp2Count: list.length,
        tenSp2List: sp2Names.join('; '),
        cacheKey: key,
      });
  }

  rows.sort((a, b) =>
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt) ||
    a.toQL.localeCompare(b.toQL) ||
    a.veTinh.localeCompare(b.veTinh)
  );

  return { ok: true, rows };
}

/**
 * Danh sách cổng PON KHÔNG có S2.
 * Dùng cho báo cáo theo Tổ KT/OLT.
 */
export async function sp2ServerGetPonNoSp2DetailRows() {
  const listed = await listAllCacheRows();
  if (!listed.ok) {
    return { ok: false, message: listed.message || 'Lỗi đọc dữ liệu cổng không có S2.', rows: [] };
  }

  const rows = [];
  for (const row of listed.rows) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parsed = parseSp2PortCacheKey(key);
      if (!parsed) continue;
      const { toQL, veTinh, thietBiOlt, cardOlt, portOlt } = parsed;
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length !== 0) continue;
      rows.push({
        toQL,
        veTinh,
        thietBiOlt,
        cardOlt,
        portOlt,
        sp2Count: 0,
        cacheKey: key,
      });
  }

  rows.sort((a, b) =>
    a.toQL.localeCompare(b.toQL) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt) ||
    a.veTinh.localeCompare(b.veTinh)
  );

  return { ok: true, rows };
}

function pickFirstDefined(item, keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim() !== '') {
      return item[key];
    }
  }
  return undefined;
}

const SPLITTER_DIA_CHI_KEYS = ['DIA_CHI', 'DIACHI', 'DIA_CHI_LAP_DAT', 'dia_chi', 'diaChi'];

function splitterDiaChiFromItem(item) {
  const v = pickFirstDefined(item, SPLITTER_DIA_CHI_KEYS);
  return v != null ? String(v).trim() : '';
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Danh sách chi tiết dung lượng S2 theo từng splitter đã cache.
 */
export async function sp2ServerGetS2CapacityRows() {
  const listed = await listAllCacheRows();
  if (!listed.ok) {
    return { ok: false, message: listed.message || 'Lỗi đọc dữ liệu dung lượng S2.', rows: [] };
  }

  const rows = [];
  for (const row of listed.rows) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parsed = parseSp2PortCacheKey(key);
      if (!parsed) continue;
      const { toQL, veTinh, thietBiOlt, cardOlt, portOlt } = parsed;
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length === 0) continue;

      for (const item of list) {
        const tenSplitter = pickFirstDefined(item, ['TEN_KC', 'TEN_SPLITTER', 'TEN_SP', 'ten', 'name', 'TEN']);
        const kyHieu = pickFirstDefined(item, ['KYHIEU', 'KY_HIEU', 'ky_hieu', 'MA_SP', 'ID_SPLITTER']);
        const capSp = pickFirstDefined(item, ['CAP_SP', 'cap_sp', 'Cap_Sp', 'CAP']);
        const dungLuongRaw = pickFirstDefined(item, ['DUNGLUONG', 'DUNG_LUONG', 'DUNG_LUONG_TOI_DA', 'SO_CONG', 'TONG_CONG', 'SUC_CHUA']);
        const daDungRaw = pickFirstDefined(item, ['DLSD', 'DA_DUNG', 'SO_DA_DUNG', 'SL_DA_DUNG', 'SO_CONG_DA_DUNG', 'DA_SU_DUNG', 'USED']);
        const chuaDungRaw = pickFirstDefined(item, ['DLROI', 'CHUA_DUNG', 'SO_CHUA_DUNG', 'SL_CHUA_DUNG', 'SO_CONG_CHUA_DUNG', 'CON_LAI', 'AVAILABLE']);

        let dungLuong = toNumberOrNull(dungLuongRaw);
        let daDung = toNumberOrNull(daDungRaw);
        let chuaDung = toNumberOrNull(chuaDungRaw);
        if (chuaDung == null && dungLuong != null && daDung != null) chuaDung = Math.max(0, dungLuong - daDung);
        if (daDung == null && dungLuong != null && chuaDung != null) daDung = Math.max(0, dungLuong - chuaDung);

        if (dungLuong == null && daDung == null && chuaDung == null) continue;

        rows.push({
          toQL,
          veTinh,
          thietBiOlt,
          cardOlt,
          portOlt,
          tenSplitter: tenSplitter != null ? String(tenSplitter) : '',
          kyHieu: kyHieu != null ? String(kyHieu) : '',
          capSp: capSp != null ? String(capSp) : '',
          dungLuong,
          daDung,
          chuaDung,
          ngayCapNhat: pickFirstDefined(item, ['NGAY CN', 'NGAY_CAP_NHAT', 'NGAY_CN', 'UPDATED_AT', 'ngayCapNhat']) ?? '',
          diaChi: splitterDiaChiFromItem(item),
          cacheKey: key,
        });
      }
  }

  rows.sort((a, b) =>
    a.toQL.localeCompare(b.toQL) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt) ||
    a.kyHieu.localeCompare(b.kyHieu)
  );
  return { ok: true, rows };
}

function normalizeS2Text(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export async function sp2ServerLookupS2Rows(inputCodes = []) {
  const listed = await listAllCacheRows();
  if (!listed.ok) {
    return { ok: false, message: listed.message || 'Lỗi đọc dữ liệu tra cứu S2.', rows: [] };
  }

  const normalizedInputs = Array.from(new Set(
    (Array.isArray(inputCodes) ? inputCodes : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));
  if (normalizedInputs.length === 0) {
    return { ok: true, rows: [] };
  }

  const queryTargets = normalizedInputs.map((raw) => ({
    raw,
    norm: normalizeS2Text(raw),
  })).filter((item) => item.norm);

  const rows = [];
  for (const row of listed.rows) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parsed = parseSp2PortCacheKey(key);
      if (!parsed) continue;
      const { toQL, veTinh, thietBiOlt, cardOlt, portOlt } = parsed;
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length === 0) continue;

      for (const item of list) {
        const kyHieu = String(pickFirstDefined(item, ['KYHIEU', 'KY_HIEU', 'ky_hieu', 'MA_SP', 'ID_SPLITTER']) || '').trim();
        const tenSplitter = String(pickFirstDefined(item, ['TEN_KC', 'TEN_SPLITTER', 'TEN_SP', 'ten', 'name', 'TEN']) || '').trim();
        const kyHieuNorm = normalizeS2Text(kyHieu);
        const tenNorm = normalizeS2Text(tenSplitter);
        if (!kyHieuNorm && !tenNorm) continue;

        for (const target of queryTargets) {
          const exactMatch = (
            (kyHieuNorm && kyHieuNorm === target.norm) ||
            (tenNorm && tenNorm === target.norm)
          );
          const partialMatch = (
            (kyHieuNorm && kyHieuNorm.includes(target.norm)) ||
            (tenNorm && tenNorm.includes(target.norm))
          );
          const isMatch = exactMatch || partialMatch;
          if (!isMatch) continue;
          rows.push({
            queryS2: target.raw,
            toQL,
            veTinh,
            thietBiOlt,
            cardOlt,
            portOlt,
            kyHieu,
            tenSplitter,
            diaChi: splitterDiaChiFromItem(item),
            matchType: exactMatch ? 'exact' : 'partial',
            cacheKey: key,
          });
        }
      }
  }

  const bestRows = [];
  const byQuery = new Map();
  for (const row of rows) {
    const key = String(row?.queryS2 || '');
    if (!byQuery.has(key)) byQuery.set(key, []);
    byQuery.get(key).push(row);
  }
  for (const list of byQuery.values()) {
    const hasExact = list.some((item) => String(item?.matchType || '') === 'exact');
    const selected = hasExact ? list.filter((item) => String(item?.matchType || '') === 'exact') : list;
    bestRows.push(...selected);
  }

  bestRows.sort((a, b) =>
    a.queryS2.localeCompare(b.queryS2) ||
    a.toQL.localeCompare(b.toQL) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt)
  );
  return { ok: true, rows: bestRows };
}
