/**
 * Cache S2 trên Supabase (server). Dùng service role — chỉ gọi từ API route.
 */

const META_KEY = 'sp2_sync_meta';

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

export async function sp2ServerConfigured() {
  const c = await getClient();
  return !!c;
}

/** @returns {Promise<{ ok: boolean, hit?: boolean, data?: unknown[], message?: string }>} */
export async function sp2ServerGetPort(cacheKey) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase trên server.' };
  }
  const { data, error } = await supabase
    .from('sp2_port_cache')
    .select('data')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error) {
    return { ok: false, message: error.message || 'Lỗi đọc cache server.' };
  }
  if (!data) {
    return { ok: true, hit: false };
  }
  const arr = Array.isArray(data.data) ? data.data : [];
  return { ok: true, hit: true, data: arr };
}

export async function sp2ServerTruncate() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  const { error: rpcErr } = await supabase.rpc('truncate_sp2_port_cache');
  if (!rpcErr) {
    return { ok: true };
  }
  const { error: delErr } = await supabase.from('sp2_port_cache').delete().neq('cache_key', '');
  if (delErr) {
    return { ok: false, message: delErr.message || rpcErr.message || 'Không xóa được bảng cache.' };
  }
  return { ok: true };
}

/**
 * @param {Array<{ key: string, data: unknown[] }>} batch
 */
export async function sp2ServerUpsertBatch(batch) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.' };
  }
  const now = new Date().toISOString();
  const rows = batch.map((b) => ({
    cache_key: b.key,
    data: Array.isArray(b.data) ? b.data : [],
    updated_at: now,
  }));
  const { error } = await supabase.from('sp2_port_cache').upsert(rows, { onConflict: 'cache_key' });
  if (error) {
    return { ok: false, message: error.message || 'Lỗi ghi cache.' };
  }
  return { ok: true };
}

export async function sp2ServerGetMeta() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, meta: null };
  }
  const { data, error } = await supabase.from('app_config').select('value').eq('key', META_KEY).maybeSingle();
  if (error || !data?.value) {
    return { ok: true, meta: null };
  }
  try {
    const meta = JSON.parse(typeof data.value === 'string' ? data.value : '{}');
    return { ok: true, meta: meta && typeof meta === 'object' ? meta : null };
  } catch {
    return { ok: true, meta: null };
  }
}

export async function sp2ServerSetMeta(meta) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false };
  }
  const value = JSON.stringify(meta ?? {});
  const { error } = await supabase.from('app_config').upsert({ key: META_KEY, value }, { onConflict: 'key' });
  return { ok: !error };
}
