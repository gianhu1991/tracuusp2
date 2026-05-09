const TB_SHARED_KEY = 'tb_subscriber_v1';
const TB_META_KEY = `${TB_SHARED_KEY}|meta`;
const TB_ROW_PREFIX = `${TB_SHARED_KEY}|row|`;
const TB_TRANSFER_KEY = 'tb_transfer_history_v1';
const TB_TRANSFER_META_KEY = `${TB_TRANSFER_KEY}|meta`;
const TB_TRANSFER_BATCH_PREFIX = `${TB_TRANSFER_KEY}|batch|`;

async function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key);
  } catch {
    return null;
  }
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
  return !!(await getClient());
}

function encodeKeyPart(v) {
  return encodeURIComponent(toSafeString(v).toLowerCase());
}

function makeTbRowKey(r) {
  const nv = encodeKeyPart(r?.nvQL);
  const olt = encodeKeyPart(r?.olt);
  const slot = encodeKeyPart(r?.slot);
  const port = encodeKeyPart(r?.port);
  const account = encodeKeyPart(r?.account || r?.id || `row-${Math.random().toString(36).slice(2, 10)}`);
  return `${TB_ROW_PREFIX}${nv}|${olt}|${slot}|${port}|${account}`;
}

function toDbRows(rows, uploadedAt) {
  const now = uploadedAt || new Date().toISOString();
  return normalizeTbRows(rows).map((r) => ({
    cache_key: makeTbRowKey(r),
    data: r,
    updated_at: now,
  }));
}

async function readLegacySingleRowOrChunkMeta(supabase) {
  const { data, error } = await supabase
    .from('sp2_port_cache')
    .select('data,updated_at')
    .eq('cache_key', 'tb_excel_shared_rows_v1|meta')
    .maybeSingle();
  const oldMetaObj = unwrapJsonbData(data?.data) || (typeof data?.data === 'object' ? data.data : null);
  if (!error && oldMetaObj && typeof oldMetaObj === 'object') {
    const oldMeta = oldMetaObj;
    const oldUploadId = toSafeString(oldMeta.uploadId);
    if (oldUploadId) {
      const { data: chunkRows } = await supabase
        .from('sp2_port_cache')
        .select('cache_key,data')
        .like('cache_key', `tb_excel_shared_rows_v1|chunk|${oldUploadId}|%`);
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
  const legacySingle = await supabase
    .from('sp2_port_cache')
    .select('data,updated_at')
    .eq('cache_key', 'tb_excel_shared_rows_v1')
    .maybeSingle();
  if (legacySingle.error || !legacySingle.data?.data) return null;
  const payload = unwrapJsonbData(legacySingle.data.data) || legacySingle.data.data;
  if (!payload || typeof payload !== 'object') return null;
  const legacyRows = normalizeTbRows(payload?.rows);
  if (!legacyRows.length) return null;
  return {
    v: 1,
    fileName: toSafeString(payload?.fileName),
    uploadedAt: toSafeString(payload?.uploadedAt || legacySingle.data?.updated_at),
    rows: legacyRows,
  };
}

/** Chunk upload Excel cũ (tb_excel_shared_rows_v1|chunk|...) không còn meta — gộp theo uploadId, chọn bộ có nhiều dòng nhất. */
const LEGACY_EXCEL_CHUNK_KEY_RE = /^tb_excel_shared_rows_v1\|chunk\|(.+)\|(\d+)$/;

async function recoverLegacyExcelOrphanChunks(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data: page, error } = await supabase
      .from('sp2_port_cache')
      .select('cache_key,data,updated_at')
      .like('cache_key', 'tb_excel_shared_rows_v1|chunk|%')
      .order('cache_key', { ascending: true })
      .range(from, to);
    if (error) {
      return { ok: false, message: error.message || 'Lỗi đọc chunk Excel cũ.', rows: [], latestUpdatedAt: '' };
    }
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
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
async function collectTbSubscriberRowsByPrefix(supabase) {
  const rows = [];
  let latestUpdatedAt = '';
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data: page, error: pageErr } = await supabase
      .from('sp2_port_cache')
      .select('data,updated_at')
      .like('cache_key', `${TB_ROW_PREFIX}%`)
      .order('cache_key', { ascending: true })
      .range(from, to);
    if (pageErr) {
      return { ok: false, message: pageErr.message || 'Lỗi đọc dữ liệu thuê bao.', rows: [], latestUpdatedAt: '' };
    }
    if (!Array.isArray(page) || page.length === 0) break;
    for (const r of page) {
      rows.push(unwrapJsonbData(r?.data) || {});
      const u = toSafeString(r?.updated_at);
      if (u && (!latestUpdatedAt || u > latestUpdatedAt)) latestUpdatedAt = u;
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return { ok: true, rows: normalizeTbRows(rows), latestUpdatedAt };
}

export async function tbServerGetSharedRows() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', payload: null };
  }

  const { data: metaRow, error: metaErr } = await supabase
    .from('sp2_port_cache')
    .select('data,updated_at')
    .eq('cache_key', TB_META_KEY)
    .maybeSingle();
  if (metaErr) {
    return { ok: false, message: metaErr.message || 'Lỗi đọc dữ liệu dùng chung.', payload: null };
  }

  const meta = unwrapJsonbData(metaRow?.data);
  if (meta && typeof meta === 'object') {
    const rows = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const to = from + pageSize - 1;
      const { data: page, error: pageErr } = await supabase
        .from('sp2_port_cache')
        .select('cache_key,data')
        .like('cache_key', `${TB_ROW_PREFIX}%`)
        .order('cache_key', { ascending: true })
        .range(from, to);
      if (pageErr) {
        return { ok: false, message: pageErr.message || 'Lỗi đọc dữ liệu thuê bao.', payload: null };
      }
      if (!Array.isArray(page) || page.length === 0) break;
      rows.push(...page.map((r) => unwrapJsonbData(r?.data) || {}));
      if (page.length < pageSize) break;
      from += pageSize;
    }
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
    const legacyWhenMetaStale = await readLegacySingleRowOrChunkMeta(supabase);
    if (legacyWhenMetaStale?.rows?.length) {
      return {
        ok: true,
        payload: {
          ...legacyWhenMetaStale,
          partialRecovery: true,
        },
      };
    }
    const orphansWhenMetaStale = await recoverLegacyExcelOrphanChunks(supabase);
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

  const recovered = await collectTbSubscriberRowsByPrefix(supabase);
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

  const legacy = await readLegacySingleRowOrChunkMeta(supabase);
  if (legacy?.rows?.length) {
    return { ok: true, payload: { ...legacy, partialRecovery: false } };
  }

  const orphanLegacy = await recoverLegacyExcelOrphanChunks(supabase);
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
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  const { error: delRowsErr } = await supabase.from('sp2_port_cache').delete().like('cache_key', `${TB_ROW_PREFIX}%`);
  if (delRowsErr) return { ok: false, message: delRowsErr.message || 'Không xóa được dữ liệu thuê bao cũ.' };
  await supabase.from('sp2_port_cache').delete().eq('cache_key', TB_META_KEY);
  return { ok: true };
}

