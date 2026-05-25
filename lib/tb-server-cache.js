import { tbStableRowKey } from './tb-row-key';
import { getStorageAdapter, storageConfigured, storageNotConfiguredMessage } from './kv-backend';

const TB_SHARED_KEY = 'tb_subscriber_v1';
const TB_META_KEY = `${TB_SHARED_KEY}|meta`;
const TB_ROW_PREFIX = `${TB_SHARED_KEY}|row|`;
const TB_ROW_OK_CACHE_KEY = `${TB_SHARED_KEY}|row_ok`;
const TB_BULK_KEY = 'tb_subscriber_bulk_v2';
const TB_BULK_PENDING_KEY = 'tb_subscriber_bulk_pending';
const TB_TRANSFER_KEY = 'tb_transfer_history_v1';
const TB_TRANSFER_META_KEY = `${TB_TRANSFER_KEY}|meta`;
const TB_TRANSFER_BATCH_PREFIX = `${TB_TRANSFER_KEY}|batch|`;

async function listCacheByPrefix(store, prefix) {
  const rows = [];
  const pageSize = 50000;
  let offset = 0;
  while (true) {
    const page = await store.cacheListPage({ likePrefix: prefix, offset, limit: pageSize });
    if (!page.ok) return { ok: false, error: page.error, rows: [] };
    if (!page.rows.length) break;
    rows.push(...page.rows);
    if (page.rows.length < pageSize) break;
    offset += pageSize;
  }
  return { ok: true, rows };
}

function toSafeString(v) {
  if (v == null) return '';
  return String(v).trim();
}

