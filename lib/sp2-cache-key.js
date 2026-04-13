/** Khóa ổn định theo bộ lọc tra cứu (dùng chung client + API). */
export function sp2CacheKey(body) {
  const { toQL, veTinh, thietBiOlt, cardOlt, portOlt } = body;
  return [toQL, veTinh, thietBiOlt, cardOlt, portOlt]
    .map((v) => (v === undefined || v === null ? '' : String(v)))
    .join('|');
}
