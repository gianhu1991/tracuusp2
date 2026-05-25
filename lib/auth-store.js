/** Lưu/đọc Authorization dùng chung trên server (Supabase). */
const KEY = 'one_bss_authorization';
/** Fallback khi bảng app_config chưa có hoặc lỗi ghi — dùng bảng sp2_port_cache (thường đã tạo khi đồng bộ S2/TB). */
const AUTH_CACHE_KEY = `app_config|${KEY}`;

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

function readValueFromPortCacheRow(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data.trim();
  if (typeof data === 'object' && typeof data.value === 'string') return data.value.trim();
  return '';
}

export async function getStoredAuth() {
  const supabase = await getClient();
  if (!supabase) return '';

  try {
    const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
    if (!error && data?.value && typeof data.value === 'string') {
      return data.value.trim();
    }
  } catch {
    /* fallback */
  }

  try {
    const { data, error } = await supabase
      .from('sp2_port_cache')
      .select('data')
      .eq('cache_key', AUTH_CACHE_KEY)
      .maybeSingle();
    if (!error && data) {
      return readValueFromPortCacheRow(data.data);
    }
  } catch {
    /* ignore */
  }

  return '';
}

/**
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function setStoredAuth(authorization) {
  const supabase = await getClient();
  if (!supabase) {
    return {
      ok: false,
      message: 'Server chưa có NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_ANON_KEY).',
    };
  }

  const value = typeof authorization === 'string' ? authorization.trim() : '';
  if (!value) {
    return { ok: false, message: 'Token trống.' };
  }

  const now = new Date().toISOString();
  let cfgErrMsg = '';

  try {
    const { error } = await supabase.from('app_config').upsert({ key: KEY, value }, { onConflict: 'key' });
    if (!error) return { ok: true };
    cfgErrMsg = error.message || 'Lỗi ghi app_config.';
  } catch (e) {
    cfgErrMsg = e?.message || 'Lỗi ghi app_config.';
  }

  try {
    const { error } = await supabase
      .from('sp2_port_cache')
      .upsert(
        { cache_key: AUTH_CACHE_KEY, data: { value }, updated_at: now },
        { onConflict: 'cache_key' }
      );
    if (!error) return { ok: true };
    return {
      ok: false,
      message:
        `${cfgErrMsg ? `${cfgErrMsg} ` : ''}${error.message || 'Lỗi ghi sp2_port_cache.'} `
        + 'Chạy SQL tạo bảng app_config (xem VERCEL-SETUP.md) hoặc kiểm tra SUPABASE_SERVICE_ROLE_KEY trên Vercel.',
    };
  } catch (e) {
    return {
      ok: false,
      message: cfgErrMsg || e?.message || 'Không lưu được token lên Supabase.',
    };
  }
}