/** Một số driver/PostgREST trả cột jsonb dạng chuỗi JSON — chuẩn hoá về object. */
function unwrapJsonbData(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return typeof p === 'object' && p != null ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeTbRows(rows) {
  const src = Array.isArray(rows) ? rows : [];
  return src.map((r) => ({
    id: toSafeString(r?.id),
    stt: toSafeString(r?.stt),
    account: toSafeString(r?.account),
    tenKH: toSafeString(r?.tenKH),
    diaChi: toSafeString(r?.diaChi),
    soDt: toSafeString(r?.soDt),
    olt: toSafeString(r?.olt),
    slot: toSafeString(r?.slot),
    port: toSafeString(r?.port),
    nvQL: toSafeString(r?.nvQL),
  }));
}

function normalizeTransferBatch(batch) {
  const rows = Array.isArray(batch?.rows) ? batch.rows : [];
  return {
    id: toSafeString(batch?.id),
    thoiGian: toSafeString(batch?.thoiGian),
    thietBiThaoTac: toSafeString(batch?.thietBiThaoTac),
    rows: rows.map((r) => ({
      stt: toSafeString(r?.stt),
      account: toSafeString(r?.account),
      tenKH: toSafeString(r?.tenKH),
      diaChi: toSafeString(r?.diaChi),
      diaBanCu: toSafeString(r?.diaBanCu),
      diaBanMoi: toSafeString(r?.diaBanMoi),
      xacNhan: Boolean(r?.xacNhan),
      thoiGianXacNhan: toSafeString(r?.thoiGianXacNhan),
    })),
  };
}

export async function tbServerConfigured() {
  return storageConfigured();
}

function makeTbRowKey(r) {
  const account = toSafeString(r?.account || r?.id);
  const keyRow = account ? r : { ...r, account: `row-${Math.random().toString(36).slice(2, 10)}` };
  return `${TB_ROW_PREFIX}${tbStableRowKey(keyRow)}`;
}

function toDbRows(rows, uploadedAt) {
  const now = uploadedAt || new Date().toISOString();
  return normalizeTbRows(rows).map((r) => ({
    cache_key: makeTbRowKey(r),
    data: r,
    updated_at: now,
  }));
}

async function readLegacySingleRowOrChunkMeta(store) {
  const metaGot = await store.cacheGet('tb_excel_shared_rows_v1|meta');
  const data = metaGot.ok ? metaGot.row : null;
  const error = metaGot.ok ? null : { message: metaGot.error };
  const oldMetaObj = unwrapJsonbData(data?.data) || (typeof data?.data === 'object' ? data.data : null);
  if (!error && oldMetaObj && typeof oldMetaObj === 'object') {
    const oldMeta = oldMetaObj;
    const oldUploadId = toSafeString(oldMeta.uploadId);
    if (oldUploadId) {
      const listed = await listCacheByPrefix(store, `tb_excel_shared_rows_v1|chunk|${oldUploadId}`);
      const chunkRows = listed.ok ? listed.rows : [];
      const rows = (Array.isArray(chunkRows) ? chunkRows : [])
        .map((x) => {
          const d = unwrapJsonbData(x?.data) || x?.data;
          return normalizeTbRows(Array.isArray(d?.rows) ? d.rows : []);
        })
        .flat();
      if (rows.length > 0) {
        return {
          v: 1,
          fileName: toSafeString(oldMeta.fileName),
          uploadedAt: toSafeString(oldMeta.uploadedAt || data?.updated_at),
          rows,
        };
      }
    }
  }
  const legacyGot = await store.cacheGet('tb_excel_shared_rows_v1');
  if (!legacyGot.ok || !legacyGot.row?.data) return null;
  const payload = unwrapJsonbData(legacyGot.row.data) || legacyGot.row.data;
  if (!payload || typeof payload !== 'object') return null;
  const legacyRows = normalizeTbRows(payload?.rows);
  if (!legacyRows.length) return null;
  return {
    v: 1,
    fileName: toSafeString(payload?.fileName),
    uploadedAt: toSafeString(payload?.uploadedAt || legacyGot.row?.updated_at),
    rows: legacyRows,
  };
}

/** Chunk upload Excel cũ (tb_excel_shared_rows_v1|chunk|...) không còn meta — gộp theo uploadId, chọn bộ có nhiều dòng nhất. */
const LEGACY_EXCEL_CHUNK_KEY_RE = /^tb_excel_shared_rows_v1\|chunk\|(.+)\|(\d+)$/;

async function recoverLegacyExcelOrphanChunks(store) {
  const listed = await listCacheByPrefix(store, 'tb_excel_shared_rows_v1|chunk');
  if (!listed.ok) {
    return { ok: false, message: listed.error || 'Lỗi đọc chunk Excel cũ.', rows: [], latestUpdatedAt: '' };
  }
  const all = listed.rows;
  if (!all.length) return { ok: true, rows: [], latestUpdatedAt: '' };

  const byUpload = new Map();
  for (const r of all) {
    const m = String(r.cache_key || '').match(LEGACY_EXCEL_CHUNK_KEY_RE);
    if (!m) continue;
    const uploadId = m[1];
    const chunkIndex = Number(m[2]);
    const d = unwrapJsonbData(r?.data) || r?.data;
    const chunkRows = Array.isArray(d?.rows) ? d.rows : [];
    if (!byUpload.has(uploadId)) byUpload.set(uploadId, { chunks: new Map(), latestU: '' });
    const g = byUpload.get(uploadId);
    const u = toSafeString(r.updated_at);
    if (u && (!g.latestU || u > g.latestU)) g.latestU = u;
    g.chunks.set(chunkIndex, normalizeTbRows(chunkRows));
  }

  let bestRows = [];
  let bestU = '';
  let bestScore = -1;
  for (const [, g] of byUpload) {
    const indices = [...g.chunks.keys()].sort((a, b) => a - b);
    const merged = indices.flatMap((i) => g.chunks.get(i) || []);
    if (merged.length > bestScore) {
      bestScore = merged.length;
      bestRows = merged;
      bestU = g.latestU;
    }
  }
  return { ok: true, rows: bestRows, latestUpdatedAt: bestU };
}

/** Đọc toàn bộ dòng TB đã upsert theo prefix khi chưa có meta (upload chunk bị gián đoạn trước bước finalize). */
async function collectTbSubscriberRowsByPrefix(store) {
  const rows = [];
  let latestUpdatedAt = '';
  const listed = await listCacheByPrefix(store, TB_ROW_PREFIX);
  if (!listed.ok) {
    return { ok: false, message: listed.error || 'Lỗi đọc dữ liệu thuê bao.', rows: [], latestUpdatedAt: '' };
  }
  for (const r of listed.rows) {
    rows.push(unwrapJsonbData(r?.data) || {});
    const u = toSafeString(r?.updated_at);
    if (u && (!latestUpdatedAt || u > latestUpdatedAt)) latestUpdatedAt = u;
  }
  return { ok: true, rows: normalizeTbRows(rows), latestUpdatedAt };
}

export async function tbServerGetSharedRows() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage(), payload: null };
  }

  const bulk = await store.configGet(TB_BULK_KEY);
  if (bulk.ok && bulk.value) {
    try {
      const parsed = JSON.parse(typeof bulk.value === 'string' ? bulk.value : '{}');
      if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        return {
          ok: true,
          payload: {
            v: 2,
            fileName: toSafeString(parsed.fileName),
            uploadedAt: toSafeString(parsed.uploadedAt),
            rows: normalizeTbRows(parsed.rows),
            partialRecovery: false,
          },
        };
      }
    } catch { /* ignore, try legacy */ }
  }

  const metaGot = await store.cacheGet(TB_META_KEY);
  if (metaGot.ok && metaGot.row) {
    const meta = unwrapJsonbData(metaGot.row?.data);
    if (meta && typeof meta === 'object') {
      const listed = await listCacheByPrefix(store, TB_ROW_PREFIX);
      if (listed.ok && listed.rows.length > 0) {
        const rows = listed.rows.map((r) => unwrapJsonbData(r?.data) || {});
        return {
          ok: true,
          payload: {
            v: 1,
            fileName: toSafeString(meta.fileName),
            uploadedAt: toSafeString(meta.uploadedAt || metaGot.row?.updated_at),
            rows: normalizeTbRows(rows),
            partialRecovery: false,
          },
        };
      }
    }
  }

  const legacy = await readLegacySingleRowOrChunkMeta(store);
  if (legacy?.rows?.length) {
    return { ok: true, payload: { ...legacy, partialRecovery: false } };
  }

  return { ok: true, payload: null };
}

