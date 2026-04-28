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

/**
 * Danh sách chi tiết cổng PON có đúng 1 SP2.
 * Mỗi dòng gồm thông tin định danh cổng + tên SP2.
 */
export async function sp2ServerGetPonOneSp2DetailRows() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  }

  const rows = [];
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
      return { ok: false, message: error.message || 'Lỗi đọc dữ liệu chi tiết.', rows: [] };
    }
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      const parts = key.split('|');
      const toQL = parts[0] || '';
      const veTinh = parts[1] || '';
      const thietBiOlt = parts[2] || '';
      const cardOlt = parts[3] || '';
      const portOlt = parts[4] || '';
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length !== 1) continue;

      const only = list[0] || {};
      const tenSp2 = only?.TEN_KC ?? only?.KYHIEU ?? only?.ten ?? only?.name ?? '';
      rows.push({
        toQL,
        veTinh,
        thietBiOlt,
        cardOlt,
        portOlt,
        tenSp2: tenSp2 != null ? String(tenSp2) : '',
        cacheKey: key,
      });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  rows.sort((a, b) =>
    a.toQL.localeCompare(b.toQL) ||
    a.veTinh.localeCompare(b.veTinh) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt)
  );

  return { ok: true, rows };
}

/**
 * Danh sách chi tiết cache theo OLT + cổng PON.
 * Mỗi dòng gồm định danh cổng, số lượng SP2 và tên SP2 (nối bằng "; ").
 */
export async function sp2ServerGetPonSp2DetailRowsByOlt() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  }

  const rows = [];
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
      return { ok: false, message: error.message || 'Lỗi đọc dữ liệu chi tiết OLT/PON.', rows: [] };
    }
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      if (!key) continue;
      const parts = key.split('|');
      const toQL = parts[0] || '';
      const veTinh = parts[1] || '';
      const thietBiOlt = parts[2] || '';
      const cardOlt = parts[3] || '';
      const portOlt = parts[4] || '';
      const list = Array.isArray(row?.data) ? row.data : [];
      const sp2Names = list
        .map((item) => item?.TEN_KC ?? item?.KYHIEU ?? item?.ten ?? item?.name ?? '')
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter(Boolean);
      rows.push({
        toQL,
        veTinh,
        thietBiOlt,
        cardOlt,
        portOlt,
        sp2Count: list.length,
        tenSp2List: sp2Names.join('; '),
        cacheKey: key,
      });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  rows.sort((a, b) =>
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt) ||
    a.toQL.localeCompare(b.toQL) ||
    a.veTinh.localeCompare(b.veTinh)
  );

  return { ok: true, rows };
}

/**
 * Danh sách cổng PON KHÔNG có S2.
 * Dùng cho báo cáo theo Tổ KT/OLT.
 */
export async function sp2ServerGetPonNoSp2DetailRows() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  }

  const rows = [];
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
      return { ok: false, message: error.message || 'Lỗi đọc dữ liệu cổng không có S2.', rows: [] };
    }
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      if (!key) continue;
      const parts = key.split('|');
      const toQL = parts[0] || '';
      const veTinh = parts[1] || '';
      const thietBiOlt = parts[2] || '';
      const cardOlt = parts[3] || '';
      const portOlt = parts[4] || '';
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length !== 0) continue;
      rows.push({
        toQL,
        veTinh,
        thietBiOlt,
        cardOlt,
        portOlt,
        sp2Count: 0,
        cacheKey: key,
      });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  rows.sort((a, b) =>
    a.toQL.localeCompare(b.toQL) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt) ||
    a.veTinh.localeCompare(b.veTinh)
  );

  return { ok: true, rows };
}

function pickFirstDefined(item, keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim() !== '') {
      return item[key];
    }
  }
  return undefined;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Danh sách chi tiết dung lượng S2 theo từng splitter đã cache.
 */
