'use client';

import { useState, useEffect, useRef } from 'react';
import { authFingerprint, getPortCache, getSyncMeta, sp2CacheKey } from '../lib/sp2-local-cache';
import { runFullSp2Sync } from '../lib/sp2-full-sync';

const PLACEHOLDER = '-- Chọn --';

/** TTVT mặc định theo OneBSS (trang tra cứu splitter theo port OLT). */
const TTVT_MAC_DINH = 'Trung tâm viễn thông Nho Quan';
const STORAGE_AUTH = 'tracuu_sp2_authorization';
const STORAGE_AUTH_UNLOCKED = 'tracuu_sp2_auth_unlocked';
const AUTH_AUTO_LOCK_MS = 5 * 60 * 1000;
const REPORT_MENU_ITEMS = [
  {
    id: 's2_capacity',
    label: 'Dung lượng S2',
    description: 'Theo dõi dung lượng, đã dùng, chưa dùng của splitter S2.',
  },
  {
    id: 'no_sp2_ports',
    label: 'Cổng PON không có S2',
    description: 'Báo cáo theo Tổ kỹ thuật và OLT các cổng chưa có S2.',
  },
  {
    id: 'olt_pon_detail',
    label: 'Chi tiết S2 theo OLT/PON',
    description: 'Xem chi tiết cổng PON theo OLT và xuất Excel theo OLT.',
  },
  {
    id: 'pon_one_sp2',
    label: 'Tỷ lệ cổng PON có đúng 1 SP2',
    description: 'Theo dõi tỷ lệ 1 SP2 theo Tổ KT và xuất Excel.',
  },
];

