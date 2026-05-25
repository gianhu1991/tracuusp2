import { formatSupabaseUserMessage } from './supabase-error-message';
import { getStorageAdapter, storageMode, useRemoteStorage } from './kv-backend';

/** Kiểm tra Vercel kết nối được máy chủ lưu trữ (ngrok/Apache hoặc Supabase). */
export async function storageHealthCheck() {
  if (useRemoteStorage()) {
    const url = (process.env.STORAGE_API_URL || '').trim();
    const store = await getStorageAdapter();
    if (!store) {
      return {
        ok: false,
        message: 'Không tạo được client lưu trữ từ xa.',
        url,
        mode: 'remote',
      };
    }
    const ping = await store.ping();
    if (!ping.ok) {
      return {
        ok: false,
        message: ping.error || 'Không ping được api.php — kiểm tra ngrok và file app-data/api.php.',
        url,
        mode: 'remote',
      };
    }
    return {
      ok: true,
      message: 'Kết nối máy chủ lưu trữ (ngrok) OK.',
      url,
      mode: 'remote',
    };
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const hasKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  if (!url || !hasKey) {
    return {
      ok: false,
      message: 'Thiếu STORAGE_API_URL hoặc NEXT_PUBLIC_SUPABASE_URL trên Vercel.',
      url: url || null,
      mode: null,
    };
  }

  const store = await getStorageAdapter();
  if (!store) {
    return { ok: false, message: 'Không tạo được client Supabase.', url, mode: 'supabase' };
  }

  try {
    const ping = await store.ping();
    if (!ping.ok) {
      return { ok: false, message: formatSupabaseUserMessage(ping.error), url, mode: 'supabase' };
    }
    const cache = await store.cacheListPage({ offset: 0, limit: 1 });
    if (!cache.ok) {
      return {
        ok: false,
        message: formatSupabaseUserMessage(
          cache.error,
          'Chưa có bảng sp2_port_cache — chạy sql/app-schema.sql hoặc dùng STORAGE_API_URL.'
        ),
        url,
        mode: 'supabase',
      };
    }
    const mode = await storageMode();
    return { ok: true, message: 'Kết nối Supabase OK.', url, mode };
  } catch (e) {
    return { ok: false, message: formatSupabaseUserMessage(e?.message), url, mode: 'supabase' };
  }
}
