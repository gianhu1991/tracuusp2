const TB_SHARED_KEY = 'tb_subscriber_v1';
const TB_META_KEY = `${TB_SHARED_KEY}|meta`;
const TB_ROW_PREFIX = `${TB_SHARED_KEY}|row|`;

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
  if (!error && data?.data && typeof data.data === 'object') {
    const oldMeta = data.data;
    const oldUploadId = toSafeString(oldMeta.uploadId);
    if (oldUploadId) {
      const { data: chunkRows } = await supabase
        .from('sp2_port_cache')
        .select('cache_key,data')
        .like('cache_key', `tb_excel_shared_rows_v1|chunk|${oldUploadId}|%`);
      const rows = (Array.isArray(chunkRows) ? chunkRows : [])
        .map((x) => normalizeTbRows(x?.data?.rows))
        .flat();
      return {
        v: 1,
        fileName: toSafeString(oldMeta.fileName),
        uploadedAt: toSafeString(oldMeta.uploadedAt || data?.updated_at),
        rows,
      };
    }
  }
  const legacySingle = await supabase
    .from('sp2_port_cache')
    .select('data,updated_at')
    .eq('cache_key', 'tb_excel_shared_rows_v1')
    .maybeSingle();
  if (legacySingle.error || !legacySingle.data?.data || typeof legacySingle.data.data !== 'object') return null;
  const payload = legacySingle.data.data;
  return {
    v: 1,
    fileName: toSafeString(payload?.fileName),
    uploadedAt: toSafeString(payload?.uploadedAt || legacySingle.data?.updated_at),
    rows: normalizeTbRows(payload?.rows),
  };
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

  const meta = metaRow?.data && typeof metaRow.data === 'object' ? metaRow.data : null;
  if (meta) {
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
      rows.push(...page.map((r) => r?.data || {}));
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return {
      ok: true,
      payload: {
        v: 1,
        fileName: toSafeString(meta.fileName),
        uploadedAt: toSafeString(meta.uploadedAt || metaRow?.updated_at),
        rows: normalizeTbRows(rows),
      },
    };
  }

  const legacy = await readLegacySingleRowOrChunkMeta(supabase);
  if (legacy) return { ok: true, payload: legacy };
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