export async function tbServerSaveSharedChunk({ uploadId, chunkIndex, rows, uploadedAt }) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  // Tránh lỗi PostgreSQL "ON CONFLICT ... cannot affect row a second time"
  // khi trong cùng 1 batch có nhiều phần tử trùng cache_key.
  const dbRowsRaw = toDbRows(rows, uploadedAt).slice(0, 1000);
  const dedupByKey = new Map();
  for (const r of dbRowsRaw) dedupByKey.set(r.cache_key, r);
  const dbRows = Array.from(dedupByKey.values());
  if (!dbRows.length) return { ok: true };
  const { error } = await supabase.from('sp2_port_cache').upsert(dbRows, { onConflict: 'cache_key' });
  if (error) return { ok: false, message: error.message || 'Không lưu được chunk dữ liệu.' };
  return { ok: true };
}

export async function tbServerFinalizeSharedUpload({ uploadId, fileName, totalChunks, totalCount, uploadedAt }) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
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
  const { error } = await supabase
    .from('sp2_port_cache')
    .upsert({ cache_key: TB_META_KEY, data: payload, updated_at: now }, { onConflict: 'cache_key' });
  if (error) return { ok: false, message: error.message || 'Không lưu được thông tin upload.' };
  return { ok: true, payload };
}

export async function tbServerSetSharedRows({ fileName, rows }) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
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
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', batches: [] };
  }
  const batches = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('sp2_port_cache')
      .select('cache_key,data')
      .like('cache_key', `${TB_TRANSFER_BATCH_PREFIX}%`)
      .order('cache_key', { ascending: true })
      .range(from, to);
    if (error) return { ok: false, message: error.message || 'Lỗi đọc lịch sử chuyển địa bàn.', batches: [] };
    if (!Array.isArray(data) || data.length === 0) break;
    batches.push(...data.map((r) => normalizeTransferBatch(r?.data || {})));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  batches.sort((a, b) => String(a.thoiGian || '').localeCompare(String(b.thoiGian || '')));
  return { ok: true, batches };
}

