const TB_SHARED_KEY = 'tb_excel_shared_rows_v1';

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

export async function tbServerGetSharedRows() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', payload: null };
  }
  const { data, error } = await supabase
    .from('sp2_port_cache')
    .select('data,updated_at')
    .eq('cache_key', TB_SHARED_KEY)
    .maybeSingle();
  if (error) {
    return { ok: false, message: error.message || 'Lỗi đọc dữ liệu dùng chung.', payload: null };
  }
  if (!data?.data) {
    return { ok: true, payload: null };
  }
  try {
    const payload = data.data && typeof data.data === 'object' ? data.data : null;
    if (!payload) return { ok: true, payload: null };
    const rows = normalizeTbRows(payload?.rows);
    const uploadedAt = toSafeString(payload?.uploadedAt || data?.updated_at);
    return {
      ok: true,
      payload: {
        v: 1,
        fileName: toSafeString(payload?.fileName),
        uploadedAt,
        rows,
      },
    };
  } catch {
    return { ok: true, payload: null };
  }
}

export async function tbServerSetSharedRows({ fileName, rows }) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  const normalizedRows = normalizeTbRows(rows).slice(0, 20000);
  const now = new Date().toISOString();
  const payload = {
    v: 1,
    fileName: toSafeString(fileName),
    uploadedAt: now,
    rows: normalizedRows,
  };
  const { error } = await supabase
    .from('sp2_port_cache')
    .upsert({ cache_key: TB_SHARED_KEY, data: payload, updated_at: now }, { onConflict: 'cache_key' });
  if (error) {
    return { ok: false, message: error.message || 'Không lưu được dữ liệu dùng chung.' };
  }
  return { ok: true, payload };
}
