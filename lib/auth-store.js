import { formatSupabaseUserMessage } from './supabase-error-message';
import { getStorageAdapter, storageNotConfiguredMessage, storageConfigured } from './kv-backend';

/** Lưu/đọc Authorization dùng chung trên server. */
const KEY = 'one_bss_authorization';
const AUTH_CACHE_KEY = `app_config|${KEY}`;

function readValueFromPortCacheRow(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data.trim();
  if (typeof data === 'object' && typeof data.value === 'string') return data.value.trim();
  return '';
}

export async function getStoredAuth() {
  const store = await getStorageAdapter();
  if (!store) return '';

  const cfg = await store.configGet(KEY);
  if (cfg.ok && cfg.value && typeof cfg.value === 'string') {
    return cfg.value.trim();
  }

  const cached = await store.cacheGet(AUTH_CACHE_KEY);
  if (cached.ok && cached.row) {
    return readValueFromPortCacheRow(cached.row.data);
  }

  return '';
}

/**
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function setStoredAuth(authorization) {
  if (!(await storageConfigured())) {
    return {
      ok: false,
      message: storageNotConfiguredMessage(),
    };
  }

  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: storageNotConfiguredMessage() };
  }

  const value = typeof authorization === 'string' ? authorization.trim() : '';
  if (!value) {
    return { ok: false, message: 'Token trống.' };
  }

  const now = new Date().toISOString();
  let cfgErrMsg = '';

  const cfg = await store.configSet(KEY, value);
  if (cfg.ok) return { ok: true };
  cfgErrMsg = cfg.error || 'Lỗi ghi app_config.';

  const cache = await store.cacheUpsert([
    { cache_key: AUTH_CACHE_KEY, data: { value }, updated_at: now },
  ]);
  if (cache.ok) return { ok: true };

  return {
    ok: false,
    message: formatSupabaseUserMessage(cfgErrMsg, cache.error),
  };
}
