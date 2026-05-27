/** Chuẩn hóa mã/ tên S2 để so khớp (bỏ khoảng trắng, chữ hoa). */
export function normalizeS2Text(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * So khớp một bản ghi S2 với mã tra cứu.
 * @returns {{ match: boolean, matchType: 'exact'|'partial'|null }}
 */
export function matchS2Query({ query, kyHieu = '', tenSplitter = '', fuzzyMatch = false }) {
  const queryNorm = normalizeS2Text(query);
  if (!queryNorm) return { match: false, matchType: null };
  const kyNorm = normalizeS2Text(kyHieu);
  const tenNorm = normalizeS2Text(tenSplitter);
  const exact = (kyNorm && kyNorm === queryNorm) || (tenNorm && tenNorm === queryNorm);
  if (exact) return { match: true, matchType: 'exact' };
  if (!fuzzyMatch) return { match: false, matchType: null };
  const partial =
    (kyNorm && kyNorm.includes(queryNorm)) ||
    (tenNorm && tenNorm.includes(queryNorm));
  return partial ? { match: true, matchType: 'partial' } : { match: false, matchType: null };
}
