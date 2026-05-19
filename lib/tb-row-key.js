/** Khóa ổn định cho một dòng thuê bao (dùng chung client + server). */
export function tbStableRowKey(row) {
  const encode = (v) => encodeURIComponent(String(v ?? '').trim().toLowerCase());
  const nv = encode(row?.nvQL);
  const olt = encode(row?.olt);
  const slot = encode(row?.slot);
  const port = encode(row?.port);
  const account = encode(row?.account || row?.id || '');
  return `${nv}|${olt}|${slot}|${port}|${account}`;
}
