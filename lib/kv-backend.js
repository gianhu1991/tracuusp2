/**
 * Lưu trữ dùng chung: ưu tiên STORAGE_API_URL (máy chủ của bạn qua ngrok),
 * không có thì dùng Supabase như trước.
 */

const NGROK_SKIP = '69420';

export function useRemoteStorage() {
  const url = (process.env.STORAGE_API_URL || '').trim();
  const key = (process.env.STORAGE_API_KEY || '').trim();
  return !!(url && key);
}

export async function storageConfigured() {
  if (useRemoteStorage()) return true;
  return !!(await getSupabaseClient());
}

export async function storageMode() {
  if (useRemoteStorage()) return 'remote';
  if (await getSupabaseClient()) return 'supabase';
  return null;
}

async function getSupabaseClient() {
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

function remoteApiUrl() {
  return (process.env.STORAGE_API_URL || '').trim().replace(/\/+$/, '');
}

async function remoteCall(body) {
  const apiKey = (process.env.STORAGE_API_KEY || '').trim();
  const url = remoteApiUrl();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Storage-Key': apiKey,
        'ngrok-skip-browser-warning': NGROK_SKIP,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (e) {
    return { ok: false, error: e?.message || 'Không kết nối được máy chủ lưu trữ.' };
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      error: res.ok
        ? 'Máy chủ trả dữ liệu không hợp lệ.'
        : `Máy chủ lỗi HTTP ${res.status}.`,
    };
  }
  if (!res.ok || json.ok === false) {
    return { ok: false, error: json.error || json.message || `HTTP ${res.status}` };
  }
  return { ok: true, ...json };
}

/** @returns {Promise<import('./kv-backend').StorageAdapter|null>} */
export async function getStorageAdapter() {
  if (useRemoteStorage()) {
    return createRemoteAdapter();
  }
  const supabase = await getSupabaseClient();
  if (supabase) return createSupabaseAdapter(supabase);
  return null;
}

function createRemoteAdapter() {
  return {
    type: 'remote',
    async ping() {
      return remoteCall({ action: 'ping' });
    },
    async configGet(key) {
      const r = await remoteCall({ action: 'config_get', key });
      if (!r.ok) return { ok: false, error: r.error, value: null };
      return { ok: true, value: r.value ?? null };
    },
    async configSet(key, value) {
      const r = await remoteCall({ action: 'config_set', key, value });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async configDelete(key) {
      const r = await remoteCall({ action: 'config_delete', key });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async cacheGet(cacheKey) {
      const r = await remoteCall({ action: 'cache_get', cache_key: cacheKey });
      if (!r.ok) return { ok: false, error: r.error, row: null };
      return { ok: true, row: r.row ?? null };
    },
    async cacheUpsert(rows) {
      const r = await remoteCall({ action: 'cache_upsert', rows });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async cacheDeleteEq(cacheKey) {
      const r = await remoteCall({ action: 'cache_delete_eq', cache_key: cacheKey });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async cacheDeleteLike(prefix) {
      const r = await remoteCall({ action: 'cache_delete_like', prefix });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async cacheDeleteSp2Only() {
      const r = await remoteCall({ action: 'cache_delete_sp2_only' });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async cacheListPage({ offset = 0, limit = 1000, likePrefix = null }) {
      const r = await remoteCall({
        action: 'cache_list',
        offset,
        limit,
        prefix: likePrefix || undefined,
      });
      if (!r.ok) return { ok: false, error: r.error, rows: [] };
      return { ok: true, rows: Array.isArray(r.rows) ? r.rows : [] };
    },
  };
}

function createSupabaseAdapter(supabase) {
  return {
    type: 'supabase',
    async ping() {
      const { error } = await supabase.from('app_config').select('key').limit(1);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async configGet(key) {
      const { data, error } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
      if (error) return { ok: false, error: error.message, value: null };
      const value = data?.value;
      return { ok: true, value: value != null ? value : null };
    },
    async configSet(key, value) {
      const { error } = await supabase.from('app_config').upsert({ key, value }, { onConflict: 'key' });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async configDelete(key) {
      const { error } = await supabase.from('app_config').delete().eq('key', key);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async cacheGet(cacheKey) {
      const { data, error } = await supabase
        .from('sp2_port_cache')
        .select('cache_key,data,updated_at')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, row: null };
      if (!data) return { ok: true, row: null };
      return { ok: true, row: data };
    },
    async cacheUpsert(rows) {
      const { error } = await supabase.from('sp2_port_cache').upsert(rows, { onConflict: 'cache_key' });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async cacheDeleteEq(cacheKey) {
      const { error } = await supabase.from('sp2_port_cache').delete().eq('cache_key', cacheKey);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async cacheDeleteLike(prefix) {
      const { error } = await supabase.from('sp2_port_cache').delete().like('cache_key', `${prefix}%`);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async cacheDeleteSp2Only() {
      const tb = 'tb_subscriber_v1|%';
      const tr = 'tb_transfer_history_v1|%';
      const { error } = await supabase
        .from('sp2_port_cache')
        .delete()
        .not('cache_key', 'like', tb)
        .not('cache_key', 'like', tr);
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async cacheListPage({ offset = 0, limit = 1000, likePrefix = null }) {
      const to = offset + limit - 1;
      let q = supabase.from('sp2_port_cache').select('cache_key,data,updated_at').order('cache_key', { ascending: true });
      if (likePrefix) q = q.like('cache_key', `${likePrefix}%`);
      const { data, error } = await q.range(offset, to);
      if (error) return { ok: false, error: error.message, rows: [] };
      return { ok: true, rows: Array.isArray(data) ? data : [] };
    },
  };
}

export function storageNotConfiguredMessage() {
  if (useRemoteStorage()) {
    return 'Không kết nối được máy chủ lưu trữ (STORAGE_API_URL).';
  }
  return 'Chưa cấu hình Supabase hoặc STORAGE_API_URL trên server.';
}
