/**
 * Quét toàn bộ: Tổ KT → Trạm BTS → OLT → Card → Port, gọi tra cứu từng port.
 * Lưu IndexedDB (máy này) hoặc Supabase (cache chung) khi có mật khẩu quản trị.
 */

import { sp2CacheKey } from './sp2-cache-key';
import {
  authFingerprint,
  clearPortsCache,
  putPortCache,
  setSyncMeta,
} from './sp2-local-cache';

async function postSp2CacheApi(password, payload) {
  const res = await fetch('/api/sp2-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.message || `Lỗi API cache server (${res.status}).`);
  }
  return data;
}

const TTVT_MAC_DINH = 'Trung tâm viễn thông Nho Quan';

function normaliseList(res) {
  if (Array.isArray(res)) return res;
  if (res?.data && Array.isArray(res.data)) return res.data;
  if (res?.result && Array.isArray(res.result)) return res.result;
  if (res?.list && Array.isArray(res.list)) return res.list;
  if (res?.listCardOlt && Array.isArray(res.listCardOlt)) return res.listCardOlt;
  if (res?.listCard && Array.isArray(res.listCard)) return res.listCard;
  if (res?.listPortOlt && Array.isArray(res.listPortOlt)) return res.listPortOlt;
  if (res?.listPort && Array.isArray(res.listPort)) return res.listPort;
  if (res?.listOlt && Array.isArray(res.listOlt)) return res.listOlt;
  if (res?.olt && Array.isArray(res.olt)) return res.olt;
  if (res?.listToKyThuat && Array.isArray(res.listToKyThuat)) return res.listToKyThuat;
  if (res?.toKyThuat && Array.isArray(res.toKyThuat)) return res.toKyThuat;
  if (res?.listVeTinh && Array.isArray(res.listVeTinh)) return res.listVeTinh;
  if (res?.veTinh && Array.isArray(res.veTinh)) return res.veTinh;
  if (res?.danhSach && Array.isArray(res.danhSach)) return res.danhSach;
  return [];
}

function optionValue(item) {
  if (typeof item === 'string') return item;
  const v =
    item?.donviId ??
    item?.DONVI_ID ??
    item?.THIETBI_ID ??
    item?.CARD_ID ??
    item?.SLOT_ID ??
    item?.PORTVL_ID ??
    item?.VITRI ??
    item?.OLT_ID ??
    item?.id ??
    item?.ma ??
    item?.value ??
    item?.code ??
    (item?.TEN_TB != null && item.TEN_TB !== '' ? item.TEN_TB : '');
  return v !== undefined && v !== null ? String(v) : '';
}

function cardOltValueFromItem(item) {
  if (typeof item === 'string') return item;
  const keyVal = item?.KEY;
  const idFromKey =
    typeof keyVal === 'string' && keyVal.includes('#') ? keyVal.split('#')[1]?.trim() || keyVal : null;
  const v =
    idFromKey ??
    item?.CARD_ID ??
    item?.THIETBI_ID ??
    item?.SLOT_ID ??
    item?.PORTVL_ID ??
    item?.VITRI ??
    item?.TEN_TB ??
    item?.id ??
    item?.ma ??
    item?.value ??
    item?.code ??
    '';
  return v !== undefined && v !== null ? String(v) : '';
}

function portOltValueFromItem(item) {
  if (typeof item === 'number') return String(item);
  if (typeof item === 'string') return item;
  const v = item?.PORTVL_ID ?? item?.VITRI ?? item?.id ?? item?.value ?? '';
  return v !== undefined && v !== null ? String(v) : '';
}

/**
 * Dựng danh sách tác vụ (mỗi tác vụ = một port cần gọi tra cứu).
 */
