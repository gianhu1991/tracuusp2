/**
 * Quét toàn bộ: Tổ KT → Trạm BTS → OLT → Card → Port, gọi tra cứu từng port.
 * Lưu IndexedDB (máy này) hoặc Supabase (cache chung) khi bật chế độ ghi server.
 */

import { sp2CacheKey } from './sp2-cache-key';
import { authHeadersForOneBss } from './authorization-expiry';
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
 * Dựng danh sách tác vụ + snapshot danh mục (GET /api/sp2-cache?browse=1).
 */
export async function buildSp2SyncTasksAndBrowse(auth, signal) {
  const headers = authHeadersForOneBss(auth);
  const tasks = [];
  const browse = {
    v: 1,
    ttvtMacDinh: TTVT_MAC_DINH,
    toKyThuat: [],
    tramByTo: {},
    oltByTram: {},
    cardByOlt: {},
    portByCard: {},
  };

  const resTo = await fetch('/api/danh-sach?loai=to_ky_thuat', { headers, signal });
  const dataTo = await resTo.json().catch(() => ({}));
  if (!resTo.ok) {
    throw new Error(dataTo?.message || dataTo?.error || `Không tải danh sách Tổ KT (${resTo.status}).`);
  }
  const listTo = normaliseList(dataTo);
  browse.toKyThuat = listTo;

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
    browse.tramByTo[toQL] = listTram;

    for (const tramItem of listTram) {
      if (signal.aborted) break;
      const veTinh = optionValue(tramItem);
      if (!veTinh) continue;

      const urlOlt = `/api/danh-sach?loai=olt&toKyThuat=${encodeURIComponent(toQL)}&tramBts=${encodeURIComponent(veTinh)}`;
      const resOlt = await fetch(urlOlt, { headers, signal });
      const dataOlt = await resOlt.json().catch(() => ({}));
      if (!resOlt.ok) continue;
      const listOlt = normaliseList(dataOlt);
      browse.oltByTram[`${toQL}|${veTinh}`] = listOlt;

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
        browse.cardByOlt[thietBiOlt] = listCard;

        for (const cardItem of listCard) {
          if (signal.aborted) break;
          const cardOlt = cardOltValueFromItem(cardItem);
          if (!cardOlt) continue;

          const urlPort = `/api/danh-sach?loai=port_olt&cardOlt=${encodeURIComponent(cardOlt)}`;
          const resPort = await fetch(urlPort, { headers, signal });
          const dataPort = await resPort.json().catch(() => ({}));
          if (!resPort.ok) continue;
          const listPort = normaliseList(dataPort);
          browse.portByCard[cardOlt] = listPort;

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

  return { tasks, browse };
}

export async function buildSp2SyncTasks(auth, signal) {
  const { tasks } = await buildSp2SyncTasksAndBrowse(auth, signal);
  return tasks;
}

/**
 * Chạy đồng bộ: xóa cache port cũ, quét và ghi từng port.
 * @param {object} opts
 * @param {string} opts.auth
 * @param {AbortSignal} opts.signal
 * @param {(p: { phase: string, done: number, total: number, label?: string }) => void} [opts.onProgress]
 * @param {number} [opts.delayMs] nghỉ (ms) sau mỗi **lô** port, không phải từng port (mặc định 35)
 * @param {number} [opts.concurrency] số port gọi tra cứu **song song** mỗi lô (mặc định 5, tối đa 12)
 * @param {{ adminPassword: string, batchSize?: number } | null} [opts.server] bật thì ghi Supabase (cache chung)
 */
export async function runFullSp2Sync({
  auth,
  signal,
  onProgress,
  delayMs = 35,
  concurrency: concurrencyOpt,
  server = null,
}) {
  const trimmed = (auth && String(auth).trim()) || '';
  const adminPwd = server?.adminPassword && String(server.adminPassword).trim();
  const serverMode = !!adminPwd;
  const batchSize = Math.min(80, Math.max(5, Number(server?.batchSize) || 25));
  const concurrency = Math.min(12, Math.max(1, Math.floor(Number(concurrencyOpt) || 5)));

  const fp = await authFingerprint(trimmed);

  const syncStartedAt = Date.now();
  let portsDone = 0;
  let errors = 0;
  let totalS2 = 0;
  let syncTaskTotal = 0;

  let pendingBatch = [];
  const flushServerBatch = async () => {
    if (!serverMode || pendingBatch.length === 0) return;
    const batch = pendingBatch;
    pendingBatch = [];
    await postSp2CacheApi(adminPwd, { action: 'batch', batch });
  };

  onProgress?.({ phase: 'scan', done: 0, total: 0, label: 'Đang quét danh mục (Tổ KT → … → Port)…', s2Count: 0 });
  const { tasks, browse } = await buildSp2SyncTasksAndBrowse(trimmed, signal);
  syncTaskTotal = tasks.length;

  if (tasks.length === 0) {
    throw new Error(
      'Không quét được port nào (Authorization sai hoặc hết hạn). Cache Supabase không bị xóa — cập nhật Authorization rồi đồng bộ lại.'
    );
  }

  if (serverMode) {
    await postSp2CacheApi(adminPwd, { action: 'clear' });
    await postSp2CacheApi(adminPwd, {
      action: 'meta',
      meta: {
        lastSyncInProgress: true,
        lastSyncStartedAt: syncStartedAt,
        lastSyncAt: null,
        lastSyncCompleted: 0,
        lastSyncTotal: syncTaskTotal,
        lastSyncS2Total: 0,
        lastSyncErrors: 0,
        lastSyncAborted: false,
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

  const pushServerSyncProgress = async (final = false) => {
    if (!serverMode) return;
    await postSp2CacheApi(adminPwd, {
      action: 'meta',
      meta: {
        lastSyncInProgress: !final,
        lastSyncStartedAt: syncStartedAt,
        lastSyncAt: final ? Date.now() : null,
        lastSyncCompleted: portsDone,
        lastSyncTotal: syncTaskTotal,
        lastSyncS2Total: totalS2,
        lastSyncErrors: errors,
        lastSyncAborted: !!signal.aborted,
        source: 'server',
      },
    });
  };

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

  if (serverMode && browse?.toKyThuat?.length) {
    try {
      await postSp2CacheApi(adminPwd, { action: 'set_browse', snapshot: browse });
      await pushServerSyncProgress(false);
    } catch (e) {
      onProgress?.({
        phase: 'scan',
        done: 0,
        total: 0,
        label: `Cảnh báo: không lưu được snapshot danh mục — ${e.message || 'lỗi'}`,
        s2Count: 0,
      });
    }
  }

  onProgress?.({
    phase: 'tracuu',
    done: 0,
    total: tasks.length,
    label: `Bắt đầu tra cứu ${tasks.length} port…`,
    s2Count: 0,
  });

  for (let i = 0; i < tasks.length; i += concurrency) {
    if (signal.aborted) break;
    const slice = tasks.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      slice.map(async (t) => {
        const key = sp2CacheKey(t.body);
        try {
          const res = await fetch('/api/tracuu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeadersForOneBss(trimmed) },
            body: JSON.stringify(t.body),
            signal,
          });
          const data = await res.json().catch(() => ({}));
          const listRaw = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
          const list = Array.isArray(listRaw) ? listRaw : [];
          return { key, list, ok: res.ok, label: t.label };
        } catch {
          return { key, list: [], ok: false, label: t.label };
        }
      })
    );

    for (const r of chunkResults) {
      if (!r.ok) {
        errors += 1;
        try {
          if (serverMode) {
            pendingBatch.push({ key: r.key, data: [] });
            if (pendingBatch.length >= batchSize) await flushServerBatch();
          } else {
            await putPortCache(r.key, fp, []);
          }
        } catch {
          /* ignore */
        }
      } else {
        totalS2 += r.list.length;
        try {
          if (serverMode) {
            pendingBatch.push({ key: r.key, data: r.list });
            if (pendingBatch.length >= batchSize) await flushServerBatch();
          } else {
            await putPortCache(r.key, fp, r.list);
          }
        } catch {
          /* ignore */
        }
      }
    }

    portsDone = Math.min(i + slice.length, tasks.length);
    const lastLabel = slice[slice.length - 1]?.label ?? '';
    onProgress?.({
      phase: 'tracuu',
      done: portsDone,
      total: tasks.length,
      label: lastLabel,
      s2Count: totalS2,
    });

    if (serverMode && (portsDone % 40 === 0 || portsDone >= tasks.length)) {
      try {
        await pushServerSyncProgress(false);
      } catch {
        /* ignore */
      }
    }

    if (delayMs > 0 && i + concurrency < tasks.length && !signal.aborted) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  await flushServerBatch();

  if (serverMode) {
    /** Bắt buộc ghi meta hoàn tất; nếu lỗi thì ném ra để UI báo (tránh tưởng đã cập nhật «đồng bộ lúc…» trên Supabase). */
    await pushServerSyncProgress(true);
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
