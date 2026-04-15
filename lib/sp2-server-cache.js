/**
 * Cache S2 trên Supabase (server). Dùng service role — chỉ gọi từ API route.
 */

const META_KEY = 'sp2_sync_meta';
const BROWSE_KEY = 'sp2_browse_snapshot';

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
    await supabase.from('app_config').delete().eq('key', BROWSE_KEY);
    return { ok: true };
  }
  const { error: delErr } = await supabase.from('sp2_port_cache').delete().neq('cache_key', '');
  if (delErr) {
    return { ok: false, message: delErr.message || rpcErr.message || 'Không xóa được bảng cache.' };
  }
  await supabase.from('app_config').delete().eq('key', BROWSE_KEY);
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

export async function sp2ServerGetBrowseSnapshot() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, snapshot: null };
  }
  const { data, error } = await supabase.from('app_config').select('value').eq('key', BROWSE_KEY).maybeSingle();
  if (error || !data?.value) {
    return { ok: true, snapshot: null };
  }
  try {
    const snap = JSON.parse(typeof data.value === 'string' ? data.value : '{}');
    if (snap && typeof snap === 'object' && snap.v === 1) {
      return { ok: true, snapshot: snap };
    }
    return { ok: true, snapshot: null };
  } catch {
    return { ok: true, snapshot: null };
  }
}

export async function sp2ServerSetBrowseSnapshot(snapshot) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false };
  }
  const value = JSON.stringify(snapshot ?? {});
  const { error } = await supabase.from('app_config').upsert({ key: BROWSE_KEY, value }, { onConflict: 'key' });
  return { ok: !error };
}

/**
 * Thống kê theo Tổ KT:
 * - totalPorts: số cổng đã cache
 * - oneSp2Ports: số cổng có đúng 1 SP2
 * - ratioOneSp2: tỷ lệ oneSp2Ports / totalPorts
 */
export async function sp2ServerGetPonOneSp2StatsByToQL() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  }

  const byTo = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('sp2_port_cache')
      .select('cache_key,data')
      .order('cache_key', { ascending: true })
      .range(from, to);

    if (error) {
      return { ok: false, message: error.message || 'Lỗi đọc dữ liệu thống kê.', rows: [] };
    }
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parts = key.split('|');
      const toQL = parts[0] || '';
      if (!toQL) continue;

      const list = Array.isArray(row?.data) ? row.data : [];
      const stat = byTo.get(toQL) || { toQL, totalPorts: 0, oneSp2Ports: 0, withSp2Ports: 0 };
      stat.totalPorts += 1;
      if (list.length > 0) stat.withSp2Ports += 1;
      if (list.length === 1) stat.oneSp2Ports += 1;
      byTo.set(toQL, stat);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const rows = Array.from(byTo.values())
    .map((r) => ({
      ...r,
      ratioOneSp2: r.totalPorts > 0 ? r.oneSp2Ports / r.totalPorts : 0,
    }))
    .sort((a, b) => b.ratioOneSp2 - a.ratioOneSp2 || b.totalPorts - a.totalPorts);

  return { ok: true, rows };
}