export async function tbServerClearSharedChunks() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  await store.configDelete(TB_BULK_KEY);
  await store.configDelete(TB_BULK_PENDING_KEY);
  await store.cacheDeleteLike(TB_ROW_PREFIX);
  await store.cacheDeleteEq(TB_META_KEY);
  return { ok: true };
}

export async function tbServerSaveSharedChunk({ uploadId, chunkIndex, rows, uploadedAt }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const normalizedRows = normalizeTbRows(rows);
  let pending = [];
  const existing = await store.configGet(TB_BULK_PENDING_KEY);
  if (existing.ok && existing.value) {
    try {
      const parsed = JSON.parse(typeof existing.value === 'string' ? existing.value : '[]');
      pending = Array.isArray(parsed) ? parsed : [];
    } catch { /* ignore */ }
  }
  pending.push(...normalizedRows);
  const result = await store.configSet(TB_BULK_PENDING_KEY, JSON.stringify(pending));
  if (!result.ok) return { ok: false, message: result.error || 'Không lưu được chunk dữ liệu.' };
  return { ok: true };
}

export async function tbServerFinalizeSharedUpload({ uploadId, fileName, totalChunks, totalCount, uploadedAt }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const now = uploadedAt || new Date().toISOString();
  let rows = [];
  const pending = await store.configGet(TB_BULK_PENDING_KEY);
  if (pending.ok && pending.value) {
    try {
      const parsed = JSON.parse(typeof pending.value === 'string' ? pending.value : '[]');
      rows = Array.isArray(parsed) ? parsed : [];
    } catch { /* ignore */ }
  }
  const payload = {
    v: 2,
    fileName: toSafeString(fileName),
    uploadedAt: now,
    rows: normalizeTbRows(rows),
  };
  const result = await store.configSet(TB_BULK_KEY, JSON.stringify(payload));
  if (!result.ok) return { ok: false, message: result.error || 'Không lưu được dữ liệu thuê bao.' };
  await store.configDelete(TB_BULK_PENDING_KEY);
  return { ok: true, payload: { v: 2, fileName: payload.fileName, uploadedAt: now, totalCount: rows.length } };
}