export default function TraCuuSP2Page() {
  const [ttvt, setTtvt] = useState(TTVT_MAC_DINH);
  const [veTinh, setVeTinh] = useState('');
  const [cardOlt, setCardOlt] = useState('');
  const [toQL, setToQL] = useState('');
  const [thietBiOlt, setThietBiOlt] = useState('');
  const [portOlt, setPortOlt] = useState('');
  const [useTtvt, setUseTtvt] = useState(true);
  const [useVeTinh, setUseVeTinh] = useState(true);
  const [useCardOlt, setUseCardOlt] = useState(true);
  const [useToQL, setUseToQL] = useState(true);
  const [useThietBiOlt, setUseThietBiOlt] = useState(true);
  const [usePortOlt, setUsePortOlt] = useState(true);

  const [loading, setLoading] = useState(false);
  const [ketQua, setKetQua] = useState(null);
  const [loi, setLoi] = useState(null);

  const [authorization, setAuthorization] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [showReportPanel, setShowReportPanel] = useState(false);
  const [unlockToOpenReport, setUnlockToOpenReport] = useState(false);
  const [activeReportId, setActiveReportId] = useState(REPORT_MENU_ITEMS[0].id);
  const [authUnlocked, setAuthUnlocked] = useState(false);
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authPasswordError, setAuthPasswordError] = useState('');
  const [authUnlocking, setAuthUnlocking] = useState(false);
  const [adminPasswordForServer, setAdminPasswordForServer] = useState('');
  const [saveToServerStatus, setSaveToServerStatus] = useState('');
  const [saveToServerMessage, setSaveToServerMessage] = useState('');

  const [listTtvt, setListTtvt] = useState([]);
  const [listToQL, setListToQL] = useState([]);
  const [listVeTinh, setListVeTinh] = useState([]);
  const [listCardOlt, setListCardOlt] = useState([]);
  const [listThietBiOlt, setListThietBiOlt] = useState([]);
  const [listPortOlt, setListPortOlt] = useState([]);
  const [loadingPortOlt, setLoadingPortOlt] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');
  /** Snapshot danh mục từ server (lưu lúc đồng bộ S2) — dùng khi API OneBSS / token lỗi. */
  const [browseSnapshot, setBrowseSnapshot] = useState(null);
  const browseSnapshotRef = useRef(null);
  const [showCopyToast, setShowCopyToast] = useState(false);

  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [lastSyncInfo, setLastSyncInfo] = useState(null);
  const [chiTrongCache, setChiTrongCache] = useState(false);
  const [boQuaCache, setBoQuaCache] = useState(false);
  const [adminPasswordForSync, setAdminPasswordForSync] = useState('');
  const [serverSyncMeta, setServerSyncMeta] = useState(null);
  const [ponOneSp2Stats, setPonOneSp2Stats] = useState([]);
  const [ponStatsLoading, setPonStatsLoading] = useState(false);
  const [ponStatsError, setPonStatsError] = useState('');
  const [ponExporting, setPonExporting] = useState(false);
  const [ponExportToQl, setPonExportToQl] = useState('');
  const [oltPonDetailRows, setOltPonDetailRows] = useState([]);
  const [oltPonToOptions, setOltPonToOptions] = useState([]);
  const [oltPonOptions, setOltPonOptions] = useState([]);
  const [oltPonLoading, setOltPonLoading] = useState(false);
  const [oltPonError, setOltPonError] = useState('');
  const [oltPonExporting, setOltPonExporting] = useState(false);
  const [oltPonToFilter, setOltPonToFilter] = useState('');
  const [oltPonFilter, setOltPonFilter] = useState('');
  const [oltPonPage, setOltPonPage] = useState(1);
  const [oltPonPageSize, setOltPonPageSize] = useState(10);
  const [noSp2Rows, setNoSp2Rows] = useState([]);
  const [noSp2ToOptions, setNoSp2ToOptions] = useState([]);
  const [noSp2OltOptions, setNoSp2OltOptions] = useState([]);
  const [noSp2ToFilter, setNoSp2ToFilter] = useState('');
  const [noSp2OltFilter, setNoSp2OltFilter] = useState('');
  const [noSp2Loading, setNoSp2Loading] = useState(false);
  const [noSp2Error, setNoSp2Error] = useState('');
  const [noSp2Exporting, setNoSp2Exporting] = useState(false);
  const [noSp2Page, setNoSp2Page] = useState(1);
  const [noSp2PageSize, setNoSp2PageSize] = useState(10);
  const [s2CapacityRows, setS2CapacityRows] = useState([]);
  const [s2CapacityToOptions, setS2CapacityToOptions] = useState([]);
  const [s2CapacityOltOptions, setS2CapacityOltOptions] = useState([]);
  const [s2CapacityToFilter, setS2CapacityToFilter] = useState('');
  const [s2CapacityOltFilter, setS2CapacityOltFilter] = useState('');
  const [s2CapacityLoading, setS2CapacityLoading] = useState(false);
  const [s2CapacityError, setS2CapacityError] = useState('');
  const [s2CapacityExporting, setS2CapacityExporting] = useState(false);
  const [s2CapacityPage, setS2CapacityPage] = useState(1);
  const [s2CapacityPageSize, setS2CapacityPageSize] = useState(10);
  const syncAbortRef = useRef(null);
  const reportMenuRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthorization(localStorage.getItem(STORAGE_AUTH) || '');
      setAuthUnlocked(sessionStorage.getItem(STORAGE_AUTH_UNLOCKED) === '1');
    }
  }, []);

  useEffect(() => {
    if (!authUnlocked) return;
    const t = setTimeout(() => {
      setAuthUnlocked(false);
      setShowReportPanel(false);
      setUnlockToOpenReport(false);
      if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_AUTH_UNLOCKED);
      setAuthPasswordError('Phiên mở khóa đã hết hạn sau 5 phút. Vui lòng nhập lại mật khẩu.');
    }, AUTH_AUTO_LOCK_MS);
    return () => clearTimeout(t);
  }, [authUnlocked]);

  useEffect(() => {
    if (!showReportMenu) return;
    const handleClickOutside = (event) => {
      if (reportMenuRef.current && !reportMenuRef.current.contains(event.target)) {
        setShowReportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showReportMenu]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await getSyncMeta();
        const fp = await authFingerprint(authorization || '');
        if (cancelled) return;
        if (meta?.authFingerprint && fp && meta.authFingerprint === fp) {
          setLastSyncInfo(meta);
        } else {
          setLastSyncInfo(null);
        }
      } catch {
        if (!cancelled) setLastSyncInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [authorization]);

  async function refreshServerMeta() {
    try {
      const res = await fetch('/api/sp2-cache?meta=1');
      const j = await res.json().catch(() => ({}));
      if (j.ok) setServerSyncMeta(j.meta ?? null);
      else setServerSyncMeta(null);
    } catch {
      setServerSyncMeta(null);
    }
  }

  useEffect(() => {
    refreshServerMeta();
  }, []);

  useEffect(() => {
    browseSnapshotRef.current = browseSnapshot;
  }, [browseSnapshot]);

  async function refreshBrowseSnapshot() {
    try {
      const res = await fetch('/api/sp2-cache?browse=1');
      const j = await res.json().catch(() => ({}));
      if (res.status === 503 || !j.ok) {
        setBrowseSnapshot(null);
        return;
      }
      if (j.snapshot && j.snapshot.v === 1) setBrowseSnapshot(j.snapshot);
      else setBrowseSnapshot(null);
    } catch {
      setBrowseSnapshot(null);
    }
  }

  useEffect(() => {
    refreshBrowseSnapshot();
  }, []);

  async function refreshPonOneSp2Stats() {
    setPonStatsLoading(true);
    setPonStatsError('');
    try {
      const res = await fetch('/api/sp2-cache?stats=1');
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setPonOneSp2Stats([]);
        setPonStatsError(j.message || `Không tải được thống kê (${res.status}).`);
        return;
      }
      setPonOneSp2Stats(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setPonOneSp2Stats([]);
      setPonStatsError(e?.message || 'Lỗi tải thống kê.');
    } finally {
      setPonStatsLoading(false);
    }
  }

  const handleExportPonOneSp2Excel = async () => {
    setPonExporting(true);
    setPonStatsError('');
    try {
      const q = new URLSearchParams({ stats: 'one_sp2_excel' });
      if (ponExportToQl) q.set('toQL', ponExportToQl);
      const res = await fetch(`/api/sp2-cache?${q.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Không xuất được Excel (${res.status}).`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('content-disposition') || '';
      const m = dispo.match(/filename="([^"]+)"/i);
      const filename = m?.[1] || `pon_1sp2_chi_tiet_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPonStatsError(e?.message || 'Lỗi xuất Excel.');
    } finally {
      setPonExporting(false);
    }
  };

  async function refreshOltPonDetailRows() {
    setOltPonLoading(true);
    setOltPonError('');
    try {
      const res = await fetch('/api/sp2-cache?stats=olt_pon_detail');
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setOltPonDetailRows([]);
        setOltPonToOptions([]);
        setOltPonOptions([]);
        setOltPonError(j.message || `Không tải được báo cáo OLT/PON (${res.status}).`);
        return;
      }
      const rows = Array.isArray(j.rows) ? j.rows : [];
      const oltsFromApi = Array.isArray(j.olts) ? j.olts : [];
      const toMap = new Map();
      for (const row of rows) {
        const id = String(row?.toQL || '');
        if (!id) continue;
        const name = String(row?.toTen || id);
        if (!toMap.has(id)) toMap.set(id, name);
      }
      setOltPonDetailRows(rows);
      setOltPonToOptions(Array.from(toMap.entries()).map(([id, name]) => ({ id, name })));
      setOltPonOptions(oltsFromApi);
    } catch (e) {
      setOltPonDetailRows([]);
      setOltPonToOptions([]);
      setOltPonOptions([]);
      setOltPonError(e?.message || 'Lỗi tải báo cáo OLT/PON.');
    } finally {
      setOltPonLoading(false);
    }
  }

  const handleExportOltPonExcel = async () => {
    setOltPonExporting(true);
    setOltPonError('');
    try {
      const q = new URLSearchParams({ stats: 'olt_pon_excel' });
      if (oltPonToFilter) q.set('toQL', oltPonToFilter);
      if (oltPonFilter) q.set('thietBiOlt', oltPonFilter);
      const res = await fetch(`/api/sp2-cache?${q.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Không xuất được Excel OLT/PON (${res.status}).`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('content-disposition') || '';
      const m = dispo.match(/filename="([^"]+)"/i);
      const filename = m?.[1] || `bao_cao_s2_chi_tiet_theo_olt_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setOltPonError(e?.message || 'Lỗi xuất Excel OLT/PON.');
    } finally {
      setOltPonExporting(false);
    }
  };

  async function refreshNoSp2Rows() {
    setNoSp2Loading(true);
    setNoSp2Error('');
    try {
      const res = await fetch('/api/sp2-cache?stats=no_sp2_detail');
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setNoSp2Rows([]);
        setNoSp2ToOptions([]);
        setNoSp2OltOptions([]);
        setNoSp2Error(j.message || `Không tải được báo cáo cổng không có S2 (${res.status}).`);
        return;
      }
      setNoSp2Rows(Array.isArray(j.rows) ? j.rows : []);
      setNoSp2ToOptions(Array.isArray(j.toOptions) ? j.toOptions : []);
      setNoSp2OltOptions(Array.isArray(j.oltOptions) ? j.oltOptions : []);
    } catch (e) {
      setNoSp2Rows([]);
      setNoSp2ToOptions([]);
      setNoSp2OltOptions([]);
      setNoSp2Error(e?.message || 'Lỗi tải báo cáo cổng không có S2.');
    } finally {
      setNoSp2Loading(false);
    }
  }

  const handleExportNoSp2Excel = async () => {
    setNoSp2Exporting(true);
    setNoSp2Error('');
    try {
      const q = new URLSearchParams({ stats: 'no_sp2_excel' });
      if (noSp2ToFilter) q.set('toQL', noSp2ToFilter);
      if (noSp2OltFilter) q.set('thietBiOlt', noSp2OltFilter);
      const res = await fetch(`/api/sp2-cache?${q.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Không xuất được Excel cổng không có S2 (${res.status}).`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('content-disposition') || '';
      const m = dispo.match(/filename="([^"]+)"/i);
      const filename = m?.[1] || `bao_cao_pon_khong_s2_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setNoSp2Error(e?.message || 'Lỗi xuất Excel cổng không có S2.');
    } finally {
      setNoSp2Exporting(false);
    }
  };

  async function refreshS2CapacityRows() {
    setS2CapacityLoading(true);
    setS2CapacityError('');
    try {
      const q = new URLSearchParams({ stats: 's2_capacity_detail' });
      if (s2CapacityToFilter) q.set('toQL', s2CapacityToFilter);
      if (s2CapacityOltFilter) q.set('thietBiOlt', s2CapacityOltFilter);
      const res = await fetch(`/api/sp2-cache?${q.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setS2CapacityRows([]);
        setS2CapacityToOptions([]);
        setS2CapacityOltOptions([]);
        setS2CapacityError(j.message || `Không tải được báo cáo dung lượng S2 (${res.status}).`);
        return;
      }
      setS2CapacityRows(Array.isArray(j.rows) ? j.rows : []);
      setS2CapacityToOptions(Array.isArray(j.toOptions) ? j.toOptions : []);
      setS2CapacityOltOptions(Array.isArray(j.oltOptions) ? j.oltOptions : []);
    } catch (e) {
      setS2CapacityRows([]);
      setS2CapacityToOptions([]);
      setS2CapacityOltOptions([]);
      setS2CapacityError(e?.message || 'Lỗi tải báo cáo dung lượng S2.');
    } finally {
      setS2CapacityLoading(false);
    }
  }

  const handleExportS2CapacityExcel = async () => {
    setS2CapacityExporting(true);
    setS2CapacityError('');
    try {
      const q = new URLSearchParams({ stats: 's2_capacity_excel' });
      if (s2CapacityToFilter) q.set('toQL', s2CapacityToFilter);
      if (s2CapacityOltFilter) q.set('thietBiOlt', s2CapacityOltFilter);
      const res = await fetch(`/api/sp2-cache?${q.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Không xuất được Excel dung lượng S2 (${res.status}).`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('content-disposition') || '';
      const m = dispo.match(/filename="([^"]+)"/i);
      const filename = m?.[1] || `bao_cao_dung_luong_s2_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setS2CapacityError(e?.message || 'Lỗi xuất Excel dung lượng S2.');
    } finally {
      setS2CapacityExporting(false);
    }
  };

  useEffect(() => {
    refreshPonOneSp2Stats();
    refreshOltPonDetailRows();
    refreshNoSp2Rows();
    refreshS2CapacityRows();
  }, []);

  useEffect(() => {
    if (!ponExportToQl) return;
    const exists = ponOneSp2Stats.some((r) => String(r?.toQL || '') === ponExportToQl);
    if (!exists) setPonExportToQl('');
  }, [ponOneSp2Stats, ponExportToQl]);

  useEffect(() => {
    if (!oltPonToFilter) return;
    const exists = oltPonToOptions.some((r) => String(r?.id || '') === oltPonToFilter);
    if (!exists) setOltPonToFilter('');
  }, [oltPonToOptions, oltPonToFilter]);

  useEffect(() => {
    if (!oltPonFilter) return;
    const exists = (oltPonToFilter
      ? oltPonDetailRows
        .filter((row) => String(row?.toQL || '') === oltPonToFilter)
        .map((row) => String(row?.thietBiOlt || ''))
      : oltPonOptions.map((r) => String(r?.id || ''))
    ).includes(oltPonFilter);
    if (!exists) setOltPonFilter('');
  }, [oltPonOptions, oltPonFilter, oltPonDetailRows, oltPonToFilter]);

  useEffect(() => {
    if (!noSp2ToFilter) return;
    const exists = noSp2ToOptions.some((r) => String(r?.id || '') === noSp2ToFilter);
    if (!exists) setNoSp2ToFilter('');
  }, [noSp2ToOptions, noSp2ToFilter]);

  useEffect(() => {
    if (!noSp2OltFilter) return;
    const exists = (noSp2ToFilter
      ? noSp2Rows.filter((row) => String(row?.toQL || '') === noSp2ToFilter).map((row) => String(row?.thietBiOlt || ''))
      : noSp2OltOptions.map((r) => String(r?.id || ''))
    ).includes(noSp2OltFilter);
    if (!exists) setNoSp2OltFilter('');
  }, [noSp2OltOptions, noSp2OltFilter, noSp2Rows, noSp2ToFilter]);

  useEffect(() => {
    if (!s2CapacityToFilter) return;
    const exists = s2CapacityToOptions.some((r) => String(r?.id || '') === s2CapacityToFilter);
    if (!exists) setS2CapacityToFilter('');
  }, [s2CapacityToOptions, s2CapacityToFilter]);

  useEffect(() => {
    if (!s2CapacityOltFilter) return;
    const exists = (s2CapacityToFilter
      ? s2CapacityRows.filter((row) => String(row?.toQL || '') === s2CapacityToFilter).map((row) => String(row?.thietBiOlt || ''))
      : s2CapacityOltOptions.map((r) => String(r?.id || ''))
    ).includes(s2CapacityOltFilter);
    if (!exists) setS2CapacityOltFilter('');
  }, [s2CapacityOltOptions, s2CapacityOltFilter, s2CapacityRows, s2CapacityToFilter]);

  useEffect(() => {
    setOltPonPage(1);
  }, [oltPonToFilter, oltPonFilter, oltPonPageSize, oltPonDetailRows]);

  useEffect(() => {
    setNoSp2Page(1);
  }, [noSp2ToFilter, noSp2OltFilter, noSp2PageSize, noSp2Rows]);

  useEffect(() => {
    setS2CapacityPage(1);
  }, [s2CapacityToFilter, s2CapacityOltFilter, s2CapacityPageSize, s2CapacityRows]);

  /** Khi chưa có danh sách Tổ KT từ API (vd. thiếu token) nhưng đã có snapshot đồng bộ — đổ từ snapshot. */
  useEffect(() => {
    if (!browseSnapshot?.toKyThuat?.length) return;
    if (listToQL.length > 0) return;
    const list = browseSnapshot.toKyThuat;
    setListToQL(list);
    setListError('');
    const nhoQuan = list.find((item) => {
      const label = optionLabel(item);
      return label && String(label).toLowerCase().includes('nho quan');
    });
    if (nhoQuan != null) setToQL(optionValue(nhoQuan));
  }, [browseSnapshot, listToQL.length]);

  /** @returns {Promise<undefined | null | unknown[]>} undefined=không dùng được server; null=chưa có dòng; mảng=đã cache */
  async function fetchServerPortCache(keyBody) {
    try {
      const q = new URLSearchParams({
        toQL: keyBody.toQL || '',
        veTinh: keyBody.veTinh || '',
        thietBiOlt: keyBody.thietBiOlt || '',
        cardOlt: keyBody.cardOlt || '',
        portOlt: keyBody.portOlt || '',
      });
      const res = await fetch(`/api/sp2-cache?${q}`);
      if (res.status === 503) return undefined;
      const j = await res.json().catch(() => ({}));
      if (!j.ok) return undefined;
      if (!j.hit) return null;
      return Array.isArray(j.data) ? j.data : [];
    } catch {
      return undefined;
    }
  }

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
    // Tổ KT: donviId; Trạm BTS: DONVI_ID; OLT: THIETBI_ID; Card OLT: CARD_ID/THIETBI_ID/VITRI; Port: PORTVL_ID
    const v = item?.donviId ?? item?.DONVI_ID ?? item?.THIETBI_ID ?? item?.CARD_ID ?? item?.SLOT_ID ?? item?.PORTVL_ID ?? item?.VITRI ?? item?.OLT_ID ?? item?.id ?? item?.ma ?? item?.value ?? item?.code ?? (item?.TEN_TB != null && item.TEN_TB !== '' ? item.TEN_TB : '');
    return v !== undefined && v !== null ? String(v) : '';
  }
  function optionLabel(item) {
    if (typeof item === 'string') return item;
    // Card OLT: ưu tiên TEN_TB (#01 NGLT-C...), không có thì dùng Slot VITRI
    if (item?.TEN_TB != null && item.TEN_TB !== '') return item.TEN_TB;
    const vitri = item?.VITRI;
    if (vitri !== undefined && vitri !== null) return `Slot ${vitri}`;
    return item?.TEN_DV ?? item?.TEN_OLT ?? item?.ten ?? item?.name ?? item?.label ?? item?.title ?? String(optionValue(item) || '');
  }

  function toQlDisplayName(rawToQl) {
    const key = String(rawToQl || '');
    if (!key) return '—';
    const pools = [
      ...(Array.isArray(browseSnapshot?.toKyThuat) ? browseSnapshot.toKyThuat : []),
      ...(Array.isArray(listToQL) ? listToQL : []),
    ];
    const found = pools.find((item) => optionValue(item) === key);
    if (!found) return key;
    const label = optionLabel(found);
    return label ? `${label} (${key})` : key;
  }

  const LOG = (tag, ...args) => { try { console.log('[TracuuSP2]', tag, ...args); } catch (_) {} };

  async function loadDanhSach() {
    const auth = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUTH) : '';
    setLoadingList(true);
    setListError('');
    const urlTtvt = '/api/danh-sach?loai=ttvt';
    const urlToQL = '/api/danh-sach?loai=to_ky_thuat';
    LOG('loadDanhSach request', { urlTtvt, urlToQL, hasAuth: !!auth?.trim() });
    try {
      const headers = { Authorization: (auth && auth.trim()) || '' };
      const [resTtvt, resToQL] = await Promise.all([
        fetch(urlTtvt, { headers }),
        fetch(urlToQL, { headers }),
      ]);
      const dataTtvt = await resTtvt.json().catch(() => ({}));
      const dataToQL = await resToQL.json().catch(() => ({}));
      LOG('loadDanhSach TTVT', { status: resTtvt.status, ok: resTtvt.ok, data: dataTtvt, list: normaliseList(dataTtvt).length });
      LOG('loadDanhSach ToQL', { status: resToQL.status, ok: resToQL.ok, data: dataToQL, list: normaliseList(dataToQL).length });
      if (resTtvt.ok) setListTtvt(normaliseList(dataTtvt));
      else setListTtvt([]);
      const listToQLData = normaliseList(dataToQL);
      if (resToQL.ok) {
        setListToQL(listToQLData);
        const nhoQuan = listToQLData.find((item) => {
          const label = optionLabel(item);
          return label && String(label).toLowerCase().includes('nho quan');
        });
        if (nhoQuan != null) setToQL(optionValue(nhoQuan));
      } else setListToQL([]);
      if (!resTtvt.ok && !resToQL.ok) {
        const msg = dataTtvt?.message || dataToQL?.message;
        const is404 = resTtvt.status === 404 || resToQL.status === 404;
        const is502 = resTtvt.status === 502 || resToQL.status === 502;
        setListError(msg || (is404 || is502
          ? 'Không tải được danh sách. Liên hệ quản trị để kiểm tra cấu hình.'
          : 'Không tải được danh sách. Kiểm tra Authorization và API danh sách OneBSS.'));
      }
    } catch (e) {
      LOG('loadDanhSach error', e);
      setListError(e.message || 'Lỗi tải danh sách.');
      setListTtvt([]);
      setListToQL([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadDanhSach();
    refreshBrowseSnapshot();
  }, [authorization]);

  useEffect(() => {
    if (!toQL) {
      setListVeTinh([]);
      setVeTinh('');
      setCardOlt('');
      setThietBiOlt('');
      return;
    }
    setVeTinh('');
    setCardOlt('');
    setThietBiOlt('');
    const auth = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUTH) : '') || '';
    const url = `/api/danh-sach?loai=tram_bts&toKyThuat=${encodeURIComponent(toQL)}`;
    LOG('VeTinh request', url, 'toQL', toQL);
    fetch(url, { headers: { Authorization: auth.trim() } })
      .then((r) => {
        LOG('VeTinh response', r.status, r.ok);
        return r.json().catch(() => ({})).then((data) => ({ ok: r.ok, status: r.status, data }));
      })
      .then(({ ok, status, data }) => {
        LOG('VeTinh data', data, 'list length', normaliseList(data).length);
        const list = normaliseList(data);
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload) {
          setListError('');
          setListVeTinh(list);
          return;
        }
        const fromBrowse = browseSnapshotRef.current?.tramByTo?.[toQL];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListVeTinh(fromBrowse);
          return;
        }
        if (!ok) {
          setListError(data?.message || data?.error || `Không tải được danh sách Trạm BTS (${status}). Kiểm tra Authorization hoặc thử tổ KT khác.`);
        } else {
          setListError(data?.message || 'Không có dữ liệu Trạm BTS.');
        }
        setListVeTinh([]);
      })
      .catch((e) => {
        const fromBrowse = browseSnapshotRef.current?.tramByTo?.[toQL];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListVeTinh(fromBrowse);
          return;
        }
        LOG('VeTinh error', e);
        setListError(e.message || 'Lỗi tải danh sách Trạm BTS.');
        setListVeTinh([]);
      });
  }, [toQL, authorization]);

  // Chọn Trạm BTS → chỉ load danh sách Thiết bị OLT
  useEffect(() => {
    if (!veTinh) {
      setListThietBiOlt([]);
      setThietBiOlt('');
      setListCardOlt([]);
      setCardOlt('');
      return;
    }
    setThietBiOlt('');
    setListCardOlt([]);
    setCardOlt('');
    const auth = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUTH) : '') || '';
    const url = `/api/danh-sach?loai=olt&toKyThuat=${encodeURIComponent(toQL)}&tramBts=${encodeURIComponent(veTinh)}`;
    LOG('OLT request', url, 'veTinh (DONVI_ID)', veTinh);
    fetch(url, { headers: { Authorization: auth.trim() } })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const listOlt = normaliseList(data);
        LOG('OLT data', { ok, len: listOlt.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload) {
          setListError('');
          setListThietBiOlt(listOlt);
          return;
        }
        const key = `${toQL}|${veTinh}`;
        const fromBrowse = browseSnapshotRef.current?.oltByTram?.[key];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListThietBiOlt(fromBrowse);
          return;
        }
        if (!ok && data?.message) setListError(data.message || 'Không tải được danh sách Thiết bị OLT.');
        setListThietBiOlt([]);
      })
      .catch((e) => {
        const key = `${toQL}|${veTinh}`;
        const fromBrowse = browseSnapshotRef.current?.oltByTram?.[key];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListThietBiOlt(fromBrowse);
          return;
        }
        LOG('OLT error', e);
        setListError(e.message || 'Lỗi tải OLT.');
        setListThietBiOlt([]);
      });
  }, [veTinh, toQL, authorization]);

  // Chọn Thiết bị OLT → load danh sách Card OLT (body { id: THIETBI_ID })
  useEffect(() => {
    if (!thietBiOlt) {
      setListCardOlt([]);
      setCardOlt('');
      return;
    }
    setCardOlt('');
    const auth = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUTH) : '') || '';
    const url = `/api/danh-sach?loai=card_olt&olt=${encodeURIComponent(thietBiOlt)}`;
    LOG('Card OLT request', url, 'thietBiOlt (THIETBI_ID)', thietBiOlt);
    fetch(url, { headers: { Authorization: auth.trim() } })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const list = normaliseList(data);
        LOG('Card OLT data', { ok, len: list.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload) {
          if (list.length === 0) setListError('Không có Card OLT cho thiết bị này.');
          else setListError('');
          setListCardOlt(list);
          return;
        }
        const fromBrowse = browseSnapshotRef.current?.cardByOlt?.[thietBiOlt];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListCardOlt(fromBrowse);
          return;
        }
        if (!ok && data?.message) setListError(data.message || 'Không tải được danh sách Card OLT.');
        else if (ok && list.length === 0) setListError('Không có Card OLT cho thiết bị này.');
        setListCardOlt([]);
      })
      .catch((e) => {
        const fromBrowse = browseSnapshotRef.current?.cardByOlt?.[thietBiOlt];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListCardOlt(fromBrowse);
          return;
        }
        LOG('Card OLT error', e);
        setListError(e.message || 'Lỗi tải Card OLT.');
        setListCardOlt([]);
      });
  }, [thietBiOlt, authorization]);

  // Chọn Card OLT → load danh sách Port OLT từ API (layDsPortOltTheoCardOlt), không dùng danh sách cố định
  useEffect(() => {
    if (!cardOlt) {
      setListPortOlt([]);
      setPortOlt('');
      setLoadingPortOlt(false);
      return;
    }
    setPortOlt('');
    setLoadingPortOlt(true);
    setListPortOlt([]);
    const auth = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUTH) : '') || '';
    const url = `/api/danh-sach?loai=port_olt&cardOlt=${encodeURIComponent(cardOlt)}`;
    LOG('Port OLT request', url);
    fetch(url, { headers: { Authorization: auth.trim() } })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const list = normaliseList(data);
        LOG('Port OLT data', { ok, len: list.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload) {
          setListError('');
          setListPortOlt(list);
          return;
        }
        const fromBrowse = browseSnapshotRef.current?.portByCard?.[cardOlt];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListPortOlt(fromBrowse);
          return;
        }
        if (!ok && data?.message) setListError(data.message || 'Không tải được danh sách Port OLT.');
        setListPortOlt([]);
      })
      .catch((e) => {
        const fromBrowse = browseSnapshotRef.current?.portByCard?.[cardOlt];
        if (Array.isArray(fromBrowse) && fromBrowse.length > 0) {
          setListError('');
          setListPortOlt(fromBrowse);
          return;
        }
        LOG('Port OLT error', e);
        setListError(e.message || 'Lỗi tải Port OLT.');
        setListPortOlt([]);
      })
      .finally(() => setLoadingPortOlt(false));
  }, [cardOlt, authorization]);

  useEffect(() => {
    const snap = browseSnapshot;
    if (!snap?.tramByTo || !toQL) return;
    setListVeTinh((prev) => {
      if (prev.length > 0) return prev;
      const from = snap.tramByTo[toQL];
      return Array.isArray(from) && from.length ? from : prev;
    });
  }, [browseSnapshot, toQL]);

  useEffect(() => {
    const snap = browseSnapshot;
    if (!snap?.oltByTram || !toQL || !veTinh) return;
    const key = `${toQL}|${veTinh}`;
    setListThietBiOlt((prev) => {
      if (prev.length > 0) return prev;
      const from = snap.oltByTram[key];
      return Array.isArray(from) && from.length ? from : prev;
    });
  }, [browseSnapshot, toQL, veTinh]);

  useEffect(() => {
    const snap = browseSnapshot;
    if (!snap?.cardByOlt || !thietBiOlt) return;
    setListCardOlt((prev) => {
      if (prev.length > 0) return prev;
      const from = snap.cardByOlt[thietBiOlt];
      return Array.isArray(from) && from.length ? from : prev;
    });
  }, [browseSnapshot, thietBiOlt]);

  useEffect(() => {
    const snap = browseSnapshot;
    if (!snap?.portByCard || !cardOlt) return;
    setListPortOlt((prev) => {
      if (prev.length > 0) return prev;
      const from = snap.portByCard[cardOlt];
      return Array.isArray(from) && from.length ? from : prev;
    });
  }, [browseSnapshot, cardOlt]);

  const handleUnlockAuth = async (e) => {
    e.preventDefault();
    setAuthPasswordError('');
    setAuthUnlocking(true);
    try {
      const res = await fetch('/api/admin/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPasswordInput }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setAuthPasswordError(j?.message || 'Mật khẩu không đúng.');
        return;
      }
      setAuthUnlocked(true);
      setShowSettings(true);
      setShowReportPanel(Boolean(unlockToOpenReport));
      if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_AUTH_UNLOCKED, '1');
      setAuthPasswordInput('');
      if (unlockToOpenReport) {
        setUnlockToOpenReport(false);
      }
    } catch (err) {
      setAuthPasswordError(err?.message || 'Không xác thực được mật khẩu.');
    } finally {
      setAuthUnlocking(false);
    }
  };

  const handleLockAuth = () => {
    setAuthUnlocked(false);
    setShowReportPanel(false);
    setUnlockToOpenReport(false);
    if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_AUTH_UNLOCKED);
  };

  const saveAuth = (value) => {
    setAuthorization(value);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_AUTH, value);
  };

  const handleHuyDongBo = () => {
    try {
      syncAbortRef.current?.abort();
    } catch (_) {}
  };

  const handleDongBoToanBo = async () => {
    const auth = (authorization && authorization.trim()) || '';
    setListError('');
    syncAbortRef.current = new AbortController();
    setSyncRunning(true);
    setSyncProgress({ phase: 'scan', done: 0, total: 0, label: 'Đang chuẩn bị…' });
    try {
      const pwd = adminPasswordForSync.trim();
      const result = await runFullSp2Sync({
        auth,
        signal: syncAbortRef.current.signal,
        onProgress: (p) => setSyncProgress(p),
        delayMs: 35,
        concurrency: 5,
        server: pwd ? { adminPassword: pwd, batchSize: 25 } : null,
      });
      await refreshServerMeta();
      await refreshBrowseSnapshot();
      await refreshPonOneSp2Stats();
      if (!result.server) {
        const meta = await getSyncMeta();
        const fp = await authFingerprint(auth);
        if (meta?.authFingerprint === fp) setLastSyncInfo(meta);
      } else {
        setLastSyncInfo(null);
      }
      if (result.aborted) {
        setListError(`Đã dừng đồng bộ. Đã xử lý ${result.completed ?? 0}/${result.total ?? '—'} port.`);
      } else if (result.errors > 0) {
        setListError(`Đồng bộ xong với ${result.errors} lỗi (tra cứu API) trên ${result.total} port. Kiểm tra token hoặc chạy lại.`);
      }
    } catch (err) {
      LOG('Đồng bộ toàn bộ', err);
      setListError(err.message || 'Lỗi đồng bộ toàn bộ.');
    } finally {
      setSyncRunning(false);
      syncAbortRef.current = null;
      setSyncProgress(null);
    }
  };

  const handleSaveToServer = async (e) => {
    e.preventDefault();
    setSaveToServerStatus('saving');
    setSaveToServerMessage('');
    try {
      const res = await fetch('/api/admin/set-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordForServer, authorization: authorization?.trim() || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSaveToServerStatus('ok');
        setSaveToServerMessage(data.message || 'Đã lưu token lên server.');
        setAdminPasswordForServer('');
        setShowSettings(false);
      } else {
        setSaveToServerStatus('error');
        setSaveToServerMessage(data.message || 'Không lưu được.');
      }
    } catch (err) {
      setSaveToServerStatus('error');
      setSaveToServerMessage(err.message || 'Lỗi kết nối.');
    }
  };

  const handleTraCuu = async (e) => {
    e.preventDefault();
    setLoi(null);
    setKetQua(null);
    setLoading(true);
    if (!ttvt?.trim() && useTtvt) {
      setLoi('Vui lòng chọn TTVT.');
      setLoading(false);
      return;
    }
    if (!toQL?.trim() && useToQL) {
      setLoi('Vui lòng chọn Tổ KT.');
      setLoading(false);
      return;
    }
    const body = {};
    if (useTtvt && ttvt) body.ttvt = ttvt;
    if (useVeTinh && veTinh) body.veTinh = veTinh;
    if (useCardOlt && cardOlt) body.cardOlt = cardOlt;
    if (useToQL && toQL) body.toQL = toQL;
    if (useThietBiOlt && thietBiOlt) body.thietBiOlt = thietBiOlt;
    if (usePortOlt && portOlt !== '') body.portOlt = portOlt;
    LOG('Tra cứu', 'Request body', body);

    const authTrim = (authorization && authorization.trim()) || '';
    const keyBody = {
      toQL: body.toQL ?? '',
      veTinh: body.veTinh ?? '',
      thietBiOlt: body.thietBiOlt ?? '',
      cardOlt: body.cardOlt ?? '',
      portOlt: body.portOlt !== undefined && body.portOlt !== null ? String(body.portOlt) : '',
    };
    const cacheKey = sp2CacheKey(keyBody);

    try {
      const fp = await authFingerprint(authTrim);

      if (chiTrongCache) {
        const srv = await fetchServerPortCache(keyBody);
        if (srv !== undefined && srv !== null) {
          const message =
            srv.length === 0
              ? 'Không có bản ghi trong cache chung (Supabase) cho port đã chọn.'
              : null;
          setKetQua({ data: srv, message, fromCache: 'server' });
          return;
        }
        const cached = await getPortCache(cacheKey, fp);
        if (cached === null) {
          setLoi(
            'Chưa có dữ liệu đồng bộ cho bộ lọc này. Quản trị chạy «Đồng bộ toàn bộ S2» kèm mật khẩu (lưu cache chung Supabase), hoặc tắt «Chỉ tra cứu từ cache».'
          );
          return;
        }
        const message =
          cached.length === 0
            ? 'Không có bản ghi trong bộ nhớ trình duyệt cho port đã chọn.'
            : null;
        setKetQua({ data: cached, message, fromCache: 'local' });
        return;
      }

      if (!boQuaCache) {
        const srv = await fetchServerPortCache(keyBody);
        if (srv !== undefined && srv !== null) {
          const message =
            srv.length === 0
              ? 'Không có bản ghi trong cache chung. Bật «Luôn gọi API» để hỏi lại OneBSS.'
              : null;
          setKetQua({ data: srv, message, fromCache: 'server' });
          return;
        }
        const cached = await getPortCache(cacheKey, fp);
        if (cached !== null) {
          const message =
            cached.length === 0
              ? 'Không có bản ghi trong bộ nhớ trình duyệt. Bật «Luôn gọi API» để hỏi lại server.'
              : null;
          setKetQua({ data: cached, message, fromCache: 'local' });
          return;
        }
      }

      const headers = { 'Content-Type': 'application/json', Authorization: authTrim };
      const res = await fetch('/api/tracuu', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      LOG('Tra cứu', 'Response', { status: res.status, ok: res.ok, data });
      if (!res.ok) {
        setLoi(data.message || data.error || 'Có lỗi khi tra cứu.');
        return;
      }
      const list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
      const message = data?.message || (list.length === 0 ? 'Không có bản ghi nào. Thử chọn đủ Tổ KT, Trạm BTS, Thiết bị OLT, Port OLT và kiểm tra Authorization.' : null);
      setKetQua({ data: Array.isArray(list) ? list : [], message, fromCache: 'api' });
    } catch (err) {
      LOG('Tra cứu', 'Lỗi', err);
      setLoi(err.message || 'Lỗi kết nối.');
    } finally {
      setLoading(false);
    }
  };

  const chuaTraCuu = !ketQua && !loi && !loading;

  const syncPhaseLabel =
    syncProgress?.phase === 'scan'
      ? 'Đang quét danh mục (Tổ KT → … → Port)'
      : 'Đang tra cứu S2 từng port';
  const syncPct =
    syncProgress && syncProgress.total > 0
      ? Math.min(100, Math.round((syncProgress.done / syncProgress.total) * 100))
      : null;
  const activeReport = REPORT_MENU_ITEMS.find((item) => item.id === activeReportId) || REPORT_MENU_ITEMS[0];
  const filteredOltPonRows = oltPonDetailRows.filter((row) => {
    if (oltPonToFilter && String(row?.toQL || '') !== oltPonToFilter) return false;
    if (oltPonFilter && String(row?.thietBiOlt || '') !== oltPonFilter) return false;
    return true;
  });
  const filteredOltPonOptions = oltPonToFilter
    ? Array.from(new Map(
      oltPonDetailRows
        .filter((row) => String(row?.toQL || '') === oltPonToFilter)
        .map((row) => [String(row?.thietBiOlt || ''), String(row?.oltTen || row?.thietBiOlt || '')])
        .filter(([id]) => !!id)
    ).entries()).map(([id, name]) => ({ id, name }))
    : oltPonOptions;
  const oltPonTotalPages = Math.max(1, Math.ceil(filteredOltPonRows.length / oltPonPageSize));
  const oltPonCurrentPage = Math.min(oltPonPage, oltPonTotalPages);
  const oltPonStart = (oltPonCurrentPage - 1) * oltPonPageSize;
  const pagedOltPonRows = filteredOltPonRows.slice(oltPonStart, oltPonStart + oltPonPageSize);
  const filteredNoSp2Rows = noSp2Rows.filter((row) => {
    if (noSp2ToFilter && String(row?.toQL || '') !== noSp2ToFilter) return false;
    if (noSp2OltFilter && String(row?.thietBiOlt || '') !== noSp2OltFilter) return false;
    return true;
  });
  const filteredNoSp2OltOptions = noSp2ToFilter
    ? Array.from(new Map(
      noSp2Rows
        .filter((row) => String(row?.toQL || '') === noSp2ToFilter)
        .map((row) => [String(row?.thietBiOlt || ''), String(row?.oltTen || row?.thietBiOlt || '')])
        .filter(([id]) => !!id)
    ).entries()).map(([id, name]) => ({ id, name }))
    : noSp2OltOptions;
  const noSp2TotalPages = Math.max(1, Math.ceil(filteredNoSp2Rows.length / noSp2PageSize));
  const noSp2CurrentPage = Math.min(noSp2Page, noSp2TotalPages);
  const noSp2Start = (noSp2CurrentPage - 1) * noSp2PageSize;
  const pagedNoSp2Rows = filteredNoSp2Rows.slice(noSp2Start, noSp2Start + noSp2PageSize);
  const filteredS2CapacityRows = s2CapacityRows.filter((row) => {
    if (s2CapacityToFilter && String(row?.toQL || '') !== s2CapacityToFilter) return false;
    if (s2CapacityOltFilter && String(row?.thietBiOlt || '') !== s2CapacityOltFilter) return false;
    return true;
  });
  const filteredS2CapacityOltOptions = s2CapacityToFilter
    ? Array.from(new Map(
      s2CapacityRows
        .filter((row) => String(row?.toQL || '') === s2CapacityToFilter)
        .map((row) => [String(row?.thietBiOlt || ''), String(row?.oltTen || row?.thietBiOlt || '')])
        .filter(([id]) => !!id)
    ).entries()).map(([id, name]) => ({ id, name }))
    : s2CapacityOltOptions;
  const s2CapacityTotalPages = Math.max(1, Math.ceil(filteredS2CapacityRows.length / s2CapacityPageSize));
  const s2CapacityCurrentPage = Math.min(s2CapacityPage, s2CapacityTotalPages);
  const s2CapacityStart = (s2CapacityCurrentPage - 1) * s2CapacityPageSize;
  const pagedS2CapacityRows = filteredS2CapacityRows.slice(s2CapacityStart, s2CapacityStart + s2CapacityPageSize);

  function DropRow({ label, required, checked, onCheck, value, onChange, options, optionValue: ov, optionLabel: ol }) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2 py-1 sm:py-1.5">
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0 w-4 h-4 sm:w-auto sm:h-auto" />
        <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider shrink-0 min-w-[70px] sm:min-w-[90px]">{label}{required && '*'}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 sm:px-3 sm:py-2 text-slate-700 text-xs sm:text-sm focus:ring-2 focus:ring-sky-500 min-h-[36px] sm:min-h-[40px]"
        >
          <option value="">{PLACEHOLDER}</option>
          {(options || []).map((item, i) => {
            const val = ov ? ov(item) : optionValue(item);
            const strVal = (val !== undefined && val !== null && val !== '') ? String(val) : '';
            return (
              <option key={strVal ? strVal : `opt-${i}`} value={strVal}>{ol ? ol(item) : optionLabel(item)}</option>
            );
          })}
        </select>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-r from-sky-50/80 via-slate-50 to-blue-50/80 py-2 px-2 sm:py-6 sm:px-4 lg:px-6">
      {/* Tiến độ đồng bộ S2 — cố định đầu màn hình để cuộn trang vẫn theo dõi được */}
      {syncRunning && syncProgress && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Tiến độ đồng bộ S2"
          className="fixed inset-x-0 top-0 z-[100] border-b border-indigo-900/30 bg-gradient-to-r from-indigo-800 via-violet-800 to-indigo-800 text-white shadow-lg"
        >
          <div className="max-w-[1600px] mx-auto px-3 py-2.5 sm:px-6 sm:py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-indigo-100">{syncPhaseLabel}</p>
              {syncProgress.phase === 'tracuu' && (
                <p className="text-sm sm:text-base font-bold text-amber-200 tabular-nums">
                  Đã gom được <span className="text-white">{syncProgress.s2Count ?? 0}</span> Spliter cấp 2
                </p>
              )}
              <p className="text-xs sm:text-sm font-medium truncate" title={syncProgress.label}>{syncProgress.label}</p>
              <div className="h-2.5 sm:h-3 rounded-full bg-black/25 overflow-hidden">
                {syncPct != null ? (
                  <div
                    className="h-full bg-amber-300 transition-[width] duration-300 ease-out"
                    style={{ width: `${syncPct}%` }}
                  />
                ) : (
                  <div className="h-full w-full bg-indigo-400/50 animate-pulse" />
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:text-right">
              {syncProgress.total > 0 ? (
                <p className="text-sm sm:text-base font-bold tabular-nums whitespace-nowrap">
                  {syncProgress.done}/{syncProgress.total}
                  <span className="text-indigo-200 font-semibold ml-1.5">({syncPct}%)</span>
                </p>
              ) : (
                <p className="text-xs text-indigo-200 whitespace-nowrap">Đang tính số port…</p>
              )}
              <button
                type="button"
                onClick={handleHuyDongBo}
                className="rounded-lg bg-white/15 hover:bg-white/25 border border-white/30 px-3 py-1.5 text-xs font-semibold"
              >
                Hủy đồng bộ
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`w-full max-w-[1600px] mx-auto min-h-0 flex flex-col sm:min-h-[calc(100vh-2rem)] ${syncRunning && syncProgress ? 'pt-[88px] sm:pt-[100px]' : ''}`}>
        {/* Card chính - vừa màn hình mobile */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden flex-1 flex flex-col min-h-0 sm:min-h-[80vh]">
          {/* Header - gọn trên mobile */}
          <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-3 sm:px-8 sm:py-6 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-2xl font-bold text-white tracking-tight truncate">
                  Module tra cứu Spliter cấp 2
                </h1>
                <p className="text-sky-100 text-[11px] sm:text-sm mt-0.5 sm:mt-1 hidden sm:block">
                  Hệ thống tra cứu thông tin Spliter cấp 2 theo OLT, Slot và Port
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <div className="relative" ref={reportMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!authUnlocked) {
                        setShowSettings(true);
                        setShowReportMenu(false);
                        setUnlockToOpenReport(true);
                        setAuthPasswordError('Vui lòng nhập mật khẩu quản trị để mở menu báo cáo.');
                        return;
                      }
                      setShowSettings(true);
                      setShowReportPanel(true);
                      setShowReportMenu((v) => !v);
                    }}
                    className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-xs sm:text-sm border border-white/40 min-h-[36px] sm:min-h-[44px] touch-manipulation"
                    aria-label={`Menu báo cáo - đang chọn ${activeReport.label}`}
                    aria-expanded={showReportMenu}
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v4H3V3zm0 7h18v4H3v-4zm0 7h18v4H3v-4z" />
                    </svg>
                    <span>Báo cáo</span>
                    <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${showReportMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showReportMenu && (
                    <div className="absolute right-0 mt-2 w-[290px] max-w-[80vw] rounded-xl border border-slate-200 bg-white shadow-xl z-20">
                      <div className="py-1">
                        {REPORT_MENU_ITEMS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveReportId(item.id);
                              setShowReportMenu(false);
                              setShowSettings(true);
                              setShowReportPanel(true);
                              setUnlockToOpenReport(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 ${activeReportId === item.id ? 'bg-sky-50' : ''}`}
                          >
                            <p className="text-xs font-semibold text-slate-700">{item.label}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUnlockToOpenReport(false);
                    if (!showSettings) {
                      setShowSettings(true);
                      setShowReportPanel(false);
                      return;
                    }
                    if (showReportPanel) {
                      setShowReportPanel(false);
                      return;
                    }
                    setShowSettings(false);
                  }}
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-xs sm:text-sm border border-white/40 min-h-[36px] sm:min-h-[44px] touch-manipulation"
                  aria-label={showSettings ? 'Ẩn cài đặt' : 'Cài đặt — token và đồng bộ'}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span>{showSettings ? 'Ẩn cài đặt' : 'Cài đặt'}</span>
                  <span className="hidden sm:inline">{showSettings ? '' : ' / Token & đồng bộ'}</span>
                  <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Cài đặt: token, lưu server, đồng bộ S2, cache — bảo vệ bằng mật khẩu */}
          {showSettings && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-3 sm:px-8 py-3 sm:py-4 shrink-0">
              {!authUnlocked ? (
                <form onSubmit={handleUnlockAuth} className="space-y-3 max-w-xs">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nhập mật khẩu để mở cài đặt (token, lưu server, đồng bộ S2, cache)</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={authPasswordInput}
                      onChange={(e) => { setAuthPasswordInput(e.target.value); setAuthPasswordError(''); }}
                      placeholder="Mật khẩu"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                      autoComplete="current-password"
                    />
                    <button type="submit" disabled={authUnlocking} className="rounded-lg bg-sky-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-sky-700 min-h-[44px] disabled:opacity-50">
                      {authUnlocking ? 'Đang kiểm tra…' : 'Mở khóa'}
                    </button>
                  </div>
                  {authPasswordError && <p className="text-xs text-red-600">{authPasswordError}</p>}
                </form>
              ) : (
                <div>
                  {!showReportPanel && (
                    <>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-semibold text-slate-600">Authorization (Bearer token)</label>
                    <button type="button" onClick={handleLockAuth} className="text-xs text-slate-500 hover:text-slate-700 underline">
                      Khóa lại
                    </button>
                  </div>
                  <input
                    type="password"
                    value={authorization}
                    onChange={(e) => saveAuth(e.target.value)}
                    placeholder="Bearer eyJhbGci... hoặc token của bạn"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-800 placeholder-slate-400 text-base sm:text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                  />
                  <form onSubmit={handleSaveToServer} className="mt-3 space-y-2">
                    <label className="block text-xs text-slate-600">Mật khẩu quản trị (ADMIN_PASSWORD trên server)</label>
                    <div className="flex gap-2 flex-wrap items-center">
                      <input
                        type="password"
                        value={adminPasswordForServer}
                        onChange={(e) => { setAdminPasswordForServer(e.target.value); setSaveToServerStatus(''); }}
                        placeholder="Mật khẩu quản trị"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48 max-w-full"
                      />
                      <button type="submit" disabled={saveToServerStatus === 'saving' || !authorization?.trim()} className="rounded-lg bg-sky-600 text-white px-4 py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
                        {saveToServerStatus === 'saving' ? 'Đang lưu...' : 'Lưu token lên server'}
                      </button>
                    </div>
                    {saveToServerMessage && <p className={`text-xs ${saveToServerStatus === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{saveToServerMessage}</p>}
                  </form>
                  <p className="text-xs text-slate-500 mt-2">Cần cấu hình Supabase (bảng app_config) + ADMIN_PASSWORD trên Vercel (xem VERCEL-SETUP.md). Sau khi lưu, mọi người dùng app sẽ dùng token này.</p>
                    </>
                  )}

                  <div className="mt-5 pt-5 border-t border-slate-200 space-y-3">
                    {!showReportPanel && (
                      <>
                    <p className="text-xs font-semibold text-slate-700">Đồng bộ toàn bộ S2 &amp; cache tra cứu</p>
                    <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                      Quét Tổ KT → Trạm → OLT → Card → Port và gọi tra cứu theo lô (vài port song song) để nhanh hơn. Nhập <strong>mật khẩu quản trị</strong> (cùng «Lưu token lên server») để lưu lên <strong>Supabase</strong>. Để trống mật khẩu thì chỉ lưu trên trình duyệt này. Cần bảng <code className="text-indigo-700 bg-white px-1 rounded">sp2_port_cache</code> (xem VERCEL-SETUP.md). Số port lớn vẫn có thể mất nhiều phút.
                    </p>
                    <div className="max-w-lg">
                      <label className="block text-[11px] sm:text-xs text-slate-600">
                        Mật khẩu quản trị (để lưu cache chung)
                        <input
                          type="password"
                          value={adminPasswordForSync}
                          onChange={(e) => setAdminPasswordForSync(e.target.value)}
                          placeholder="Trống = chỉ lưu trên máy này"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                          autoComplete="off"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDongBoToanBo}
                        disabled={syncRunning}
                        className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs sm:text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 min-h-[40px]"
                      >
                        {syncRunning ? 'Đang đồng bộ…' : 'Đồng bộ toàn bộ S2'}
                      </button>
                      {syncRunning && (
                        <button type="button" onClick={handleHuyDongBo} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[40px]">
                          Hủy
                        </button>
                      )}
                    </div>
                    {syncRunning && syncProgress && (
                      <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1.5">
                        <span className="font-semibold">Tiến độ</span> trên <strong>đầu trang</strong>
                        {syncProgress.phase === 'tracuu' && (
                          <> — hiện <strong>{syncProgress.s2Count ?? 0}</strong> Spliter cấp 2 đã gom</>
                        )}
                        .
                      </p>
                    )}
                    {serverSyncMeta?.lastSyncAt != null && (
                      <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5">
                        <span className="font-semibold">Cache chung (Supabase):</span>{' '}
                        {new Date(serverSyncMeta.lastSyncAt).toLocaleString('vi-VN')}
                        {serverSyncMeta.lastSyncTotal != null && ` — ${serverSyncMeta.lastSyncTotal} port`}
                        {serverSyncMeta.lastSyncS2Total != null && (
                          <> — <span className="font-semibold">{serverSyncMeta.lastSyncS2Total}</span> Spliter cấp 2 đã gom</>
                        )}
                        {serverSyncMeta.lastSyncErrors > 0 && ` — ${serverSyncMeta.lastSyncErrors} lỗi`}
                        {serverSyncMeta.lastSyncAborted && ' — đã dừng giữa chừng'}
                      </p>
                    )}
                      </>
                    )}
                    {showReportPanel && (
                    <div className="rounded border border-slate-200 bg-white p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <p className="text-[11px] font-semibold text-slate-700">{activeReport.label}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                            Menu báo cáo
                          </span>
                          {authUnlocked && (
                            <button
                              type="button"
                              onClick={handleLockAuth}
                              className="text-[10px] px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                              title="Khóa lại quyền quản trị"
                            >
                              Khóa lại
                            </button>
                          )}
                        </div>
                      </div>
                      {activeReportId === 's2_capacity' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Báo cáo dung lượng S2
                            </p>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={s2CapacityToFilter}
                                onChange={(e) => setS2CapacityToFilter(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lọc theo Tổ kỹ thuật"
                              >
                                <option value="">Tất cả Tổ KT</option>
                                {s2CapacityToOptions.map((item) => {
                                  const id = String(item?.id || '');
                                  if (!id) return null;
                                  return <option key={id} value={id}>{String(item?.name || id)}</option>;
                                })}
                              </select>
                              <select
                                value={s2CapacityOltFilter}
                                onChange={(e) => setS2CapacityOltFilter(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lọc theo OLT"
                              >
                                <option value="">Tất cả OLT</option>
                                {filteredS2CapacityOltOptions.map((item) => {
                                  const id = String(item?.id || '');
                                  if (!id) return null;
                                  return <option key={id} value={id}>{String(item?.name || id)}</option>;
                                })}
                              </select>
                              <select
                                value={String(s2CapacityPageSize)}
                                onChange={(e) => setS2CapacityPageSize(Number(e.target.value) || 20)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Số dòng hiển thị mỗi trang"
                              >
                                <option value="10">10 dòng/trang</option>
                                <option value="20">20 dòng/trang</option>
                                <option value="50">50 dòng/trang</option>
                                <option value="100">100 dòng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportS2CapacityExcel}
                                disabled={s2CapacityExporting}
                                className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {s2CapacityExporting ? 'Đang xuất…' : 'Xuất Excel'}
                              </button>
                              <button
                                type="button"
                                onClick={refreshS2CapacityRows}
                                disabled={s2CapacityLoading}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {s2CapacityLoading ? 'Đang tải…' : 'Làm mới'}
                              </button>
                            </div>
                          </div>
                          {s2CapacityError && <p className="text-[11px] text-red-600 mb-1">{s2CapacityError}</p>}
                          {!s2CapacityError && filteredS2CapacityRows.length === 0 && !s2CapacityLoading && (
                            <p className="text-[11px] text-slate-500">Chưa có dữ liệu dung lượng S2.</p>
                          )}
                          {filteredS2CapacityRows.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">Tổ KT</th>
                                    <th className="text-left py-1 px-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Ký hiệu</th>
                                    <th className="text-right py-1 px-2 font-semibold">Dung lượng</th>
                                    <th className="text-right py-1 px-2 font-semibold">Đã dùng</th>
                                    <th className="text-right py-1 pl-2 font-semibold">Chưa dùng</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedS2CapacityRows.map((row, idx) => (
                                    <tr key={`${String(row?.cacheKey || '')}-cap-${s2CapacityStart + idx}`} className="border-b border-slate-100 last:border-b-0 text-slate-700">
                                      <td className="py-1.5 pr-2">{String(row?.toTen || row?.toQL || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.oltTen || row?.thietBiOlt || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.kyHieu || row?.tenSplitter || '—')}</td>
                                      <td className="py-1.5 px-2 text-right">{row?.dungLuong ?? '—'}</td>
                                      <td className="py-1.5 px-2 text-right">{row?.daDung ?? '—'}</td>
                                      <td className="py-1.5 pl-2 text-right">{row?.chuaDung ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {filteredS2CapacityRows.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-600">
                                Hiển thị {s2CapacityStart + 1}-{Math.min(s2CapacityStart + s2CapacityPageSize, filteredS2CapacityRows.length)} / {filteredS2CapacityRows.length} dòng
                              </p>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setS2CapacityPage((p) => Math.max(1, p - 1))} disabled={s2CapacityCurrentPage <= 1} className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Trang trước</button>
                                <span className="text-[11px] text-slate-600">Trang {s2CapacityCurrentPage}/{s2CapacityTotalPages}</span>
                                <button type="button" onClick={() => setS2CapacityPage((p) => Math.min(s2CapacityTotalPages, p + 1))} disabled={s2CapacityCurrentPage >= s2CapacityTotalPages} className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Trang sau</button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : activeReportId === 'no_sp2_ports' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Danh sách cổng PON không có S2
                            </p>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={noSp2ToFilter}
                                onChange={(e) => setNoSp2ToFilter(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lọc theo Tổ kỹ thuật"
                              >
                                <option value="">Tất cả Tổ KT</option>
                                {noSp2ToOptions.map((item) => {
                                  const id = String(item?.id || '');
                                  if (!id) return null;
                                  return (
                                    <option key={id} value={id}>
                                      {String(item?.name || id)}
                                    </option>
                                  );
                                })}
                              </select>
                              <select
                                value={noSp2OltFilter}
                                onChange={(e) => setNoSp2OltFilter(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lọc theo OLT"
                              >
                                <option value="">Tất cả OLT</option>
                                {filteredNoSp2OltOptions.map((item) => {
                                  const id = String(item?.id || '');
                                  if (!id) return null;
                                  return (
                                    <option key={id} value={id}>
                                      {String(item?.name || id)}
                                    </option>
                                  );
                                })}
                              </select>
                              <select
                                value={String(noSp2PageSize)}
                                onChange={(e) => setNoSp2PageSize(Number(e.target.value) || 20)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Số cổng hiển thị mỗi trang"
                              >
                                <option value="10">10 cổng/trang</option>
                                <option value="20">20 cổng/trang</option>
                                <option value="50">50 cổng/trang</option>
                                <option value="100">100 cổng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportNoSp2Excel}
                                disabled={noSp2Exporting}
                                className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {noSp2Exporting ? 'Đang xuất…' : 'Xuất Excel'}
                              </button>
                              <button
                                type="button"
                                onClick={refreshNoSp2Rows}
                                disabled={noSp2Loading}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {noSp2Loading ? 'Đang tải…' : 'Làm mới'}
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-2">
                            Báo cáo liệt kê các cổng PON chưa có S2, hỗ trợ lọc theo Tổ kỹ thuật và OLT.
                          </p>
                          {noSp2Error && (
                            <p className="text-[11px] text-red-600 mb-1">{noSp2Error}</p>
                          )}
                          {!noSp2Error && filteredNoSp2Rows.length === 0 && !noSp2Loading && (
                            <p className="text-[11px] text-slate-500">Không có cổng PON nào thiếu S2 theo điều kiện lọc hiện tại.</p>
                          )}
                          {filteredNoSp2Rows.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">Tổ KT</th>
                                    <th className="text-left py-1 px-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Card</th>
                                    <th className="text-left py-1 px-2 font-semibold">Port PON</th>
                                    <th className="text-left py-1 pl-2 font-semibold">Trạm BTS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedNoSp2Rows.map((row, idx) => (
                                    <tr
                                      key={`${String(row?.cacheKey || '')}-nosp2-${noSp2Start + idx}`}
                                      className="border-b border-slate-100 last:border-b-0 text-slate-700"
                                    >
                                      <td className="py-1.5 pr-2">{String(row?.toTen || row?.toQL || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.oltTen || row?.thietBiOlt || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.cardTen || row?.cardOlt || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.portTen || row?.portOlt || '—')}</td>
                                      <td className="py-1.5 pl-2">{String(row?.tramTen || row?.veTinh || '—')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {filteredNoSp2Rows.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-600">
                                Hiển thị {noSp2Start + 1}-{Math.min(noSp2Start + noSp2PageSize, filteredNoSp2Rows.length)} / {filteredNoSp2Rows.length} cổng
                              </p>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setNoSp2Page((p) => Math.max(1, p - 1))}
                                  disabled={noSp2CurrentPage <= 1}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang trước
                                </button>
                                <span className="text-[11px] text-slate-600">
                                  Trang {noSp2CurrentPage}/{noSp2TotalPages}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setNoSp2Page((p) => Math.min(noSp2TotalPages, p + 1))}
                                  disabled={noSp2CurrentPage >= noSp2TotalPages}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang sau
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : activeReportId === 'olt_pon_detail' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Chi tiết S2 theo OLT và cổng PON
                            </p>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={oltPonToFilter}
                                onChange={(e) => setOltPonToFilter(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lọc theo Tổ kỹ thuật"
                              >
                                <option value="">Tất cả Tổ KT</option>
                                {oltPonToOptions.map((item) => {
                                  const id = String(item?.id || '');
                                  if (!id) return null;
                                  return (
                                    <option key={id} value={id}>
                                      {String(item?.name || id)}
                                    </option>
                                  );
                                })}
                              </select>
                              <select
                                value={oltPonFilter}
                                onChange={(e) => setOltPonFilter(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lọc theo OLT để xem/xuất Excel"
                              >
                                <option value="">Tất cả OLT</option>
                                {filteredOltPonOptions.map((item) => {
                                  const id = String(item?.id || '');
                                  if (!id) return null;
                                  return (
                                    <option key={id} value={id}>
                                      {String(item?.name || id)}
                                    </option>
                                  );
                                })}
                              </select>
                              <select
                                value={String(oltPonPageSize)}
                                onChange={(e) => setOltPonPageSize(Number(e.target.value) || 20)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Số cổng hiển thị mỗi trang"
                              >
                                <option value="10">10 cổng/trang</option>
                                <option value="20">20 cổng/trang</option>
                                <option value="50">50 cổng/trang</option>
                                <option value="100">100 cổng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportOltPonExcel}
                                disabled={oltPonExporting}
                                className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {oltPonExporting ? 'Đang xuất…' : (oltPonFilter ? 'Xuất Excel theo OLT' : 'Xuất Excel tất cả OLT')}
                              </button>
                              <button
                                type="button"
                                onClick={refreshOltPonDetailRows}
                                disabled={oltPonLoading}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {oltPonLoading ? 'Đang tải…' : 'Làm mới'}
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-2">
                            Mỗi dòng là một cổng PON trong cache, có số lượng SP2 và danh sách tên SP2 tương ứng.
                          </p>
                          {oltPonError && (
                            <p className="text-[11px] text-red-600 mb-1">{oltPonError}</p>
                          )}
                          {!oltPonError && filteredOltPonRows.length === 0 && !oltPonLoading && (
                            <p className="text-[11px] text-slate-500">Chưa có dữ liệu báo cáo OLT/PON.</p>
                          )}
                          {filteredOltPonRows.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Card</th>
                                    <th className="text-left py-1 px-2 font-semibold">Port PON</th>
                                    <th className="text-right py-1 px-2 font-semibold">Số SP2</th>
                                    <th className="text-left py-1 pl-2 font-semibold">Danh sách SP2</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedOltPonRows.map((row, idx) => (
                                    <tr
                                      key={`${String(row?.cacheKey || '')}-${oltPonStart + idx}`}
                                      className="border-b border-slate-100 last:border-b-0 text-slate-700"
                                    >
                                      <td className="py-1.5 pr-2">
                                        {String(row?.oltTen || row?.thietBiOlt || '—')}
                                      </td>
                                      <td className="py-1.5 px-2">{String(row?.cardTen || row?.cardOlt || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.portTen || row?.portOlt || '—')}</td>
                                      <td className="py-1.5 px-2 text-right font-semibold text-indigo-700">
                                        {Number(row?.sp2Count || 0)}
                                      </td>
                                      <td className="py-1.5 pl-2">
                                        {String(row?.tenSp2List || '').trim() ? (
                                          <div className="max-w-[520px] space-y-1">
                                            {String(row.tenSp2List)
                                              .split(';')
                                              .map((item) => item.trim())
                                              .filter(Boolean)
                                              .map((item, itemIdx) => (
                                                <p key={`${String(row?.cacheKey || '')}-sp2-${itemIdx}`} className="leading-relaxed break-words">
                                                  {item}
                                                </p>
                                              ))}
                                          </div>
                                        ) : (
                                          <span>—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {filteredOltPonRows.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-600">
                                Hiển thị {oltPonStart + 1}-{Math.min(oltPonStart + oltPonPageSize, filteredOltPonRows.length)} / {filteredOltPonRows.length} cổng
                              </p>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setOltPonPage((p) => Math.max(1, p - 1))}
                                  disabled={oltPonCurrentPage <= 1}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang trước
                                </button>
                                <span className="text-[11px] text-slate-600">
                                  Trang {oltPonCurrentPage}/{oltPonTotalPages}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setOltPonPage((p) => Math.min(oltPonTotalPages, p + 1))}
                                  disabled={oltPonCurrentPage >= oltPonTotalPages}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang sau
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : activeReportId === 'pon_one_sp2' ? (
                        <>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Tỷ lệ cổng PON có đúng 1 SP2 theo Tổ KT
                            </p>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={ponExportToQl}
                                onChange={(e) => setPonExportToQl(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lọc theo Tổ KT để xuất Excel"
                              >
                                <option value="">Tất cả Tổ KT</option>
                                {ponOneSp2Stats.map((row) => {
                                  const key = String(row?.toQL || '');
                                  if (!key) return null;
                                  return (
                                    <option key={key} value={key}>
                                      {toQlDisplayName(key)}
                                    </option>
                                  );
                                })}
                              </select>
                              <button
                                type="button"
                                onClick={handleExportPonOneSp2Excel}
                                disabled={ponExporting}
                                className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {ponExporting ? 'Đang xuất…' : (ponExportToQl ? 'Xuất Excel theo tổ' : 'Xuất Excel 1 SP2')}
                              </button>
                              <button
                                type="button"
                                onClick={refreshPonOneSp2Stats}
                                disabled={ponStatsLoading}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {ponStatsLoading ? 'Đang tải…' : 'Làm mới'}
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-2">
                            Công thức: <strong>số cổng có đúng 1 SP2 / tổng số cổng đã cache</strong>.
                          </p>
                          {ponStatsError && (
                            <p className="text-[11px] text-red-600 mb-1">{ponStatsError}</p>
                          )}
                          {!ponStatsError && ponOneSp2Stats.length === 0 && !ponStatsLoading && (
                            <p className="text-[11px] text-slate-500">Chưa có dữ liệu thống kê.</p>
                          )}
                          {ponOneSp2Stats.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">Tổ KT</th>
                                    <th className="text-right py-1 px-2 font-semibold">1 SP2</th>
                                    <th className="text-right py-1 px-2 font-semibold">Tổng cổng</th>
                                    <th className="text-right py-1 pl-2 font-semibold">Tỷ lệ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ponOneSp2Stats.map((row) => (
                                    <tr key={String(row?.toQL || '')} className="border-b border-slate-100 last:border-b-0 text-slate-700">
                                      <td className="py-1.5 pr-2">{toQlDisplayName(row?.toQL)}</td>
                                      <td className="py-1.5 px-2 text-right">{Number(row?.oneSp2Ports || 0)}</td>
                                      <td className="py-1.5 px-2 text-right">{Number(row?.totalPorts || 0)}</td>
                                      <td className="py-1.5 pl-2 text-right font-semibold text-indigo-700">
                                        {(Number(row?.ratioOneSp2 || 0) * 100).toFixed(1)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
                          <p className="text-[11px] font-medium text-slate-700">Báo cáo đang được xây dựng</p>
                          <p className="text-[11px] text-slate-500 mt-1">{activeReport.description}</p>
                        </div>
                      )}
                    </div>
                    )}
                    {!showReportPanel && lastSyncInfo?.lastSyncAt && (
                      <p className="text-[11px] text-slate-500">
                        Đồng bộ cục bộ (trình duyệt này):{' '}
                        {new Date(lastSyncInfo.lastSyncAt).toLocaleString('vi-VN')}
                        {lastSyncInfo.lastSyncTotal != null && ` — ${lastSyncInfo.lastSyncTotal} port`}
                        {lastSyncInfo.lastSyncS2Total != null && (
                          <> — {lastSyncInfo.lastSyncS2Total} Spliter cấp 2 đã gom</>
                        )}
                        {lastSyncInfo.lastSyncErrors > 0 && ` — ${lastSyncInfo.lastSyncErrors} lỗi`}
                      </p>
                    )}
                    {!showReportPanel && (
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                      <label className="inline-flex items-center gap-2 text-[11px] sm:text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={chiTrongCache}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setChiTrongCache(v);
                            if (v) setBoQuaCache(false);
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Chỉ tra cứu từ cache (Supabase + trình duyệt, không gọi API)
                      </label>
                      <label className="inline-flex items-center gap-2 text-[11px] sm:text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={boQuaCache}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setBoQuaCache(v);
                            if (v) setChiTrongCache(false);
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Luôn gọi API (bỏ qua bộ nhớ)
                      </label>
                    </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form tra cứu - Tìm kiếm thông tin Splitter */}
          <div className="px-3 py-3 sm:px-8 sm:py-6 shrink-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 border-b-2 border-sky-500 pb-1 mb-3 sm:mb-4">Tìm kiếm thông tin Splitter</h2>
            <form onSubmit={handleTraCuu} className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-8">
                <div className="space-y-0 order-1 sm:order-1">
                  <DropRow label="TTVT" required checked={useTtvt} onCheck={setUseTtvt} value={ttvt} onChange={setTtvt} options={listTtvt} />
                  <DropRow label="Tổ KT" required checked={useToQL} onCheck={setUseToQL} value={toQL} onChange={setToQL} options={listToQL} />
                  <DropRow label="Trạm BTS" checked={useVeTinh} onCheck={setUseVeTinh} value={veTinh} onChange={setVeTinh} options={listVeTinh} />
                </div>
                <div className="space-y-0 order-2 sm:order-2">
                  <DropRow label="Thiết bị OLT" checked={useThietBiOlt} onCheck={setUseThietBiOlt} value={thietBiOlt} onChange={setThietBiOlt} options={listThietBiOlt} />
                  <DropRow label="Card OLT" checked={useCardOlt} onCheck={setUseCardOlt} value={cardOlt} onChange={setCardOlt} options={listCardOlt} optionValue={(item) => { if (typeof item === 'string') return item; const keyVal = item?.KEY; const idFromKey = (typeof keyVal === 'string' && keyVal.includes('#')) ? (keyVal.split('#')[1]?.trim() || keyVal) : null; const v = idFromKey ?? item?.CARD_ID ?? item?.THIETBI_ID ?? item?.SLOT_ID ?? item?.PORTVL_ID ?? item?.VITRI ?? item?.TEN_TB ?? item?.id ?? item?.ma ?? item?.value ?? item?.code ?? ''; return (v !== undefined && v !== null) ? String(v) : ''; }} />
                  <div>
                    <DropRow label="Port OLT" checked={usePortOlt} onCheck={setUsePortOlt} value={portOlt} onChange={setPortOlt} options={listPortOlt} optionValue={(item) => { if (typeof item === 'number') return String(item); if (typeof item === 'string') return item; const v = item?.PORTVL_ID ?? item?.VITRI ?? item?.id ?? item?.value ?? ''; return (v !== undefined && v !== null) ? String(v) : ''; }} optionLabel={(item) => { if (typeof item === 'number') return String(item); if (typeof item === 'string') return item; const vitri = item?.VITRI; if (vitri !== undefined && vitri !== null) return String(vitri); return item?.PORTVL_ID != null ? String(item.PORTVL_ID) : (item?.TEN_TB ?? optionLabel(item) ?? ''); }} />
                    {cardOlt && !loadingPortOlt && listPortOlt.length === 0 && <p className="text-xs text-amber-600 mt-0.5 -mb-1">Chưa có Port. Kiểm tra Card đã chọn hoặc API.</p>}
                  </div>
                </div>
              </div>
              <div className="pt-1 sm:pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg font-semibold text-white text-xs sm:text-sm bg-sky-600 hover:bg-sky-700 focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-70 disabled:cursor-not-allowed min-h-[40px] sm:min-h-[44px]"
                >
                  {loading ? 'Đang tra cứu...' : 'Tra cứu'}
                </button>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5 sm:mt-2">
                  Dữ liệu lấy từ API hoặc cache. Sau <strong>đồng bộ S2</strong> lên server, danh mục (dropdown) và kết quả có thể dùng từ snapshot/cache khi token OneBSS hết hạn. Quản trị: <strong>Cài đặt</strong> (mật khẩu) để token, đồng bộ và tùy chọn cache.
                </p>
              </div>
            </form>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {loadingList && <span className="text-xs text-slate-500">Đang tải danh sách...</span>}
              {listError && <span className="text-xs text-red-600">{listError}</span>}
              <button type="button" onClick={loadDanhSach} disabled={loadingList} className="hidden text-xs text-sky-600 hover:underline disabled:opacity-50">
                Tải lại danh sách
              </button>
            </div>
          </div>

            {/* Khu vực kết quả - vừa màn hình mobile */}
            <div className="mt-2 sm:mt-6 mx-2 sm:mx-8 mb-2 sm:mb-6 rounded-lg sm:rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex-1 min-h-[140px] sm:min-h-[320px] p-3 sm:p-6 flex flex-col overflow-hidden">
              {chuaTraCuu && (
                <p className="text-slate-500 text-center text-xs sm:text-base py-6 sm:py-16 flex-1 flex items-center justify-center">
                  Chọn các mục và bấm Tra cứu để xem kết quả
                </p>
              )}
              {loading && (
                <p className="text-sky-600 font-medium text-xs sm:text-base py-6 sm:py-12 text-center flex-1 flex items-center justify-center">Đang tra cứu...</p>
              )}
              {loi && (
                <p className="text-red-600 text-center text-xs sm:text-base max-w-md py-4 sm:py-6">{loi}</p>
              )}
              {ketQua != null && !loi && (
                <div className="w-full overflow-x-auto flex-1 min-h-0 -mx-1 sm:mx-0">
                  <h3 className="text-slate-800 font-bold text-sm sm:text-base mb-2 sm:mb-3 flex flex-wrap items-center gap-2">
                    <span>
                      Kết quả tra cứu ({Array.isArray(ketQua.data) ? ketQua.data.length : 0} Spliter cấp 2)
                    </span>
                    {ketQua.fromCache === 'server' && (
                      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                        Cache chung (Supabase)
                      </span>
                    )}
                    {ketQua.fromCache === 'local' && (
                      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Trình duyệt này
                      </span>
                    )}
                  </h3>
                  {ketQua.message && <p className="text-slate-600 text-xs sm:text-sm mb-2 sm:mb-3">{ketQua.message}</p>}
                  {Array.isArray(ketQua.data) && ketQua.data.length > 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="grid grid-cols-[1fr_auto] gap-0">
                        <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-2 sm:px-6 sm:py-3 text-white font-semibold text-xs sm:text-sm uppercase tracking-wide min-w-0">
                          Danh sách S2 tìm thấy
                        </div>
                        <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-2 sm:px-6 sm:py-3 text-white font-semibold text-xs sm:text-sm uppercase tracking-wide text-right shrink-0">
                          Hành động
                        </div>
                      </div>
                      {ketQua.data.map((row, i) => {
                        const tenS2 = row?.TEN_KC ?? row?.KYHIEU ?? row?.ten ?? row?.name ?? '';
                        const copyText = String(tenS2 || '');
                        return (
                          <div key={i} className="grid grid-cols-[1fr_auto] gap-0 border-t border-slate-100 hover:bg-slate-50/50 min-w-0">
                            <div className="px-3 py-2 sm:px-6 sm:py-3 text-slate-800 text-xs sm:text-sm font-medium min-w-0 break-words" title={copyText || undefined}>
                              {copyText || '—'}
                            </div>
                            <div className="px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-end shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  if (copyText && typeof navigator?.clipboard?.writeText === 'function') {
                                    navigator.clipboard.writeText(copyText);
                                    setShowCopyToast(true);
                                    setTimeout(() => setShowCopyToast(false), 2000);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-medium shadow-sm"
                              >
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Copy
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center text-xs sm:text-sm py-6 sm:py-8">Không có bản ghi Splitter cấp 2.</p>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>
    {showCopyToast && (
        <div className="fixed inset-0 flex items-end justify-center pb-8 sm:pb-12 pointer-events-none z-50">
          <div className="bg-black/40 backdrop-blur-sm text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium border border-white/20">
            Đã copy!
          </div>
        </div>
      )}
    </main>
  );
}
