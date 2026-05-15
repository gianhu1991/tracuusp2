const KEY = 's2_renovation_proposals_v1';

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

export async function s2ProposalList() {
  const supabase = await getClient();
  if (!supabase) return { ok: false, message: 'Chưa cấu hình Supabase.', rows: [] };
  try {
    const rows = await readAll(supabase);
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, message: e?.message || 'Lỗi đọc đề xuất.', rows: [] };
  }
}

export async function s2ProposalAdd(entry) {
  const supabase = await getClient();
  if (!supabase) return { ok: false, message: 'Chưa cấu hình Supabase.' };
  try {
    const rows = await readAll(supabase);
    const row = normalizeRow({
      ...entry,
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