export async function tbServerSetSharedRows({ fileName, rows }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const normalizedRows = normalizeTbRows(rows);
  const now = new Date().toISOString();
  const payload = {
    v: 2,
    fileName: toSafeString(fileName),
    uploadedAt: now,
    rows: normalizedRows,
  };
  const result = await store.configSet(TB_BULK_KEY, JSON.stringify(payload));
  if (!result.ok) return { ok: false, message: result.error || 'Không lưu được dữ liệu thuê bao.' };
  return { ok: true, payload };
}

export async function tbServerGetTransferHistory() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage(), batches: [] };
  }
  const listed = await listCacheByPrefix(store, TB_TRANSFER_BATCH_PREFIX);
  if (!listed.ok) {
    return { ok: false, message: listed.error || 'Lỗi đọc lịch sử chuyển địa bàn.', batches: [] };
  }
  const batches = listed.rows.map((r) => normalizeTransferBatch(r?.data || {}));
  batches.sort((a, b) => String(a.thoiGian || '').localeCompare(String(b.thoiGian || '')));
  return { ok: true, batches };
}

export async function tbServerAppendTransferBatch(batch) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const normalized = normalizeTransferBatch(batch);
  if (!normalized.id) {
    return { ok: false, message: 'Thiếu id batch.' };
  }
  const now = new Date().toISOString();
  const batchKey = `${TB_TRANSFER_BATCH_PREFIX}${normalized.id}`;
  const upBatch = await store.cacheUpsert([{ cache_key: batchKey, data: normalized, updated_at: now }]);
  if (!upBatch.ok) return { ok: false, message: upBatch.error || 'Không lưu được batch lịch sử.' };

  const oldMetaGot = await store.cacheGet(TB_TRANSFER_META_KEY);
  const prev =
    oldMetaGot.ok && oldMetaGot.row?.data && typeof oldMetaGot.row.data === 'object' ? oldMetaGot.row.data : {};
  const meta = {
    v: 1,
    totalBatches: Number(prev.totalBatches || 0) + 1,
    totalRows: Number(prev.totalRows || 0) + normalized.rows.length,
    lastUpdatedAt: now,
  };
  await store.cacheUpsert([{ cache_key: TB_TRANSFER_META_KEY, data: meta, updated_at: now }]);
  return { ok: true };
}

export async function tbServerDeleteTransferRow({ batchId, rowIndex }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const id = toSafeString(batchId);
  const idx = Number(rowIndex);
  if (!id || !Number.isInteger(idx) || idx < 0) {
    return { ok: false, message: 'Tham số xóa không hợp lệ.' };
  }
  const batchKey = `${TB_TRANSFER_BATCH_PREFIX}${id}`;
  const foundGot = await store.cacheGet(batchKey);
  if (!foundGot.ok) return { ok: false, message: foundGot.error || 'Không đọc được batch lịch sử.' };
  const batch = normalizeTransferBatch(foundGot.row?.data || {});
  if (!Array.isArray(batch.rows) || idx >= batch.rows.length) {
    return { ok: false, message: 'Không tìm thấy dòng lịch sử cần xóa.' };
  }
  batch.rows.splice(idx, 1);
  const now = new Date().toISOString();
  if (batch.rows.length === 0) {
    const del = await store.cacheDeleteEq(batchKey);
    if (!del.ok) return { ok: false, message: del.error || 'Không xóa được batch lịch sử.' };
  } else {
    const up = await store.cacheUpsert([{ cache_key: batchKey, data: batch, updated_at: now }]);
    if (!up.ok) return { ok: false, message: up.error || 'Không cập nhật được batch lịch sử.' };
  }

  const listed = await listCacheByPrefix(store, TB_TRANSFER_BATCH_PREFIX);
  if (listed.ok) {
    const totalBatches = listed.rows.length;
    const totalRows = listed.rows.reduce(
      (n, r) => n + normalizeTransferBatch(r?.data || {}).rows.length,
      0
    );
    const meta = { v: 1, totalBatches, totalRows, lastUpdatedAt: now };
    await store.cacheUpsert([{ cache_key: TB_TRANSFER_META_KEY, data: meta, updated_at: now }]);
  }
  return { ok: true };
}