export async function buildSp2SyncTasks(auth, signal) {
  const headers = { Authorization: (auth && String(auth).trim()) || '' };
  const tasks = [];

  const resTo = await fetch('/api/danh-sach?loai=to_ky_thuat', { headers, signal });
  const dataTo = await resTo.json().catch(() => ({}));
  if (!resTo.ok) {
    throw new Error(dataTo?.message || dataTo?.error || `Không tải danh sách Tổ KT (${resTo.status}).`);
  }
  const listTo = normaliseList(dataTo);

  for (const toItem of listTo) {
    if (signal.aborted) break;
    const toQL = optionValue(toItem);
    if (!toQL) continue;

    const urlTram = `/api/danh-sach?loai=tram_bts&toKyThuat=${encodeURIComponent(toQL)}`;
    const resTram = await fetch(urlTram, { headers, signal });
    const dataTram = await resTram.json().catch(() => ({}));
    if (!resTram.ok) continue;
    const listTram = normaliseList(dataTram);
    if (dataTram?.message && !Array.isArray(dataTram) && !dataTram?.data) continue;

    for (const tramItem of listTram) {
      if (signal.aborted) break;
      const veTinh = optionValue(tramItem);
      if (!veTinh) continue;

      const urlOlt = `/api/danh-sach?loai=olt&toKyThuat=${encodeURIComponent(toQL)}&tramBts=${encodeURIComponent(veTinh)}`;
      const resOlt = await fetch(urlOlt, { headers, signal });
      const dataOlt = await resOlt.json().catch(() => ({}));
      if (!resOlt.ok) continue;
      const listOlt = normaliseList(dataOlt);

      for (const oltItem of listOlt) {
        if (signal.aborted) break;
        const thietBiOlt = optionValue(oltItem);
        if (!thietBiOlt) continue;

        const urlCard = `/api/danh-sach?loai=card_olt&olt=${encodeURIComponent(thietBiOlt)}`;
        const resCard = await fetch(urlCard, { headers, signal });
        const dataCard = await resCard.json().catch(() => ({}));
        if (!resCard.ok) continue;
        let listCard = normaliseList(dataCard);
        if (Array.isArray(listCard) && listCard.length > 0) {
          const first = listCard[0];
          const nested = first?.cards ?? first?.listCard ?? first?.danhSach ?? first?.data;
          if (Array.isArray(nested)) {
            listCard = listCard.flatMap((item) =>
              item?.cards ?? item?.listCard ?? item?.danhSach ?? item?.data ?? [item]
            );
          }
        }

        for (const cardItem of listCard) {
          if (signal.aborted) break;
          const cardOlt = cardOltValueFromItem(cardItem);
          if (!cardOlt) continue;

          const urlPort = `/api/danh-sach?loai=port_olt&cardOlt=${encodeURIComponent(cardOlt)}`;
          const resPort = await fetch(urlPort, { headers, signal });
          const dataPort = await resPort.json().catch(() => ({}));
          if (!resPort.ok) continue;
          const listPort = normaliseList(dataPort);

          for (const portItem of listPort) {
            if (signal.aborted) break;
            const portOlt = portOltValueFromItem(portItem);
            if (!portOlt) continue;

            const body = {
              ttvt: TTVT_MAC_DINH,
              toQL,
              veTinh,
              thietBiOlt,
              cardOlt,
              portOlt,
            };
            tasks.push({
              body,
              label: `${toQL}/${veTinh}/${thietBiOlt}/${cardOlt}/${portOlt}`,
            });
          }
        }
      }
    }
  }

  return tasks;
}

/**
 * Chạy đồng bộ: xóa cache port cũ, quét và ghi từng port.
 * @param {object} opts
 * @param {string} opts.auth
 * @param {AbortSignal} opts.signal
 * @param {(p: { phase: string, done: number, total: number, label?: string }) => void} [opts.onProgress]
 * @param {number} [opts.delayMs] khoảng nghỉ giữa các lần gọi tra cứu
 * @param {{ adminPassword: string, batchSize?: number } | null} [opts.server] có mật khẩu quản trị → ghi Supabase (mọi người dùng đọc được)
 */