export async function tbServerAppendTransferBatch(batch) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  const normalized = normalizeTransferBatch(batch);
  if (!normalized.id) {
    return { ok: false, message: 'Thiếu id batch.' };
  }
  const now = new Date().toISOString();
  const batchKey = `${TB_TRANSFER_BATCH_PREFIX}${normalized.id}`;
  const { error: upsertBatchErr } = await supabase
    .from('sp2_port_cache')
    .upsert({ cache_key: batchKey, data: normalized, updated_at: now }, { onConflict: 'cache_key' });
  if (upsertBatchErr) return { ok: false, message: upsertBatchErr.message || 'Không lưu được batch lịch sử.' };

  const { data: oldMeta } = await supabase
    .from('sp2_port_cache')
    .select('data')
    .eq('cache_key', TB_TRANSFER_META_KEY)
    .maybeSingle();
  const prev = oldMeta?.data && typeof oldMeta.data === 'object' ? oldMeta.data : {};
  const meta = {
    v: 1,
    totalBatches: Number(prev.totalBatches || 0) + 1,
    totalRows: Number(prev.totalRows || 0) + normalized.rows.length,
    lastUpdatedAt: now,
  };
  await supabase
    .from('sp2_port_cache')
    .upsert({ cache_key: TB_TRANSFER_META_KEY, data: meta, updated_at: now }, { onConflict: 'cache_key' });
  return { ok: true };
}

export async function tbServerDeleteTransferRow({ batchId, rowIndex }) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  const id = toSafeString(batchId);
  const idx = Number(rowIndex);
  if (!id || !Number.isInteger(idx) || idx < 0) {
    return { ok: false, message: 'Tham số xóa không hợp lệ.' };
  }
  const batchKey = `${TB_TRANSFER_BATCH_PREFIX}${id}`;
  const { data: found, error: readErr } = await supabase
    .from('sp2_port_cache')
    .select('data')
    .eq('cache_key', batchKey)
    .maybeSingle();
  if (readErr) return { ok: false, message: readErr.message || 'Không đọc được batch lịch sử.' };
  const batch = normalizeTransferBatch(found?.data || {});
  if (!Array.isArray(batch.rows) || idx >= batch.rows.length) {
    return { ok: false, message: 'Không tìm thấy dòng lịch sử cần xóa.' };
  }
  batch.rows.splice(idx, 1);
  const now = new Date().toISOString();
  if (batch.rows.length === 0) {
    const { error: delErr } = await supabase.from('sp2_port_cache').delete().eq('cache_key', batchKey);
    if (delErr) return { ok: false, message: delErr.message || 'Không xóa được batch lịch sử.' };
  } else {
    const { error: upErr } = await supabase
      .from('sp2_port_cache')
      .upsert({ cache_key: batchKey, data: batch, updated_at: now }, { onConflict: 'cache_key' });
    if (upErr) return { ok: false, message: upErr.message || 'Không cập nhật được batch lịch sử.' };
  }

  // Cập nhật nhanh meta bằng cách quét tổng.
  const { data: allRows, error: allErr } = await supabase
    .from('sp2_port_cache')
    .select('data')
    .like('cache_key', `${TB_TRANSFER_BATCH_PREFIX}%`);
  if (!allErr) {
    const batches = Array.isArray(allRows) ? allRows : [];
    const totalBatches = batches.length;
    const totalRows = batches.reduce((n, r) => n + normalizeTransferBatch(r?.data || {}).rows.length, 0);
    const meta = { v: 1, totalBatches, totalRows, lastUpdatedAt: now };
    await supabase
      .from('sp2_port_cache')
      .upsert({ cache_key: TB_TRANSFER_META_KEY, data: meta, updated_at: now }, { onConflict: 'cache_key' });
  }
  return { ok: true };
}

export async function tbServerConfirmTransferRow({ batchId, rowIndex }) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  const id = toSafeString(batchId);
  const idx = Number(rowIndex);
  if (!id || !Number.isInteger(idx) || idx < 0) {
    return { ok: false, message: 'Tham số xác nhận không hợp lệ.' };
  }
  const batchKey = `${TB_TRANSFER_BATCH_PREFIX}${id}`;
  const { data: found, error: readErr } = await supabase
    .from('sp2_port_cache')
    .select('data')
    .eq('cache_key', batchKey)
    .maybeSingle();
  if (readErr) return { ok: false, message: readErr.message || 'Không đọc được batch lịch sử.' };
  const batch = normalizeTransferBatch(found?.data || {});
  if (!Array.isArray(batch.rows) || idx >= batch.rows.length) {
    return { ok: false, message: 'Không tìm thấy dòng lịch sử cần xác nhận.' };
  }
  const now = new Date().toISOString();
  const row = { ...(batch.rows[idx] || {}) };
  row.xacNhan = true;
  row.thoiGianXacNhan = now;
  batch.rows[idx] = row;
  const { error: upErr } = await supabase
    .from('sp2_port_cache')
    .upsert({ cache_key: batchKey, data: batch, updated_at: now }, { onConflict: 'cache_key' });
  if (upErr) return { ok: false, message: upErr.message || 'Không xác nhận được lịch sử.' };
  return { ok: true };
}