/** Đọc danh sách khóa dòng TB đã bấm OK (dùng chung mọi máy). */
export async function tbServerGetRowOkKeys() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage(), keys: [] };
  }
  const got = await store.cacheGet(TB_ROW_OK_CACHE_KEY);
  if (!got.ok) {
    return { ok: false, message: got.error || 'Lỗi đọc trạng thái OK.', keys: [] };
  }
  const payload = unwrapJsonbData(got.row?.data);
  const marks = payload?.marks && typeof payload.marks === 'object' ? payload.marks : {};
  return { ok: true, keys: Object.keys(marks) };
}

/** Ghi nhận một dòng TB đã OK (theo khóa ổn định). */
export async function tbServerMarkRowOk(row) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const stableKey = tbStableRowKey(row);
  if (!stableKey || stableKey.split('|').length < 5) {
    return { ok: false, message: 'Dòng thuê bao không hợp lệ.' };
  }
  const foundGot = await store.cacheGet(TB_ROW_OK_CACHE_KEY);
  if (!foundGot.ok) {
    return { ok: false, message: foundGot.error || 'Lỗi đọc trạng thái OK.' };
  }
  const prev = unwrapJsonbData(foundGot.row?.data) || {};
  const marks = prev.marks && typeof prev.marks === 'object' ? { ...prev.marks } : {};
  const now = new Date().toISOString();
  marks[stableKey] = now;
  const payload = { v: 1, marks, updatedAt: now };
  const up = await store.cacheUpsert([{ cache_key: TB_ROW_OK_CACHE_KEY, data: payload, updated_at: now }]);
  if (!up.ok) {
    return { ok: false, message: up.error || 'Không lưu được trạng thái OK.' };
  }
  return { ok: true, key: stableKey, markedAt: now };
}

export async function tbServerConfirmTransferRow({ batchId, rowIndex }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const id = toSafeString(batchId);
  const idx = Number(rowIndex);
  if (!id || !Number.isInteger(idx) || idx < 0) {
    return { ok: false, message: 'Tham số xác nhận không hợp lệ.' };
  }
  const batchKey = `${TB_TRANSFER_BATCH_PREFIX}${id}`;
  const foundGot = await store.cacheGet(batchKey);
  if (!foundGot.ok) return { ok: false, message: foundGot.error || 'Không đọc được batch lịch sử.' };
  const batch = normalizeTransferBatch(foundGot.row?.data || {});
  if (!Array.isArray(batch.rows) || idx >= batch.rows.length) {
    return { ok: false, message: 'Không tìm thấy dòng lịch sử cần xác nhận.' };
  }
  const now = new Date().toISOString();
  const row = { ...(batch.rows[idx] || {}) };
  row.xacNhan = true;
  row.thoiGianXacNhan = now;
  batch.rows[idx] = row;
  const up = await store.cacheUpsert([{ cache_key: batchKey, data: batch, updated_at: now }]);
  if (!up.ok) return { ok: false, message: up.error || 'Không xác nhận được lịch sử.' };
  return { ok: true };
}