export async function runFullSp2Sync({ auth, signal, onProgress, delayMs = 100, server = null }) {
  const trimmed = (auth && String(auth).trim()) || '';
  const adminPwd = server?.adminPassword && String(server.adminPassword).trim();
  const serverMode = !!adminPwd;
  const batchSize = Math.min(80, Math.max(5, Number(server?.batchSize) || 25));

  const fp = await authFingerprint(trimmed);

  if (serverMode) {
    await postSp2CacheApi(adminPwd, { action: 'clear' });
    await postSp2CacheApi(adminPwd, {
      action: 'meta',
      meta: {
        lastSyncAt: null,
        lastSyncTotal: null,
        lastSyncS2Total: null,
        lastSyncErrors: null,
        lastSyncAborted: null,
        source: 'server',
      },
    });
  } else {
    await clearPortsCache();
    await setSyncMeta({
      authFingerprint: fp,
      lastSyncAt: null,
      lastSyncTotal: null,
      lastSyncS2Total: null,
      lastSyncErrors: null,
      lastSyncAborted: null,
    });
  }

  let pendingBatch = [];
  const flushServerBatch = async () => {
    if (!serverMode || pendingBatch.length === 0) return;
    const batch = pendingBatch;
    pendingBatch = [];
    await postSp2CacheApi(adminPwd, { action: 'batch', batch });
  };

  onProgress?.({ phase: 'scan', done: 0, total: 0, label: 'Đang quét danh mục (Tổ KT → … → Port)…', s2Count: 0 });
  const tasks = await buildSp2SyncTasks(trimmed, signal);

  if (signal.aborted) {
    if (serverMode) {
      await postSp2CacheApi(adminPwd, {
        action: 'meta',
        meta: {
          lastSyncAborted: true,
          lastSyncAt: Date.now(),
          lastSyncTotal: 0,
          lastSyncS2Total: 0,
          lastSyncErrors: 0,
          source: 'server',
        },
      });
    } else {
      await setSyncMeta({
        lastSyncAborted: true,
        lastSyncAt: Date.now(),
        lastSyncTotal: 0,
        lastSyncS2Total: 0,
        lastSyncErrors: 0,
      });
    }
    return { aborted: true, errors: 0, total: 0, completed: 0, server: serverMode };
  }

  onProgress?.({
    phase: 'tracuu',
    done: 0,
    total: tasks.length,
    label: `Bắt đầu tra cứu ${tasks.length} port…`,
    s2Count: 0,
  });

  let errors = 0;
  let totalS2 = 0;
  let portsDone = 0;
  for (let i = 0; i < tasks.length; i++) {
    if (signal.aborted) break;
    const t = tasks[i];
    const key = sp2CacheKey(t.body);
    try {
      const res = await fetch('/api/tracuu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: trimmed },
        body: JSON.stringify(t.body),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      const listRaw = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
      const list = Array.isArray(listRaw) ? listRaw : [];
      if (!res.ok) {
        errors += 1;
        if (serverMode) {
          pendingBatch.push({ key, data: [] });
          if (pendingBatch.length >= batchSize) await flushServerBatch();
        } else {
          await putPortCache(key, fp, []);
        }
      } else {
        totalS2 += list.length;
        if (serverMode) {
          pendingBatch.push({ key, data: list });
          if (pendingBatch.length >= batchSize) await flushServerBatch();
        } else {
          await putPortCache(key, fp, list);
        }
      }
    } catch {
      errors += 1;
      try {
        if (serverMode) {
          pendingBatch.push({ key, data: [] });
          if (pendingBatch.length >= batchSize) await flushServerBatch();
        } else {
          await putPortCache(key, fp, []);
        }
      } catch {
        /* ignore */
      }
    }

    portsDone = i + 1;
    onProgress?.({
      phase: 'tracuu',
      done: portsDone,
      total: tasks.length,
      label: t.label,
      s2Count: totalS2,
    });

    if (delayMs > 0 && i < tasks.length - 1 && !signal.aborted) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  await flushServerBatch();

  if (serverMode) {
    await postSp2CacheApi(adminPwd, {
      action: 'meta',
      meta: {
        lastSyncAt: Date.now(),
        lastSyncTotal: tasks.length,
        lastSyncS2Total: totalS2,
        lastSyncErrors: errors,
        lastSyncAborted: signal.aborted,
        source: 'server',
      },
    });
  } else {
    await setSyncMeta({
      authFingerprint: fp,
      lastSyncAt: Date.now(),
      lastSyncTotal: tasks.length,
      lastSyncS2Total: totalS2,
      lastSyncErrors: errors,
      lastSyncAborted: signal.aborted,
    });
  }

  return {
    aborted: signal.aborted,
    errors,
    total: tasks.length,
    completed: portsDone,
    server: serverMode,
    totalS2,
  };
}