export async function sp2ServerGetS2CapacityRows() {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  }

  const rows = [];
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
      return { ok: false, message: error.message || 'Lỗi đọc dữ liệu dung lượng S2.', rows: [] };
    }
    if (!Array.isArray(data) || data.length === 0) break;

    for (const row of data) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      if (!key) continue;
      const parts = key.split('|');
      const toQL = parts[0] || '';
      const veTinh = parts[1] || '';
      const thietBiOlt = parts[2] || '';
      const cardOlt = parts[3] || '';
      const portOlt = parts[4] || '';
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length === 0) continue;

      for (const item of list) {
        const tenSplitter = pickFirstDefined(item, ['TEN_KC', 'TEN_SPLITTER', 'TEN_SP', 'ten', 'name', 'TEN']);
        const kyHieu = pickFirstDefined(item, ['KYHIEU', 'KY_HIEU', 'ky_hieu', 'MA_SP', 'ID_SPLITTER']);
        const capSp = pickFirstDefined(item, ['CAP_SP', 'cap_sp', 'Cap_Sp', 'CAP']);
        const dungLuongRaw = pickFirstDefined(item, ['DUNGLUONG', 'DUNG_LUONG', 'DUNG_LUONG_TOI_DA', 'SO_CONG', 'TONG_CONG', 'SUC_CHUA']);
        const daDungRaw = pickFirstDefined(item, ['DLSD', 'DA_DUNG', 'SO_DA_DUNG', 'SL_DA_DUNG', 'SO_CONG_DA_DUNG', 'DA_SU_DUNG', 'USED']);
        const chuaDungRaw = pickFirstDefined(item, ['DLROI', 'CHUA_DUNG', 'SO_CHUA_DUNG', 'SL_CHUA_DUNG', 'SO_CONG_CHUA_DUNG', 'CON_LAI', 'AVAILABLE']);

        let dungLuong = toNumberOrNull(dungLuongRaw);
        let daDung = toNumberOrNull(daDungRaw);
        let chuaDung = toNumberOrNull(chuaDungRaw);
        if (chuaDung == null && dungLuong != null && daDung != null) chuaDung = Math.max(0, dungLuong - daDung);
        if (daDung == null && dungLuong != null && chuaDung != null) daDung = Math.max(0, dungLuong - chuaDung);

        if (dungLuong == null && daDung == null && chuaDung == null) continue;

        rows.push({
          toQL,
          veTinh,
          thietBiOlt,
          cardOlt,
          portOlt,
          tenSplitter: tenSplitter != null ? String(tenSplitter) : '',
          kyHieu: kyHieu != null ? String(kyHieu) : '',
          capSp: capSp != null ? String(capSp) : '',
          dungLuong,
          daDung,
          chuaDung,
          ngayCapNhat: pickFirstDefined(item, ['NGAY CN', 'NGAY_CAP_NHAT', 'NGAY_CN', 'UPDATED_AT', 'ngayCapNhat']) ?? '',
          diaChi: pickFirstDefined(item, ['DIA_CHI', 'DIACHI', 'DIA_CHI_LAP_DAT']) ?? '',
          cacheKey: key,
        });
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  rows.sort((a, b) =>
    a.toQL.localeCompare(b.toQL) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt) ||
    a.kyHieu.localeCompare(b.kyHieu)
  );
  return { ok: true, rows };
}

function normalizeS2Text(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export async function sp2ServerLookupS2Rows(inputCodes = []) {
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  }

  const normalizedInputs = Array.from(new Set(
    (Array.isArray(inputCodes) ? inputCodes : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));
  if (normalizedInputs.length === 0) {
    return { ok: true, rows: [] };
  }

  const queryTargets = normalizedInputs.map((raw) => ({
    raw,
    norm: normalizeS2Text(raw),
  })).filter((item) => item.norm);

  const rows = [];
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
      return { ok: false, message: error.message || 'Lỗi đọc dữ liệu tra cứu S2.', rows: [] };
    }
    if (!Array.isArray(data) || data.length === 0) break;

    for (const row of data) {
      const key = typeof row?.cache_key === 'string' ? row.cache_key : '';
      if (!key) continue;
      const parts = key.split('|');
      const toQL = parts[0] || '';
      const veTinh = parts[1] || '';
      const thietBiOlt = parts[2] || '';
      const cardOlt = parts[3] || '';
      const portOlt = parts[4] || '';
      const list = Array.isArray(row?.data) ? row.data : [];
      if (list.length === 0) continue;

      for (const item of list) {
        const kyHieu = String(pickFirstDefined(item, ['KYHIEU', 'KY_HIEU', 'ky_hieu', 'MA_SP', 'ID_SPLITTER']) || '').trim();
        const tenSplitter = String(pickFirstDefined(item, ['TEN_KC', 'TEN_SPLITTER', 'TEN_SP', 'ten', 'name', 'TEN']) || '').trim();
        const kyHieuNorm = normalizeS2Text(kyHieu);
        const tenNorm = normalizeS2Text(tenSplitter);
        if (!kyHieuNorm && !tenNorm) continue;

        for (const target of queryTargets) {
          const isMatch = (
            (kyHieuNorm && (kyHieuNorm === target.norm || kyHieuNorm.includes(target.norm) || target.norm.includes(kyHieuNorm))) ||
            (tenNorm && (tenNorm === target.norm || tenNorm.includes(target.norm) || target.norm.includes(tenNorm)))
          );
          if (!isMatch) continue;
          rows.push({
            queryS2: target.raw,
            toQL,
            veTinh,
            thietBiOlt,
            cardOlt,
            portOlt,
            kyHieu,
            tenSplitter,
            cacheKey: key,
          });
        }
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  rows.sort((a, b) =>
    a.queryS2.localeCompare(b.queryS2) ||
    a.toQL.localeCompare(b.toQL) ||
    a.thietBiOlt.localeCompare(b.thietBiOlt) ||
    a.cardOlt.localeCompare(b.cardOlt) ||
    a.portOlt.localeCompare(b.portOlt)
  );
  return { ok: true, rows };
}
