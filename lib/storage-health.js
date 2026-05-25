import { formatSupabaseUserMessage } from './supabase-error-message';

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

/** Kiểm tra Vercel kết nối được Supabase (local tunnel hoặc cloud). */
export async function storageHealthCheck() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const hasKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  if (!url || !hasKey) {
    return {
      ok: false,
      message: 'Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel.',
      url: url || null,
    };
  }

  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Không tạo được client Supabase.', url };
  }

  try {
    const { error } = await supabase.from('app_config').select('key').limit(1);
    if (error) {
      return { ok: false, message: formatSupabaseUserMessage(error.message), url };
    }
    const { error: cacheErr } = await supabase.from('sp2_port_cache').select('cache_key').limit(1);
    if (cacheErr) {
      return {
        ok: false,
        message: formatSupabaseUserMessage(cacheErr.message, 'Chưa có bảng sp2_port_cache — chạy sql/app-schema.sql trên máy chủ data.'),
        url,
      };
    }
    return { ok: true, message: 'Kết nối Supabase OK.', url };
  } catch (e) {
    return { ok: false, message: formatSupabaseUserMessage(e?.message), url };
  }
}
