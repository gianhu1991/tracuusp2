import { sp2ServerLookupS2Rows } from './sp2-server-cache';

const KEY = 's2_renovation_proposals_v1';

function normS2Key(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
}

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

function safeStr(v) {
  return v == null ? '' : String(v).trim();
}

function normalizeRow(row) {
  return {
    id: safeStr(row?.id) || crypto.randomUUID(),
    tenSp2: safeStr(row?.tenSp2),
    diaChi: safeStr(row?.diaChi),
    latitude: row?.latitude == null ? null : Number(row.latitude),
    longitude: row?.longitude == null ? null : Number(row.longitude),
    toaDo: safeStr(row?.toaDo),
    tenNvDiaBan: safeStr(row?.tenNvDiaBan),
    deXuat: safeStr(row?.deXuat),
    createdAt: safeStr(row?.createdAt) || new Date().toISOString(),
  };
}

async function readAll(supabase) {
  const { data, error } = await supabase.from('app_config').select('value').eq('key', KEY).maybeSingle();
  if (error) throw new Error(error.message || 'Lỗi đọc đề xuất.');
  if (!data?.value) return [];
  try {
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed.map(normalizeRow) : [];
  } catch {
    return [];
  }
}

async function writeAll(supabase, rows) {
  const value = JSON.stringify(rows);
  const { error } = await supabase.from('app_config').upsert({ key: KEY, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message || 'Lỗi ghi đề xuất.');
}

export async function s2ProposalConfigured() {
  return !!(await getClient());
}

/** Lấy DIACHI splitter từ cache đồng bộ (ưu tiên hơn JWT nếu client không gửi). */
export async function resolveDiaChiForS2(tenSp2, preferred = '') {
  const pref = safeStr(preferred);
  if (pref) return pref;
  const code = safeStr(tenSp2);
  if (!code) return '';
  const lookup = await sp2ServerLookupS2Rows([code]);
  if (!lookup.ok || !Array.isArray(lookup.rows) || lookup.rows.length === 0) return '';
  const targetNorm = normS2Key(code);
  const exact = lookup.rows.find((r) => {
    if (!safeStr(r.diaChi)) return false;
    return (
      normS2Key(r.kyHieu) === targetNorm ||
      normS2Key(r.tenSplitter) === targetNorm ||
      normS2Key(r.queryS2) === targetNorm
    );
  });
  const pick = exact || lookup.rows.find((r) => safeStr(r.diaChi));
  return safeStr(pick?.diaChi);
}

async function enrichProposalRowsWithDiaChi(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const missingCodes = [
    ...new Set(list.filter((r) => !safeStr(r.diaChi) && safeStr(r.tenSp2)).map((r) => safeStr(r.tenSp2))),
  ];
  if (missingCodes.length === 0) return list;
  const lookup = await sp2ServerLookupS2Rows(missingCodes);
  if (!lookup.ok) return list;
  const map = new Map();
  for (const r of lookup.rows || []) {
    const dc = safeStr(r.diaChi);
    if (!dc) continue;
    for (const key of [r.queryS2, r.kyHieu, r.tenSplitter]) {
      const k = normS2Key(key);
      if (k && !map.has(k)) map.set(k, dc);
    }
  }
  return list.map((row) => {
    if (safeStr(row.diaChi)) return row;
    const dc = map.get(normS2Key(row.tenSp2));
    return dc ? { ...row, diaChi: dc } : row;
  });
}

export async function s2ProposalList() {
  const supabase = await getClient();
  if (!supabase) return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  try {
    const rows = await readAll(supabase);
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const enriched = await enrichProposalRowsWithDiaChi(rows);
    return { ok: true, rows: enriched };
  } catch (e) {
    return { ok: false, message: e?.message || 'Lỗi đọc đề xuất.', rows: [] };
  }
}

export async function s2ProposalAdd(entry) {
  const supabase = await getClient();
  if (!supabase) return { ok: false, message: 'Chưa cấu hình Supabase.' };
  try {
    const diaChi = await resolveDiaChiForS2(entry?.tenSp2, entry?.diaChi);
    const rows = await readAll(supabase);
    const row = normalizeRow({
      ...entry,
      diaChi,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    rows.unshift(row);
    await writeAll(supabase, rows);
    return { ok: true, row };
  } catch (e) {
    return { ok: false, message: e?.message || 'Không lưu được đề xuất.' };
  }
}

export async function s2ProposalDeleteById(id) {
  const supabase = await getClient();
  if (!supabase) return { ok: false, message: 'Chưa cấu hình Supabase.' };
  const targetId = safeStr(id);
  if (!targetId) return { ok: false, message: 'Thiếu id đề xuất.' };
  try {
    const rows = await readAll(supabase);
    const next = rows.filter((r) => safeStr(r?.id) !== targetId);
    if (next.length === rows.length) {
      return { ok: false, message: 'Không tìm thấy đề xuất để xóa.' };
    }
    await writeAll(supabase, next);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message || 'Không xóa được đề xuất.' };
  }
}
