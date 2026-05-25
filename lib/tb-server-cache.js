import { tbStableRowKey } from './tb-row-key';
import { getStorageAdapter, storageConfigured, storageNotConfiguredMessage } from './kv-backend';

const TB_SHARED_KEY = 'tb_subscriber_v1';
const TB_META_KEY = `${TB_SHARED_KEY}|meta`;
const TB_ROW_PREFIX = `${TB_SHARED_KEY}|row|`;
const TB_ROW_OK_CACHE_KEY = `${TB_SHARED_KEY}|row_ok`;
const TB_TRANSFER_KEY = 'tb_transfer_history_v1';
const TB_TRANSFER_META_KEY = `${TB_TRANSFER_KEY}|meta`;
const TB_TRANSFER_BATCH_PREFIX = `${TB_TRANSFER_KEY}|batch|`;

async function listCacheByPrefix(store, prefix) {
  const rows = [];
  const pageSize = 1000;
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

  const metaGot = await store.cacheGet(TB_META_KEY);
  if (!metaGot.ok) {
    return { ok: false, message: metaGot.error || 'Lỗi đọc dữ liệu dùng chung.', payload: null };
  }
  const metaRow = metaGot.row;

  const meta = unwrapJsonbData(metaRow?.data);
  if (meta && typeof meta === 'object') {
    const listed = await listCacheByPrefix(store, TB_ROW_PREFIX);
    if (!listed.ok) {
      return { ok: false, message: listed.error || 'Lỗi đọc dữ liệu thuê bao.', payload: null };
    }
    const rows = listed.rows.map((r) => unwrapJsonbData(r?.data) || {});
    const normalized = normalizeTbRows(rows);
    if (normalized.length > 0) {
      return {
        ok: true,
        payload: {
          v: 1,
          fileName: toSafeString(meta.fileName),
          uploadedAt: toSafeString(meta.uploadedAt || metaRow?.updated_at),
          rows: normalized,
          partialRecovery: false,
        },
      };
    }
    const legacyWhenMetaStale = await readLegacySingleRowOrChunkMeta(store);
    if (legacyWhenMetaStale?.rows?.length) {
      return {
        ok: true,
        payload: {
          ...legacyWhenMetaStale,
          partialRecovery: true,
        },
      };
    }
    const orphansWhenMetaStale = await recoverLegacyExcelOrphanChunks(store);
    if (orphansWhenMetaStale.ok && orphansWhenMetaStale.rows.length > 0) {
      return {
        ok: true,
        payload: {
          v: 1,
          fileName: 'Upload Excel cũ chưa chốt (đã khôi phục từ chunk)',
          uploadedAt: toSafeString(orphansWhenMetaStale.latestUpdatedAt),
          rows: orphansWhenMetaStale.rows,
          partialRecovery: true,
        },
      };
    }
    return {
      ok: true,
      payload: {
        v: 1,
        fileName: toSafeString(meta.fileName),
        uploadedAt: toSafeString(meta.uploadedAt || metaRow?.updated_at),
        rows: [],
        partialRecovery: true,
        emptyReason: 'meta_no_rows',
      },
    };
  }

  const recovered = await collectTbSubscriberRowsByPrefix(store);
  if (recovered.ok && recovered.rows.length > 0) {
    return {
      ok: true,
      payload: {
        v: 1,
        fileName: 'Upload chưa hoàn tất (đã khôi phục phần đã lưu)',
        uploadedAt: toSafeString(recovered.latestUpdatedAt),
        rows: recovered.rows,
        partialRecovery: true,
      },
    };
  }

  const legacy = await readLegacySingleRowOrChunkMeta(store);
  if (legacy?.rows?.length) {
    return { ok: true, payload: { ...legacy, partialRecovery: false } };
  }

  const orphanLegacy = await recoverLegacyExcelOrphanChunks(store);
  if (orphanLegacy.ok && orphanLegacy.rows.length > 0) {
    return {
      ok: true,
      payload: {
        v: 1,
        fileName: 'Upload Excel cũ chưa chốt (đã khôi phục từ chunk)',
        uploadedAt: toSafeString(orphanLegacy.latestUpdatedAt),
        rows: orphanLegacy.rows,
        partialRecovery: true,
      },
    };
  }

  return { ok: true, payload: null };
}

export async function tbServerClearSharedChunks() {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const delRows = await store.cacheDeleteLike(TB_ROW_PREFIX);
  if (!delRows.ok) return { ok: false, message: delRows.error || 'Không xóa được dữ liệu thuê bao cũ.' };
  await store.cacheDeleteEq(TB_META_KEY);
  return { ok: true };
}

export async function tbServerSaveSharedChunk({ uploadId, chunkIndex, rows, uploadedAt }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const dbRowsRaw = toDbRows(rows, uploadedAt).slice(0, 1000);
  const dedupByKey = new Map();
  for (const r of dbRowsRaw) dedupByKey.set(r.cache_key, r);
  const dbRows = Array.from(dedupByKey.values());
  if (!dbRows.length) return { ok: true };
  const up = await store.cacheUpsert(dbRows);
  if (!up.ok) return { ok: false, message: up.error || 'Không lưu được chunk dữ liệu.' };
  return { ok: true };
}

export async function tbServerFinalizeSharedUpload({ uploadId, fileName, totalChunks, totalCount, uploadedAt }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const now = uploadedAt || new Date().toISOString();
  const payload = {
    v: 1,
    uploadId: toSafeString(uploadId),
    fileName: toSafeString(fileName),
    totalChunks: Number(totalChunks || 0),
    totalCount: Number(totalCount || 0),
    uploadedAt: now,
  };
  const up = await store.cacheUpsert([{ cache_key: TB_META_KEY, data: payload, updated_at: now }]);
  if (!up.ok) return { ok: false, message: up.error || 'Không lưu được thông tin upload.' };
  return { ok: true, payload };
}

export async function tbServerSetSharedRows({ fileName, rows }) {
  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }
  const normalizedRows = normalizeTbRows(rows).slice(0, 20000);
  const now = new Date().toISOString();
  const uploadId = `single-${Date.now()}`;
  const cleared = await tbServerClearSharedChunks();
  if (!cleared.ok) return cleared;
  const batchSize = 1000;
  for (let i = 0; i < normalizedRows.length; i += batchSize) {
    const batch = normalizedRows.slice(i, i + batchSize);
    const saved = await tbServerSaveSharedChunk({
      uploadId,
      chunkIndex: i / batchSize,
      rows: batch,
      uploadedAt: now,
    });
    if (!saved.ok) return saved;
  }
  const finalized = await tbServerFinalizeSharedUpload({
    uploadId,
    fileName: toSafeString(fileName),
    totalChunks: Math.max(1, Math.ceil(normalizedRows.length / batchSize)),
    totalCount: normalizedRows.length,
    uploadedAt: now,
  });
  if (!finalized.ok) return finalized;
  return { ok: true, payload: { fileName: toSafeString(fileName), uploadedAt: now, rows: normalizedRows } };
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
