/** Lưu/đọc token OneBSS trên server (Supabase). Khi không cấu hình Supabase thì trả về rỗng / không lưu. */
const KEY = 'one_bss_authorization';

async function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key);
  } catch (_) {
    return null;
  }
}

export async function getStoredAuth() {
  const supabase = await getClient();
  if (!supabase) return '';
  try {
    const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
    if (error || !data) return '';
    return typeof data.value === 'string' ? data.value : '';
  } catch (_) {
    return '';
  }
}

export async function setStoredAuth(authorization) {
  const supabase = await getClient();
  if (!supabase) return false;
  try {
    const value = typeof authorization === 'string' ? authorization : '';
    const { error } = await supabase.from('app_config').upsert({ key: KEY, value }, { onConflict: 'key' });
    return !error;
  } catch (_) {
    return false;
  }
}
