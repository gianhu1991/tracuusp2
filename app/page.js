'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { authFingerprint, getPortCache, getSyncMeta, sp2CacheKey } from '../lib/sp2-local-cache';
import { runFullSp2Sync } from '../lib/sp2-full-sync';

const PLACEHOLDER = '';

/** TTVT mặc định theo OneBSS (trang tra cứu splitter theo port OLT). */
const TTVT_MAC_DINH = 'Trung tâm viễn thông Nho Quan';
/** Trùng `app/api/danh-sach/route.js` — dùng khi API lỗi, chưa deploy, hoặc trình duyệt cache response cũ. */
const FALLBACK_TTVT_LIST = [{ ma: TTVT_MAC_DINH, ten: TTVT_MAC_DINH }];
const FALLBACK_TO_KY_THUAT = [
  { id: 'd4febad9-f7b4-41a4-85ab-1e8fc1fd754a', donviId: 1002688, ten: 'Tổ Kỹ thuật Địa bàn Gia Viễn' },
  { id: '5f0ad13b-53ee-4869-a66f-4023cba821a7', donviId: 1002689, ten: 'Tổ Kỹ thuật Địa bàn Nho Quan' },
];
const STORAGE_AUTH = 'tracuu_sp2_authorization';
const STORAGE_AUTH_UNLOCKED = 'tracuu_sp2_auth_unlocked';
const AUTH_AUTO_LOCK_MS = 5 * 60 * 1000;
const DEFAULT_TO_QL_DONVI_ID = '1002689'; // Tổ Kỹ thuật Địa bàn Nho Quan
const DEFAULT_TO_QL_ID = '5f0ad13b-53ee-4869-a66f-4023cba821a7';
const REPORT_MENU_ITEMS = [
  {
    id: 's2_lookup',
    label: 'Lấy thông số S2',
    description: 'Tra cứu theo từng S2 hoặc theo file S2 để lấy OLT/Card/Port.',
  },
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
  {
    id: 'tb_chuyen_dia_ban',
    label: 'Thuê bao cần chuyển địa bàn khác',
    description: 'Theo dõi lịch sử chuyển địa bàn thuê bao và xuất Excel.',
  },
];

const TB_MODULE_SPLITTER = 'splitter';
const TB_MODULE_TB = 'tb';
const TB_SHARED_LOCAL_CACHE_KEY = 'tb_shared_rows_cache_v1';

function defaultDropOptionValue(item) {
  return item?.donviId ?? item?.DONVI_ID ?? item?.THIETBI_ID ?? item?.CARD_ID ?? item?.SLOT_ID ?? item?.PORTVL_ID ??
    item?.VITRI ?? item?.OLT_ID ?? item?.id ?? item?.ma ?? item?.value ?? item?.code ?? '';
}

function defaultDropOptionLabel(item) {
  return item?.TEN_DV ?? item?.TEN_OLT ?? item?.TEN_TB ?? item?.TEN ?? item?.ten ?? item?.name ?? item?.label ?? item?.title ??
    String(defaultDropOptionValue(item) || '');
}

function normalizePlainText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function pickDefaultToQlItem(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return null;
  const byDonviId = arr.find((item) => String(item?.donviId ?? item?.DONVI_ID ?? '') === DEFAULT_TO_QL_DONVI_ID);
  if (byDonviId) return byDonviId;
  const byId = arr.find((item) => String(item?.id ?? item?.value ?? '') === DEFAULT_TO_QL_ID);
  if (byId) return byId;
  const byLabel = arr.find((item) => normalizePlainText(defaultDropOptionLabel(item)).includes('nho quan'));
  return byLabel || arr[0] || null;
}

function sanitizeSelectOptions(list) {
  return (Array.isArray(list) ? list : []).filter((item) => {
    const v = defaultDropOptionValue(item);
    return String(v ?? '').trim() !== '';
  });
}

const DropRow = memo(
  function DropRowInner({ label, required, checked, onCheck, value, onChange, options, optionValue: ov, optionLabel: ol }) {
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
            const val = ov ? ov(item) : defaultDropOptionValue(item);
            const strVal = (val !== undefined && val !== null && val !== '') ? String(val) : '';
            return (
              <option key={strVal ? strVal : `opt-${i}`} value={strVal}>{ol ? ol(item) : defaultDropOptionLabel(item)}</option>
            );
          })}
        </select>
      </div>
    );
  },
  (prev, next) => (
    prev.label === next.label &&
    prev.required === next.required &&
    prev.checked === next.checked &&
    prev.value === next.value &&
    prev.options === next.options
  )
);

function tbNormHeader(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ánh xạ dòng tiêu đề Excel → chỉ số cột (linh hoạt tên cột). */
function tbResolveColumnIndices(headerRow) {
  const idx = {};
  const cells = (headerRow || []).map((h, i) => ({ i, n: tbNormHeader(h) }));
  for (const { i, n } of cells) {
    if (!n) continue;
    if (idx.stt == null && (n === 'stt' || n.startsWith('stt'))) idx.stt = i;
    if (
      idx.tenKH == null &&
      (n.includes('ten kh') || n.includes('tenkh') || (n.includes('ten') && n.includes('kh')) || n.includes('ho ten') || n.includes('khach hang'))
    ) {
      idx.tenKH = i;
    }
    if (idx.account == null && (n.includes('acount') || n === 'account' || n.includes('tai khoan'))) idx.account = i;
    if (idx.diaChi == null && (n.includes('dia chi') || n === 'address')) idx.diaChi = i;
    if (idx.soDt == null && (n.includes('so dt') || n.includes('dien thoai') || n === 'sdt' || n.includes('phone'))) idx.soDt = i;
    if (idx.olt == null && (n === 'olt' || /^olt\b/u.test(n))) idx.olt = i;
    if (idx.slot == null && n.includes('slot')) idx.slot = i;
    if (idx.port == null && (n === 'port' || n.startsWith('port'))) idx.port = i;
    if (idx.nvQL == null && (n.includes('nhan vien') || n.includes('nv ql'))) idx.nvQL = i;
  }
  return idx;
}

function tbCell(matrixRow, colIdx) {
  if (colIdx == null || colIdx < 0) return '';
  const v = matrixRow?.[colIdx];
  if (v == null || v === '') return '';
  return String(v).trim();
}

function tbNewRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `tb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function tbHydrateRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r?.id || tbNewRowId(),
    stt: String(r?.stt || '').trim(),
    account: String(r?.account || '').trim(),
    tenKH: String(r?.tenKH || '').trim(),
    diaChi: String(r?.diaChi || '').trim(),
    soDt: String(r?.soDt || '').trim(),
    olt: String(r?.olt || '').trim(),
    slot: String(r?.slot || '').trim(),
    port: String(r?.port || '').trim(),
    nvQL: String(r?.nvQL || '').trim(),
  }));
}

function tbStripBuildSuffix(s) {
  return String(s)
    .replace(/\s*Build\/[^\s)]+/gi, '')
    .trim();
}

/** Tên/mã chủng loại từ User-Agent (đặc biệt Android có đoạn sau «Android xx;»). */
function tbParsePhoneModelFromUa(ua) {
  if (!ua) return '';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  const m = ua.match(/Android\s+[\d._]+;\s*([^)]+)\)/i);
  if (!m) return '';
  let raw = tbStripBuildSuffix(m[1]).replace(/^Linux;\s*/i, '').trim();
  if (/^K$/i.test(raw)) return '';
  if (raw.length > 96) raw = `${raw.slice(0, 93)}…`;
  return raw || '';
}

/**
 * Tên hoặc chủng loại điện thoại/thiết bị lúc thao tác (Client Hints + UA).
 * Máy tính: «Máy tính (hệ điều hành ngắn gọn)».
 */
async function tbSummarizeThietBiThaoTacAsync() {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';

  try {
    const uad = navigator.userAgentData;
    if (uad?.getHighEntropyValues) {
      const hi = await uad.getHighEntropyValues(['model', 'platform', 'mobile']);
      const m = String(hi?.model || '').trim();
      if (hi?.mobile && m && !/^generic$/i.test(m)) return m.length > 120 ? `${m.slice(0, 117)}…` : m;
    }
  } catch {
    /* bỏ qua */
  }

  const fromUa = tbParsePhoneModelFromUa(ua);
  if (fromUa) return fromUa;

  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
    if (/Android/i.test(ua)) return 'Điện thoại Android (không đọc được model)';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/iPhone|iPod/i.test(ua)) return 'iPhone';
    return 'Thiết bị di động';
  }

  let os = '';
  if (/Windows NT 10\.0|Windows NT 11\.0/i.test(ua)) os = 'Windows';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'Chrome OS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else os = '—';
  if (/Macintosh|Windows|CrOS|Linux/i.test(ua)) return `Máy tính (${os})`;
  return ua.trim() ? ua.slice(0, 120) : '';
}

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
  /** Snapshot danh mục từ server (lưu lúc đồng bộ S2). */
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
  const [s2LookupInput, setS2LookupInput] = useState('');
  const [s2LookupRows, setS2LookupRows] = useState([]);
  const [s2LookupNotFound, setS2LookupNotFound] = useState([]);
  const [s2LookupLoading, setS2LookupLoading] = useState(false);
  const [s2LookupError, setS2LookupError] = useState('');
  const [s2LookupExporting, setS2LookupExporting] = useState(false);
  const [s2LookupPage, setS2LookupPage] = useState(1);
  const [s2LookupPageSize, setS2LookupPageSize] = useState(10);
  const [s2LookupFileName, setS2LookupFileName] = useState('');
  const [activeMainModule, setActiveMainModule] = useState(TB_MODULE_SPLITTER);
  const [tbRows, setTbRows] = useState([]);
  const [tbFileName, setTbFileName] = useState('');
  const [tbSelectedFile, setTbSelectedFile] = useState(null);
  const [tbParseMessage, setTbParseMessage] = useState('');
  const [tbNvQL, setTbNvQL] = useState('');
  const [tbOlt, setTbOlt] = useState('');
  const [tbSlot, setTbSlot] = useState('');
  const [tbPort, setTbPort] = useState('');
  const [tbKetQua, setTbKetQua] = useState(null);
  const [tbPage, setTbPage] = useState(1);
  const [tbPageSize, setTbPageSize] = useState(10);
  const [tbTimKiemLoi, setTbTimKiemLoi] = useState('');
  const [tbShowChuyenModal, setTbShowChuyenModal] = useState(false);
  const [tbChuyenTargetNv, setTbChuyenTargetNv] = useState('');
  const [tbChuyenIds, setTbChuyenIds] = useState(() => new Set());
  const [tbChuyenBatches, setTbChuyenBatches] = useState([]);
  const [tbTransferLoading, setTbTransferLoading] = useState(false);
  const [tbConfirmingTransferKey, setTbConfirmingTransferKey] = useState('');
  const [tbDeletingTransferKey, setTbDeletingTransferKey] = useState('');
  const [tbUploading, setTbUploading] = useState(false);
  const [tbUploadProgress, setTbUploadProgress] = useState(null);
  const [tbExporting, setTbExporting] = useState(false);
  const [tbSharedLoading, setTbSharedLoading] = useState(false);
  const [tbSharedMeta, setTbSharedMeta] = useState(null);
  const [tbUploadGate, setTbUploadGate] = useState({ status: 'checking', gateEnabled: false });
  const [tbUploadGatePassword, setTbUploadGatePassword] = useState('');
  const [tbUploadGateError, setTbUploadGateError] = useState('');
  const [tbUploadGateSubmitting, setTbUploadGateSubmitting] = useState(false);
  const [tbUploadPanelExpanded, setTbUploadPanelExpanded] = useState(false);
  const tbFileInputRef = useRef(null);
  const syncAbortRef = useRef(null);
  const syncProgressLatestRef = useRef(null);
  const syncProgressTimerRef = useRef(null);
  const syncProgressLastAtRef = useRef(0);
  const reportMenuRef = useRef(null);

  const clearSyncProgressTimer = () => {
    if (syncProgressTimerRef.current) {
      clearTimeout(syncProgressTimerRef.current);
      syncProgressTimerRef.current = null;
    }
  };

  const pushSyncProgress = (next, { force = false } = {}) => {
    syncProgressLatestRef.current = next;
    const now = Date.now();
    if (force || now - syncProgressLastAtRef.current >= 250) {
      syncProgressLastAtRef.current = now;
      clearSyncProgressTimer();
      setSyncProgress(next);
      return;
    }
    if (!syncProgressTimerRef.current) {
      const waitMs = Math.max(20, 250 - (now - syncProgressLastAtRef.current));
      syncProgressTimerRef.current = setTimeout(() => {
        syncProgressTimerRef.current = null;
        syncProgressLastAtRef.current = Date.now();
        if (syncProgressLatestRef.current) setSyncProgress(syncProgressLatestRef.current);
      }, waitMs);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthorization(localStorage.getItem(STORAGE_AUTH) || '');
      setAuthUnlocked(sessionStorage.getItem(STORAGE_AUTH_UNLOCKED) === '1');
    }
  }, []);

  /** Phiên sessionStorage không có cookie httpOnly → đồng bộ lại trạng thái khóa. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(STORAGE_AUTH_UNLOCKED) !== '1') return;
    fetch('/api/admin/unlock', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.gateEnabled && !data?.unlocked) {
          setAuthUnlocked(false);
          sessionStorage.removeItem(STORAGE_AUTH_UNLOCKED);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => clearSyncProgressTimer(), []);

  useEffect(() => {
    if (!authUnlocked) return;
    const t = setTimeout(() => {
      setAuthUnlocked(false);
      setShowReportPanel(false);
      setUnlockToOpenReport(false);
      if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_AUTH_UNLOCKED);
      setAuthPasswordError('Phiên đã hết hạn. Vui lòng thử lại.');
      fetch('/api/admin/lock', { method: 'POST', credentials: 'include' }).catch(() => {});
      setTbUploadGate((g) => ({
        ...g,
        status: g.gateEnabled ? 'locked' : 'unlocked',
      }));
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

  function parseS2TokensFromText(rawText) {
    return Array.from(new Set(
      String(rawText || '')
        .split(/\r?\n|,|;|\t|\|/g)
        .map((item) => item.trim())
        .filter(Boolean)
    ));
  }

  async function runS2Lookup(rawItems) {
    const s2List = Array.from(new Set(
      (Array.isArray(rawItems) ? rawItems : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));
    if (s2List.length === 0) {
      setS2LookupRows([]);
      setS2LookupNotFound([]);
      setS2LookupError('Vui lòng nhập ít nhất 1 mã S2 để tra cứu.');
      return;
    }
    setS2LookupLoading(true);
    setS2LookupError('');
    try {
      const res = await fetch('/api/s2-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s2List }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setS2LookupRows([]);
        setS2LookupNotFound([]);
        setS2LookupError(j?.message || `Không tra cứu được S2 (${res.status}).`);
        return;
      }
      setS2LookupRows(Array.isArray(j.rows) ? j.rows : []);
      setS2LookupNotFound(Array.isArray(j.notFound) ? j.notFound : []);
    } catch (e) {
      setS2LookupRows([]);
      setS2LookupNotFound([]);
      setS2LookupError(e?.message || 'Lỗi tra cứu S2.');
    } finally {
      setS2LookupLoading(false);
    }
  }

  const handleLookupSingleS2 = async () => {
    await runS2Lookup(parseS2TokensFromText(s2LookupInput));
  };

  const handleLookupS2File = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    setS2LookupFileName(file.name || '');
    setS2LookupError('');
    try {
      const lowerName = String(file.name || '').toLowerCase();
      const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
      let tokens = [];
      if (isExcel) {
        const xlsx = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = xlsx.read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames?.[0];
        const ws = firstSheetName ? wb.Sheets[firstSheetName] : null;
        const matrix = ws ? xlsx.utils.sheet_to_json(ws, { header: 1, raw: false }) : [];
        const flat = [];
        for (const row of matrix) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            const text = String(cell ?? '').trim();
            if (!text) continue;
            flat.push(text);
          }
        }
        tokens = Array.from(new Set(flat));
      } else {
        const text = await file.text();
        tokens = parseS2TokensFromText(text);
      }
      if (tokens.length === 0) {
        setS2LookupRows([]);
        setS2LookupNotFound([]);
        setS2LookupError('File không có dữ liệu S2 hợp lệ.');
        return;
      }
      await runS2Lookup(tokens);
    } catch (e) {
      setS2LookupRows([]);
      setS2LookupNotFound([]);
      setS2LookupError(e?.message || 'Không đọc được file S2.');
    } finally {
      if (event?.target) event.target.value = '';
    }
  };

  const handleExportS2LookupExcel = async () => {
    if (s2LookupRows.length === 0 && s2LookupNotFound.length === 0) {
      setS2LookupError('Chưa có dữ liệu để xuất Excel.');
      return;
    }
    setS2LookupExporting(true);
    setS2LookupError('');
    try {
      const xlsx = await import('xlsx');
      const datePart = new Date().toISOString().slice(0, 10);
      const foundRows = s2LookupRows.map((r, idx) => ({
        STT: idx + 1,
        TRANG_THAI: 'Tìm thấy',
        S2_TRA_CUU: String(r?.queryS2 || ''),
        KY_HIEU_S2: String(r?.kyHieu || ''),
        TEN_SPLITTER: String(r?.tenSplitter || ''),
        TO_KT: String(r?.toTen || r?.toQL || ''),
        OLT: String(r?.oltTen || r?.thietBiOlt || ''),
        CARD: String(r?.cardTen || r?.cardOlt || ''),
        PORT_PON: String(r?.portTen || r?.portOlt || ''),
        TRAM_BTS: String(r?.tramTen || r?.veTinh || ''),
        CACHE_KEY: String(r?.cacheKey || ''),
      }));
      const missRows = s2LookupNotFound.map((s2, idx) => ({
        STT: foundRows.length + idx + 1,
        TRANG_THAI: 'Không tìm thấy',
        S2_TRA_CUU: String(s2 || ''),
        KY_HIEU_S2: '',
        TEN_SPLITTER: '',
        TO_KT: '',
        OLT: '',
        CARD: '',
        PORT_PON: '',
        TRAM_BTS: '',
        CACHE_KEY: '',
      }));
      const ws = xlsx.utils.json_to_sheet([...foundRows, ...missRows]);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'TRA_CUU_S2');
      const buffer = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bao_cao_tra_cuu_s2_${datePart}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setS2LookupError(e?.message || 'Lỗi xuất Excel tra cứu S2.');
    } finally {
      setS2LookupExporting(false);
    }
  };

  const handleDownloadTbMau = async () => {
    try {
      const xlsx = await import('xlsx');
      const sample = [
        {
          STT: 1,
          Acount: 'VD_ACCOUNT_001',
          'Tên KH': 'Nguyễn Văn B',
          'Địa chỉ': 'Số nhà …, xã …, tỉnh …',
          'Số ĐT': '0912345678',
          OLT: 'OLT Yên Quang',
          SLot: '3',
          PORT: '1',
          'Nhân viên QL': 'Nguyễn Văn A',
        },
      ];
      const ws = xlsx.utils.json_to_sheet(sample);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'TB');
      const buffer = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau_tra_cuu_tb.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setTbParseMessage(e?.message || 'Không tạo được file mẫu.');
    }
  };

  const loadTbSharedRows = async ({ silent = false } = {}) => {
    setTbSharedLoading(true);
    try {
      if (typeof window !== 'undefined' && !tbRows.length) {
        const raw = localStorage.getItem(TB_SHARED_LOCAL_CACHE_KEY);
        if (raw) {
          try {
            const cached = JSON.parse(raw);
            const cachedCount = Number(cached?.count || 0);
            if (cachedCount > 0) {
              setTbSharedMeta({
                fileName: String(cached?.fileName || ''),
                uploadedAt: String(cached?.uploadedAt || ''),
                count: cachedCount,
              });
              if (!silent) {
                setTbParseMessage(`Đang đồng bộ dữ liệu chung từ server${cached?.fileName ? ` (${cached.fileName})` : ''}...`);
              }
            }
          } catch {
            // bỏ qua cache hỏng
          }
        }
      }

      const res = await fetch('/api/tb-cache', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.message || 'Không đọc được dữ liệu dùng chung từ server.';
        if (!silent) setTbParseMessage(msg);
        return;
      }
      const rows = tbHydrateRows(data.rows);
      const meta = {
        fileName: String(data.fileName || ''),
        uploadedAt: String(data.uploadedAt || ''),
        count: rows.length,
      };
      setTbSharedMeta(meta);
      if (!rows.length) {
        if (!silent) {
          if (data.emptyReason === 'meta_no_rows') {
            setTbParseMessage(
              'Trên server vẫn còn bản ghi đồng bộ nhưng không còn dòng thuê bao đi kèm (có thể đã xóa tay hoặc lỗi lưu). Hãy upload lại file Excel.'
            );
          } else {
            setTbParseMessage(
              'Chưa có dữ liệu dùng chung trên server. Hãy upload 1 file Excel trên bất kỳ thiết bị nào (hoặc kiểm tra biến môi trường Supabase trên Vercel dùng đúng project có dữ liệu).'
            );
          }
        }
        return;
      }
      setTbRows(rows);
      setTbKetQua(null);
      setTbTimKiemLoi('');
      setTbNvQL('');
      setTbOlt('');
      setTbSlot('');
      setTbPort('');
      if (meta.fileName) setTbFileName(meta.fileName);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(TB_SHARED_LOCAL_CACHE_KEY, JSON.stringify({
            fileName: meta.fileName,
            uploadedAt: meta.uploadedAt,
            count: rows.length,
          }));
        } catch {
          // Bỏ qua lỗi quota localStorage
        }
      }
      const timeText = meta.uploadedAt ? new Date(meta.uploadedAt).toLocaleString('vi-VN') : '';
      if (!silent) {
        const base = `Đã tải ${rows.length} thuê bao từ dữ liệu dùng chung${timeText ? ` (${timeText})` : ''}.`;
        setTbParseMessage(
          data.partialRecovery
            ? `${base} Upload trước chưa chốt trên server — chỉ còn phần đã lưu (có thể upload lại để đồng bộ đủ).`
            : base
        );
      }
    } catch (e) {
      if (!silent && !tbRows.length) setTbParseMessage(e?.message || 'Không đọc được dữ liệu dùng chung từ server.');
    } finally {
      setTbSharedLoading(false);
    }
  };

  /** Cùng API/mật khẩu với Cài đặt / Báo cáo (`UNLOCK_PASSWORD`); đặt cookie httpOnly cho upload TB. */
  const unlockAdminWithPassword = async (password) => {
    try {
      const res = await fetch('/api/admin/unlock', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        return { ok: false, message: String(j?.message || 'Không thể mở khóa.') };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || 'Không xác thực được.' };
    }
  };

  const submitTbUploadGate = async (e) => {
    e.preventDefault();
    setTbUploadGateError('');
    setTbUploadGateSubmitting(true);
    try {
      const data = await unlockAdminWithPassword(tbUploadGatePassword);
      if (!data.ok) {
        setTbUploadGateError(data.message);
        return;
      }
      setTbUploadGateError('');
      setTbUploadGatePassword('');
      setAuthUnlocked(true);
      if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_AUTH_UNLOCKED, '1');
      setTbUploadGate({ status: 'unlocked', gateEnabled: true });
      setTbUploadPanelExpanded(true);
    } catch {
      setTbUploadGateError('Lỗi mạng khi gửi mật khẩu.');
    } finally {
      setTbUploadGateSubmitting(false);
    }
  };

  const handleTbUploadLock = async () => {
    try {
      await fetch('/api/admin/lock', { method: 'POST', credentials: 'include' });
    } catch {
      /* bỏ qua */
    }
    setTbUploadPanelExpanded(false);
    setTbUploadGate((g) => ({
      ...g,
      status: g.gateEnabled ? 'locked' : 'unlocked',
    }));
  };

  const loadTbTransferHistory = async ({ silent = true } = {}) => {
    if (!silent) setTbTransferLoading(true);
    try {
      const res = await fetch('/api/tb-transfer', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (!silent) setTbParseMessage(data?.message || 'Không đọc được lịch sử chuyển địa bàn từ server.');
        return;
      }
      const batches = Array.isArray(data?.batches) ? data.batches : [];
      setTbChuyenBatches(batches);
    } catch (e) {
      if (!silent) setTbParseMessage(e?.message || 'Không đọc được lịch sử chuyển địa bàn từ server.');
    } finally {
      if (!silent) setTbTransferLoading(false);
    }
  };

  const confirmTbTransferRow = async (batchId, rowIndex) => {
    const key = `${batchId}-${rowIndex}`;
    setTbConfirmingTransferKey(key);
    try {
      const res = await fetch('/api/tb-transfer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, rowIndex }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setTbParseMessage(data?.message || 'Không xác nhận được dòng lịch sử chuyển.');
        return;
      }
      setTbChuyenBatches((prev) =>
        prev.map((b) => {
          if (String(b?.id || '') !== String(batchId || '')) return b;
          const rows = Array.isArray(b.rows)
            ? b.rows.map((r, idx) => (idx === rowIndex ? { ...r, xacNhan: true, thoiGianXacNhan: new Date().toISOString() } : r))
            : [];
          return { ...b, rows };
        })
      );
      setTbParseMessage('Đã xác nhận 1 dòng lịch sử chuyển địa bàn.');
    } catch (e) {
      setTbParseMessage(e?.message || 'Không xác nhận được dòng lịch sử chuyển.');
    } finally {
      setTbConfirmingTransferKey('');
    }
  };

  const deleteTbTransferRow = async (batchId, rowIndex) => {
    const key = `${batchId}-${rowIndex}`;
    setTbDeletingTransferKey(key);
    try {
      const res = await fetch('/api/tb-transfer', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, rowIndex }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setTbParseMessage(data?.message || 'Không xóa được dòng lịch sử chuyển.');
        return;
      }
      setTbChuyenBatches((prev) =>
        prev
          .map((b) => {
            if (String(b?.id || '') !== String(batchId || '')) return b;
            const rows = Array.isArray(b.rows) ? b.rows.filter((_, idx) => idx !== rowIndex) : [];
            return { ...b, rows };
          })
          .filter((b) => Array.isArray(b.rows) && b.rows.length > 0)
      );
      setTbParseMessage('Đã xóa 1 dòng lịch sử chuyển địa bàn.');
    } catch (e) {
      setTbParseMessage(e?.message || 'Không xóa được dòng lịch sử chuyển.');
    } finally {
      setTbDeletingTransferKey('');
    }
  };

  const handleTbFileSelect = (event) => {
    const file = event?.target?.files?.[0] || null;
    setTbSelectedFile(file);
    if (file) {
      setTbFileName(file.name || '');
      setTbParseMessage('');
    }
  };

  const handleTbExcelUpload = async () => {
    const file = tbSelectedFile;
    if (!file) return;
    if (tbUploadGate.gateEnabled && tbUploadGate.status !== 'unlocked') {
      setTbParseMessage('Vui lòng nhập mật khẩu để mở khóa khu vực upload.');
      return;
    }
    setTbUploading(true);
    setTbUploadProgress({ phase: 'Đang đọc file Excel...', current: 0, total: 1, percent: 0 });
    setTbFileName(file.name || '');
    setTbParseMessage('');
    setTbKetQua(null);
    setTbTimKiemLoi('');
    setTbNvQL('');
    setTbOlt('');
    setTbSlot('');
    setTbPort('');
    try {
      const lowerName = String(file.name || '').toLowerCase();
      if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
        setTbRows([]);
        setTbParseMessage('Chỉ hỗ trợ file .xlsx hoặc .xls');
        return;
      }
      const xlsx = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = xlsx.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames?.[0];
      const ws = sheetName ? wb.Sheets[sheetName] : null;
      const matrix = ws ? xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) : [];
      if (!matrix.length) {
        setTbRows([]);
        setTbParseMessage('File không có dữ liệu.');
        return;
      }
      const col = tbResolveColumnIndices(matrix[0]);
      const need = ['nvQL', 'olt', 'slot', 'port'];
      const missing = need.filter((k) => col[k] == null);
      if (missing.length) {
        setTbRows([]);
        setTbParseMessage(
          `Thiếu cột bắt buộc trong dòng tiêu đề: ${missing.join(', ')}. Cần có: Nhân viên QL, OLT, SLOT, PORT (và các cột khác theo mẫu).`
        );
        return;
      }
      const out = [];
      for (let r = 1; r < matrix.length; r++) {
        const row = matrix[r];
        const nvQL = tbCell(row, col.nvQL);
        const olt = tbCell(row, col.olt);
        const slot = tbCell(row, col.slot);
        const port = tbCell(row, col.port);
        if (!nvQL && !olt && !slot && !port && !tbCell(row, col.account)) continue;
        out.push({
          id: tbNewRowId(),
          stt: tbCell(row, col.stt),
          tenKH: tbCell(row, col.tenKH),
          account: tbCell(row, col.account),
          diaChi: tbCell(row, col.diaChi),
          soDt: tbCell(row, col.soDt),
          olt,
          slot,
          port,
          nvQL,
        });
      }
      const hydratedRows = tbHydrateRows(out);
      setTbRows(hydratedRows);
      if (!hydratedRows.length) {
        setTbParseMessage('Không có dòng dữ liệu hợp lệ sau tiêu đề.');
        return;
      }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(TB_SHARED_LOCAL_CACHE_KEY, JSON.stringify({
            fileName: file.name || '',
            uploadedAt: new Date().toISOString(),
            count: hydratedRows.length,
          }));
        } catch {
          // Bỏ qua lỗi quota localStorage, vẫn tiếp tục lưu server
        }
      }
      let sharedSaved = false;
      let sharedSaveMessage = '';
      try {
        const chunkSize = 400;
        const totalChunks = Math.max(1, Math.ceil(hydratedRows.length / chunkSize));
        setTbUploadProgress({ phase: 'Đang upload dữ liệu lên server...', current: 0, total: totalChunks, percent: 0 });
        const uploadedAt = new Date().toISOString();
        const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        let finalData = null;
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = start + chunkSize;
          const chunk = hydratedRows.slice(start, end);
          const saveRes = await fetch('/api/tb-cache', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'chunk',
              uploadId,
              fileName: file.name || '',
              chunkIndex: i,
              totalChunks,
              totalCount: hydratedRows.length,
              uploadedAt,
              rows: chunk,
            }),
          });
          const saveData = await saveRes.json().catch(() => ({}));
          if (!saveRes.ok || !saveData?.ok) {
            const serverMsg = String(saveData?.message || saveRes.statusText || '');
            throw new Error(serverMsg || `Lỗi lưu chunk ${i + 1}/${totalChunks}.`);
          }
          const currentChunk = i + 1;
          const percent = Math.min(100, Math.round((currentChunk / totalChunks) * 100));
          setTbUploadProgress({
            phase: 'Đang upload dữ liệu lên server...',
            current: currentChunk,
            total: totalChunks,
            percent,
          });
          finalData = saveData;
        }
        if (finalData?.ok) {
          sharedSaved = true;
          setTbSharedMeta({
            fileName: String(finalData.fileName || file.name || ''),
            uploadedAt: String(finalData.uploadedAt || uploadedAt),
            count: Number(finalData.count || hydratedRows.length),
          });
        } else {
          sharedSaveMessage = 'Không nhận được phản hồi chốt upload.';
          setTbSharedMeta(null);
        }
      } catch (saveErr) {
        sharedSaveMessage = String(saveErr?.message || '');
        setTbSharedMeta(null);
      }
      setTbParseMessage(
        sharedSaved
          ? `Đã nhập ${hydratedRows.length} thuê bao từ file và lưu dùng chung để tra cứu trên thiết bị khác.`
          : `Đã nhập ${hydratedRows.length} thuê bao từ file (không lưu được dữ liệu dùng chung lên server${sharedSaveMessage ? `: ${sharedSaveMessage}` : ''}).`
      );
    } catch (e) {
      setTbRows([]);
      setTbParseMessage(e?.message || 'Không đọc được file Excel.');
    } finally {
      setTbUploading(false);
      setTbUploadProgress(null);
      setTbSelectedFile(null);
      if (tbFileInputRef.current) tbFileInputRef.current.value = '';
    }
  };

  const handleTbTraCuu = (e) => {
    e?.preventDefault?.();
    setTbTimKiemLoi('');
    if (!tbRows.length) {
      setTbTimKiemLoi('Vui lòng upload file Excel danh sách thuê bao.');
      setTbKetQua(null);
      return;
    }
    if (!tbNvQL || !tbOlt || !tbSlot || !tbPort) {
      setTbTimKiemLoi('Vui lòng chọn đủ Nhân viên QL, OLT, SLOT và Port.');
      setTbKetQua(null);
      return;
    }
    const found = tbRows.filter(
      (r) => r.nvQL === tbNvQL && r.olt === tbOlt && r.slot === tbSlot && String(r.port) === String(tbPort)
    );
    setTbKetQua(found);
  };

  const tbNvqlChoices = [...new Set(tbRows.map((r) => r.nvQL).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const tbByNv = !tbNvQL ? tbRows : tbRows.filter((r) => r.nvQL === tbNvQL);
  const tbOltChoices = [...new Set(tbByNv.map((r) => r.olt).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const tbByNvOlt = !tbOlt ? tbByNv : tbByNv.filter((r) => r.olt === tbOlt);
  const tbSlotChoices = [...new Set(tbByNvOlt.map((r) => r.slot).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));
  const tbByNvOltSlot = !tbSlot ? tbByNvOlt : tbByNvOlt.filter((r) => String(r.slot) === String(tbSlot));
  const tbPortChoices = [...new Set(tbByNvOltSlot.map((r) => r.port).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'vi', { numeric: true }));
  const tbResultRows = Array.isArray(tbKetQua) ? tbKetQua : [];
  const tbTotalPages = Math.max(1, Math.ceil(tbResultRows.length / tbPageSize));
  const tbCurrentPage = Math.min(tbPage, tbTotalPages);
  const tbStart = (tbCurrentPage - 1) * tbPageSize;
  const pagedTbRows = tbResultRows.slice(tbStart, tbStart + tbPageSize);

  const openTbChuyenModal = () => {
    if (!Array.isArray(tbKetQua) || tbKetQua.length === 0) return;
    setTbChuyenTargetNv('');
    setTbChuyenIds(new Set(tbKetQua.map((r) => r.id)));
    setTbShowChuyenModal(true);
  };

  const toggleTbChuyenId = (id) => {
    setTbChuyenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmTbChuyenDiaBan = async () => {
    const target = (tbChuyenTargetNv || '').trim();
    if (!target) {
      setTbParseMessage('Chọn Nhân viên QL đích để chuyển địa bàn.');
      return;
    }
    if (!Array.isArray(tbKetQua) || !tbKetQua.length) return;
    const picked = tbKetQua.filter((r) => tbChuyenIds.has(r.id));
    if (!picked.length) {
      setTbParseMessage('Chọn ít nhất một thuê bao trong danh sách.');
      return;
    }
    const thoiGian = new Date().toISOString();
    const thietBiThaoTac = await tbSummarizeThietBiThaoTacAsync();
    const batchRows = picked.map((r) => ({
      stt: r.stt,
      account: r.account,
      tenKH: r.tenKH,
      diaChi: r.diaChi,
      diaBanCu: r.nvQL,
      diaBanMoi: target,
    }));
    const newBatch = { id: tbNewRowId(), thoiGian, thietBiThaoTac, rows: batchRows };
    setTbChuyenBatches((prev) => [...prev, newBatch]);
    setTbRows((rows) =>
      rows.map((row) => {
        const hit = picked.find((p) => p.id === row.id);
        if (!hit) return row;
        return { ...row, nvQL: target };
      })
    );
    setTbKetQua((cur) =>
      Array.isArray(cur) ? cur.map((row) => (tbChuyenIds.has(row.id) ? { ...row, nvQL: target } : row)) : cur
    );
    try {
      const saveRes = await fetch('/api/tb-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: newBatch }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || !saveData?.ok) {
        setTbParseMessage(
          `Đã chuyển ${picked.length} thuê bao sang «${target}», nhưng không lưu được lịch sử server: ${saveData?.message || saveRes.statusText || 'Lỗi không rõ'}`
        );
        setTbShowChuyenModal(false);
        return;
      }
    } catch (saveErr) {
      setTbParseMessage(
        `Đã chuyển ${picked.length} thuê bao sang «${target}», nhưng không lưu được lịch sử server: ${saveErr?.message || 'Lỗi mạng'}`
      );
      setTbShowChuyenModal(false);
      return;
    }
    setTbShowChuyenModal(false);
    setTbParseMessage(`Đã chuyển ${picked.length} thuê bao sang «${target}». Có thể xem/xuất ở mục Báo cáo.`);
  };

  const handleExportTbChuyenExcel = async () => {
    const flat = [];
    tbChuyenBatches.forEach((batch) => {
      batch.rows.forEach((r) => {
        const diaBanCu = r.diaBanCu ?? r.nvQLCu ?? '';
        const diaBanMoi = r.diaBanMoi ?? r.nvQLMoi ?? '';
        flat.push({
          STT: flat.length + 1,
          Account: r.account ?? '',
          'Tên KH': r.tenKH ?? '',
          'Địa chỉ': r.diaChi ?? '',
          'Địa bàn cũ': diaBanCu,
          'Địa bàn mới': diaBanMoi,
          'Thời gian chuyển': new Date(batch.thoiGian).toLocaleString('vi-VN'),
          'Thiết bị thao tác': batch.thietBiThaoTac || '—',
        });
      });
    });
    if (!flat.length) {
      setTbParseMessage('Chưa có thuê bao nào được chuyển địa bàn để xuất.');
      return;
    }
    setTbExporting(true);
    try {
      const xlsx = await import('xlsx');
      const ws = xlsx.utils.json_to_sheet(flat);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'CHUYEN_DIA_BAN');
      const buffer = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thue_bao_chuyen_dia_ban_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setTbParseMessage(e?.message || 'Lỗi xuất Excel.');
    } finally {
      setTbExporting(false);
    }
  };

  useEffect(() => {
    refreshPonOneSp2Stats();
    refreshOltPonDetailRows();
    refreshNoSp2Rows();
    refreshS2CapacityRows();
  }, []);

  useEffect(() => {
    if (activeMainModule !== TB_MODULE_TB) return undefined;
    let cancelled = false;
    setTbUploadGate({ status: 'checking', gateEnabled: false });
    setTbUploadGateError('');
    fetch('/api/admin/unlock', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.gateEnabled) {
          setTbUploadGate({ status: 'unlocked', gateEnabled: false });
          return;
        }
        setTbUploadGate({
          status: data.unlocked ? 'unlocked' : 'locked',
          gateEnabled: true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setTbUploadGate({ status: 'locked', gateEnabled: true });
          setTbUploadGateError('Không kiểm tra được khóa upload. Thử tải lại trang.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeMainModule]);

  useEffect(() => {
    if (tbUploading) setTbUploadPanelExpanded(true);
  }, [tbUploading]);

  useEffect(() => {
    if (activeMainModule !== TB_MODULE_TB) return;
    if (tbRows.length) return;
    loadTbSharedRows({ silent: true });
  }, [activeMainModule, tbRows.length]);

  useEffect(() => {
    if (activeMainModule !== TB_MODULE_TB) return undefined;
    if (tbRows.length) return undefined;

    const onWake = () => {
      if (document.visibilityState === 'visible') {
        loadTbSharedRows({ silent: true });
      }
    };

    const onFocus = () => {
      loadTbSharedRows({ silent: true });
    };

    const interval = window.setInterval(() => {
      loadTbSharedRows({ silent: true });
    }, 15000);

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onFocus);
    };
  }, [activeMainModule, tbRows.length]);

  useEffect(() => {
    if (activeMainModule !== TB_MODULE_TB) return;
    loadTbTransferHistory({ silent: true });
  }, [activeMainModule]);

  useEffect(() => {
    setTbPage(1);
  }, [tbKetQua, tbPageSize]);

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

  useEffect(() => {
    setS2LookupPage(1);
  }, [s2LookupRows, s2LookupPageSize]);

  // Đồng bộ key của toQL khi nguồn dữ liệu đổi kiểu (uuid <-> donviId) để dropdown không rơi về "-- Chọn --".
  useEffect(() => {
    if (!Array.isArray(listToQL) || listToQL.length === 0) return;
    const current = String(toQL || '').trim();
    if (!current) return;
    const hasExact = listToQL.some((item) => optionValue(item) === current);
    if (hasExact) return;
    const matched = listToQL.find((item) =>
      String(item?.id ?? '').trim() === current ||
      String(item?.donviId ?? item?.DONVI_ID ?? '').trim() === current
    );
    if (matched) {
      const next = optionValue(matched);
      if (next && next !== current) setToQL(next);
    }
  }, [listToQL, toQL]);

  /** Khi chưa có danh sách Tổ KT từ API nhưng đã có snapshot đồng bộ — đổ từ snapshot. */
  useEffect(() => {
    if (!browseSnapshot?.toKyThuat?.length) return;
    if (listToQL.length > 0) return;
    const list = browseSnapshot.toKyThuat;
    setListToQL(list);
    setListError('');
    const nhoQuan = pickDefaultToQlItem(list);
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

  function oltOptionLabel(item) {
    if (item == null) return '';
    if (typeof item === 'string' || typeof item === 'number') {
      const id = String(item);
      const key = `${toQL}|${veTinh}`;
      const pool = Array.isArray(browseSnapshot?.oltByTram?.[key]) ? browseSnapshot.oltByTram[key] : [];
      const found = pool.find((x) => String(x?.THIETBI_ID ?? x?.OLT_ID ?? x?.id ?? x?.value ?? '') === id);
      const name = found?.TEN_OLT ?? found?.TEN_TB ?? found?.ten ?? found?.name ?? found?.label ?? found?.title;
      return name ? String(name) : id;
    }
    const direct = item?.TEN_OLT ?? item?.TEN_TB ?? item?.ten ?? item?.name ?? item?.label ?? item?.title;
    if (direct != null && String(direct).trim()) return String(direct);
    const id = String(item?.THIETBI_ID ?? item?.OLT_ID ?? item?.id ?? item?.value ?? '');
    if (!id) return '';
    const key = `${toQL}|${veTinh}`;
    const pool = Array.isArray(browseSnapshot?.oltByTram?.[key]) ? browseSnapshot.oltByTram[key] : [];
    const found = pool.find((x) => String(x?.THIETBI_ID ?? x?.OLT_ID ?? x?.id ?? x?.value ?? '') === id);
    const name = found?.TEN_OLT ?? found?.TEN_TB ?? found?.ten ?? found?.name ?? found?.label ?? found?.title;
    return name ? String(name) : id;
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
      const fetchOpts = { headers, cache: 'no-store' };
      const [resTtvt, resToQL] = await Promise.all([
        fetch(urlTtvt, fetchOpts),
        fetch(urlToQL, fetchOpts),
      ]);
      const dataTtvt = await resTtvt.json().catch(() => ({}));
      const dataToQL = await resToQL.json().catch(() => ({}));
      LOG('loadDanhSach TTVT', { status: resTtvt.status, ok: resTtvt.ok, data: dataTtvt, list: normaliseList(dataTtvt).length });
      LOG('loadDanhSach ToQL', { status: resToQL.status, ok: resToQL.ok, data: dataToQL, list: normaliseList(dataToQL).length });
      const rawTtvt = normaliseList(dataTtvt);
      const rawToQL = normaliseList(dataToQL);
      const listTtvtFinal = sanitizeSelectOptions(resTtvt.ok && rawTtvt.length > 0 ? rawTtvt : FALLBACK_TTVT_LIST);
      const listToQLFinal = sanitizeSelectOptions(resToQL.ok && rawToQL.length > 0 ? rawToQL : FALLBACK_TO_KY_THUAT);
      setListTtvt(listTtvtFinal);
      setListToQL(listToQLFinal);
      const nhoQuan = pickDefaultToQlItem(listToQLFinal);
      if (nhoQuan != null) setToQL(optionValue(nhoQuan));
      if (!resTtvt.ok && !resToQL.ok && rawTtvt.length === 0 && rawToQL.length === 0) {
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
      setListTtvt(FALLBACK_TTVT_LIST);
      setListToQL(FALLBACK_TO_KY_THUAT);
      const nhoQuan = pickDefaultToQlItem(FALLBACK_TO_KY_THUAT);
      if (nhoQuan != null) setToQL(optionValue(nhoQuan));
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadDanhSach();
    refreshBrowseSnapshot();
  }, [authorization]);

  // Sau khi có danh sách Trạm BTS cho tổ đang chọn, tự chọn phần tử đầu nếu chưa chọn.
  useEffect(() => {
    if (!toQL) return;
    const valid = sanitizeSelectOptions(listVeTinh);
    if (!valid.length) return;
    const current = String(veTinh || '');
    const exists = current && valid.some((item) => optionValue(item) === current);
    if (exists) return;
    const next = optionValue(valid[0]);
    if (next && next !== current) setVeTinh(next);
  }, [toQL, veTinh, listVeTinh]);

  // Sau khi có danh sách OLT của Trạm BTS đang chọn, tự chọn phần tử đầu nếu chưa chọn.
  useEffect(() => {
    if (!veTinh) return;
    const valid = sanitizeSelectOptions(listThietBiOlt);
    if (!valid.length) return;
    const current = String(thietBiOlt || '');
    const exists = current && valid.some((item) => optionValue(item) === current);
    if (exists) return;
    const next = optionValue(valid[0]);
    if (next && next !== current) setThietBiOlt(next);
  }, [veTinh, thietBiOlt, listThietBiOlt]);

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
    fetch(url, { headers: { Authorization: auth.trim() }, cache: 'no-store' })
      .then((r) => {
        LOG('VeTinh response', r.status, r.ok);
        return r.json().catch(() => ({})).then((data) => ({ ok: r.ok, status: r.status, data }));
      })
      .then(({ ok, status, data }) => {
        LOG('VeTinh data', data, 'list length', normaliseList(data).length);
        const list = sanitizeSelectOptions(normaliseList(data));
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload && list.length > 0) {
          setListError('');
          setListVeTinh(list);
          return;
        }
        const fromBrowse = browseSnapshotRef.current?.tramByTo?.[toQL];
        const fromBrowseClean = sanitizeSelectOptions(fromBrowse);
        if (fromBrowseClean.length > 0) {
          setListError('');
          setListVeTinh(fromBrowseClean);
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
        const fromBrowseClean = sanitizeSelectOptions(fromBrowse);
        if (fromBrowseClean.length > 0) {
          setListError('');
          setListVeTinh(fromBrowseClean);
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
    fetch(url, { headers: { Authorization: auth.trim() }, cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const listOlt = sanitizeSelectOptions(normaliseList(data));
        LOG('OLT data', { ok, len: listOlt.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload && listOlt.length > 0) {
          setListError('');
          setListThietBiOlt(listOlt);
          return;
        }
        const key = `${toQL}|${veTinh}`;
        const fromBrowse = browseSnapshotRef.current?.oltByTram?.[key];
        const fromBrowseClean = sanitizeSelectOptions(fromBrowse);
        if (fromBrowseClean.length > 0) {
          setListError('');
          setListThietBiOlt(fromBrowseClean);
          return;
        }
        if (!ok && data?.message) setListError(data.message || 'Không tải được danh sách Thiết bị OLT.');
        setListThietBiOlt([]);
      })
      .catch((e) => {
        const key = `${toQL}|${veTinh}`;
        const fromBrowse = browseSnapshotRef.current?.oltByTram?.[key];
        const fromBrowseClean = sanitizeSelectOptions(fromBrowse);
        if (fromBrowseClean.length > 0) {
          setListError('');
          setListThietBiOlt(fromBrowseClean);
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
    fetch(url, { headers: { Authorization: auth.trim() }, cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const list = normaliseList(data);
        LOG('Card OLT data', { ok, len: list.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload && list.length > 0) {
          setListError('');
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
    fetch(url, { headers: { Authorization: auth.trim() }, cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const list = normaliseList(data);
        LOG('Port OLT data', { ok, len: list.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload && list.length > 0) {
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
      const r = await unlockAdminWithPassword(authPasswordInput);
      if (!r.ok) {
        setAuthPasswordError(r.message);
        return;
      }
      setAuthUnlocked(true);
      setShowSettings(true);
      setShowReportPanel(Boolean(unlockToOpenReport));
      if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_AUTH_UNLOCKED, '1');
      setAuthPasswordInput('');
      setTbUploadGate({ status: 'unlocked', gateEnabled: true });
      if (unlockToOpenReport) {
        setUnlockToOpenReport(false);
      }
    } finally {
      setAuthUnlocking(false);
    }
  };

  const handleLockAuth = () => {
    setAuthUnlocked(false);
    setShowSettings(false);
    setShowReportPanel(false);
    setShowReportMenu(false);
    setUnlockToOpenReport(false);
    if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_AUTH_UNLOCKED);
    fetch('/api/admin/lock', { method: 'POST', credentials: 'include' }).catch(() => {});
    setTbUploadGate((g) => ({
      ...g,
      status: g.gateEnabled ? 'locked' : 'unlocked',
    }));
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

  const startFullSync = async ({ authOverride = '', adminPasswordOverride = '' } = {}) => {
    const auth = (authOverride && authOverride.trim()) || (authorization && authorization.trim()) || '';
    if (syncRunning) return { skipped: true };
    setListError('');
    clearSyncProgressTimer();
    syncProgressLatestRef.current = null;
    syncProgressLastAtRef.current = 0;
    syncAbortRef.current = new AbortController();
    setSyncRunning(true);
    setSyncProgress({ phase: 'scan', done: 0, total: 0, label: 'Đang chuẩn bị…' });
    try {
      const pwd = (adminPasswordOverride && adminPasswordOverride.trim()) || adminPasswordForSync.trim();
      const result = await runFullSp2Sync({
        auth,
        signal: syncAbortRef.current.signal,
        onProgress: (p) => pushSyncProgress(p),
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
        setListError(`Đồng bộ xong với ${result.errors} lỗi (tra cứu API) trên ${result.total} port. Có thể chạy lại.`);
      }
      return { skipped: false, result };
    } catch (err) {
      LOG('Đồng bộ toàn bộ', err);
      setListError(err.message || 'Lỗi đồng bộ toàn bộ.');
      return { skipped: false, error: err };
    } finally {
      clearSyncProgressTimer();
      setSyncRunning(false);
      syncAbortRef.current = null;
      setSyncProgress(null);
    }
  };

  const handleDongBoToanBo = async () => {
    await startFullSync();
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
        const syncAuth = authorization?.trim() || '';
        const syncAdminPwd = adminPasswordForServer?.trim() || '';
        setSaveToServerStatus('ok');
        setSaveToServerMessage('Đã lưu. Đang tự động đồng bộ dữ liệu S2...');
        setAdminPasswordForServer('');
        setShowSettings(false);
        if (!syncRunning && syncAuth) {
          startFullSync({ authOverride: syncAuth, adminPasswordOverride: syncAdminPwd })
            .then((r) => {
              if (r?.skipped) {
                setSaveToServerMessage('Đã lưu. Đồng bộ đang chạy sẵn, tiếp tục dùng tra cứu bình thường.');
                return;
              }
              if (r?.error) {
                setSaveToServerMessage(`Đã lưu nhưng tự đồng bộ lỗi: ${r.error?.message || 'Không xác định'}`);
                return;
              }
              setSaveToServerMessage('Đã lưu và tự động đồng bộ hoàn tất. Bạn vẫn có thể tra cứu trong lúc đồng bộ.');
            })
            .catch((syncErr) => {
              setSaveToServerMessage(`Đã lưu nhưng tự đồng bộ lỗi: ${syncErr?.message || 'Không xác định'}`);
            });
        } else if (!syncAuth) {
          setSaveToServerMessage('Đã lưu. Không thể tự đồng bộ vì Authorization đang trống.');
        } else {
          setSaveToServerMessage('Đã lưu. Đồng bộ đang chạy sẵn, tiếp tục dùng tra cứu bình thường.');
        }
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
      let apiFallbackNotice = '';

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
            'Chưa có dữ liệu đồng bộ cho bộ lọc này. Quản trị có thể chạy đồng bộ đầy đủ lên server, hoặc tắt «Chỉ tra cứu từ cache».'
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

      // Neu co Authorization thi uu tien goi API truoc, cache chi la fallback.
      if (authTrim && !boQuaCache) {
        try {
          const headers = { 'Content-Type': 'application/json', Authorization: authTrim };
          const res = await fetch('/api/tracuu', { method: 'POST', headers, body: JSON.stringify(body) });
          const data = await res.json().catch(() => ({}));
          LOG('Tra cứu', 'Response (API ưu tiên)', { status: res.status, ok: res.ok, data });
          if (res.ok) {
            const list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
            const message = data?.message || (list.length === 0 ? 'Không có bản ghi nào từ API.' : null);
            setKetQua({ data: Array.isArray(list) ? list : [], message, fromCache: 'api' });
            return;
          }
          apiFallbackNotice = data?.message || data?.error || `API lỗi (${res.status}), đã chuyển sang cache.`;
        } catch (err) {
          apiFallbackNotice = err?.message || 'Không gọi được API, đã chuyển sang cache.';
        }
      }

      if (!boQuaCache) {
        const srv = await fetchServerPortCache(keyBody);
        if (srv !== undefined && srv !== null) {
          const cacheMsg =
            srv.length === 0
              ? 'Không có bản ghi trong cache chung. Bật «Luôn gọi API» để hỏi lại OneBSS.'
              : null;
          const message = apiFallbackNotice
            ? [apiFallbackNotice, cacheMsg].filter(Boolean).join(' ')
            : cacheMsg;
          setKetQua({ data: srv, message, fromCache: 'server' });
          return;
        }
        const cached = await getPortCache(cacheKey, fp);
        if (cached !== null) {
          const cacheMsg =
            cached.length === 0
              ? 'Không có bản ghi trong bộ nhớ trình duyệt. Bật «Luôn gọi API» để hỏi lại server.'
              : null;
          const message = apiFallbackNotice
            ? [apiFallbackNotice, cacheMsg].filter(Boolean).join(' ')
            : cacheMsg;
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
  const s2LookupTotalPages = Math.max(1, Math.ceil(s2LookupRows.length / s2LookupPageSize));
  const s2LookupCurrentPage = Math.min(s2LookupPage, s2LookupTotalPages);
  const s2LookupStart = (s2LookupCurrentPage - 1) * s2LookupPageSize;
  const pagedS2LookupRows = s2LookupRows.slice(s2LookupStart, s2LookupStart + s2LookupPageSize);

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
                  Đã gom được <span className="text-white">{syncProgress.s2Count ?? 0}</span> S2
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
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 pr-0 sm:pr-2">
                <h1 className="text-base sm:text-2xl font-bold text-white tracking-tight sm:truncate">
                  {activeMainModule === TB_MODULE_TB ? 'Module tra cứu thuê bao (TB)' : 'Module tra cứu S2'}
                </h1>
                <p className="text-sky-100 text-[11px] sm:text-sm mt-0.5 sm:mt-1 leading-snug hidden sm:block">
                  {activeMainModule === TB_MODULE_TB
                    ? 'Upload Excel, lọc theo nhân viên QL / OLT / Slot / Port, chuyển địa bàn và xuất Excel.'
                    : 'Hệ thống tra cứu thông tin S2 theo OLT, Slot và Port'}
                </p>
                <p className="text-sky-100/95 text-[10px] leading-snug mt-1 line-clamp-2 sm:hidden">
                  {activeMainModule === TB_MODULE_TB
                    ? 'Excel · NV QL / OLT / Slot / Port · chuyển địa bàn · xuất file'
                    : 'Tra cứu S2 theo OLT, Slot, Port'}
                </p>
              </div>
              <div
                className="grid grid-cols-2 grid-rows-2 gap-1.5 w-full sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2 shrink-0 sm:w-auto sm:max-w-[min(100%,52rem)]"
                ref={reportMenuRef}
              >
                <div className="relative order-1 sm:order-3 min-h-[48px] sm:min-h-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!authUnlocked) {
                        setShowSettings(true);
                        setShowReportMenu(false);
                        setUnlockToOpenReport(true);
                        setAuthPasswordError('Vui lòng nhập mã để mở menu báo cáo.');
                        return;
                      }
                      setShowSettings(true);
                      setShowReportPanel(true);
                      setShowReportMenu((v) => !v);
                    }}
                    className="inline-flex w-full h-full min-h-[48px] sm:min-h-[44px] sm:h-auto sm:w-auto shrink-0 items-center justify-center gap-1 sm:gap-2 rounded-lg border font-medium touch-manipulation transition-colors px-1.5 py-2 sm:px-4 sm:py-2.5 text-[10px] sm:text-sm leading-tight bg-white/20 hover:bg-white/30 text-white border-white/40"
                    aria-label={`Menu báo cáo - đang chọn ${activeReport.label}`}
                    aria-expanded={showReportMenu}
                  >
                    <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v4H3V3zm0 7h18v4H3v-4zm0 7h18v4H3v-4z" />
                    </svg>
                    <span>Báo cáo</span>
                    <svg className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 transition-transform ${showReportMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showReportMenu && (
                    <div className="absolute left-0 right-0 sm:left-auto sm:right-0 mt-2 w-auto sm:w-[290px] sm:max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-xl z-20">
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
                  className="inline-flex order-2 sm:order-4 w-full min-h-[48px] sm:min-h-[44px] sm:w-auto shrink-0 items-center justify-center gap-1 sm:gap-2 rounded-lg border font-medium touch-manipulation transition-colors px-1.5 py-2 sm:px-4 sm:py-2.5 text-[10px] sm:text-sm leading-tight bg-white/20 hover:bg-white/30 text-white border-white/40"
                  aria-label={showSettings ? 'Ẩn cài đặt' : 'Cài đặt và đồng bộ'}
                >
                  <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span>{showSettings ? 'Ẩn cài đặt' : 'Cài đặt'}</span>
                  <span className="hidden sm:inline">{showSettings ? '' : ' / Đồng bộ'}</span>
                  <svg className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeMainModule === TB_MODULE_SPLITTER}
                  aria-label="Tra cứu S2"
                  title="Tra cứu S2"
                  onClick={() => {
                    setActiveMainModule(TB_MODULE_SPLITTER);
                    setShowSettings(false);
                    setShowReportPanel(false);
                    setShowReportMenu(false);
                  }}
                  className={`inline-flex order-3 sm:order-1 w-full min-h-[48px] sm:min-h-[44px] sm:w-auto min-w-0 justify-center items-center gap-1 sm:gap-2 rounded-lg border font-medium touch-manipulation transition-colors px-1.5 py-2 sm:px-4 sm:py-2.5 text-[10px] sm:text-sm leading-tight text-center ${
                    activeMainModule === TB_MODULE_SPLITTER
                      ? 'bg-white text-sky-700 border-white shadow-sm'
                      : 'bg-white/20 hover:bg-white/30 text-white border-white/40'
                  }`}
                >
                  Tra cứu S2
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeMainModule === TB_MODULE_TB}
                  aria-label="Module tra cứu thuê bao"
                  title="Tra cứu TB"
                  onClick={() => {
                    setActiveMainModule(TB_MODULE_TB);
                    setShowSettings(false);
                    setShowReportPanel(false);
                    setShowReportMenu(false);
                  }}
                  className={`inline-flex order-4 sm:order-2 w-full min-h-[48px] sm:min-h-[44px] sm:w-auto min-w-0 justify-center items-center gap-1 sm:gap-2 rounded-lg border font-medium touch-manipulation transition-colors px-1.5 py-2 sm:px-4 sm:py-2.5 text-[10px] sm:text-sm leading-tight text-center ${
                    activeMainModule === TB_MODULE_TB
                      ? 'bg-white text-sky-700 border-white shadow-sm'
                      : 'bg-white/20 hover:bg-white/30 text-white border-white/40'
                  }`}
                >
                  Tra cứu TB
                </button>
              </div>
            </div>
          </div>

          {/* Cài đặt — khu vực quản trị */}
          {showSettings && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-3 sm:px-8 py-3 sm:py-4 shrink-0">
              {!authUnlocked ? (
                <form onSubmit={handleUnlockAuth} className="space-y-3 max-w-xs">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nhập mã để mở cài đặt</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      value={authPasswordInput}
                      onChange={(e) => { setAuthPasswordInput(e.target.value); setAuthPasswordError(''); }}
                      placeholder="Mã mở khóa"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                      autoComplete="current-password"
                    />
                    <button type="submit" disabled={authUnlocking} className="rounded-lg bg-sky-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-sky-700 min-h-[44px] whitespace-nowrap disabled:opacity-50">
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
                    <label className="block text-xs font-semibold text-slate-600">Authorization</label>
                    <button type="button" onClick={handleLockAuth} className="text-xs text-slate-500 hover:text-slate-700 underline">
                      Khóa lại
                    </button>
                  </div>
                  <input
                    type="password"
                    value={authorization}
                    onChange={(e) => saveAuth(e.target.value)}
                    placeholder="Authorization"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-800 placeholder-slate-400 text-base sm:text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                  />
                  <form onSubmit={handleSaveToServer} className="mt-3 space-y-2">
                    <label className="block text-xs text-slate-600">Mã xác thực lưu server</label>
                    <div className="flex gap-2 flex-wrap items-center">
                      <input
                        type="password"
                        value={adminPasswordForServer}
                        onChange={(e) => { setAdminPasswordForServer(e.target.value); setSaveToServerStatus(''); }}
                        placeholder="Mã xác thực"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48 max-w-full"
                      />
                      <button type="submit" disabled={saveToServerStatus === 'saving' || !authorization?.trim()} className="rounded-lg bg-sky-600 text-white px-4 py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
                        {saveToServerStatus === 'saving' ? 'Đang lưu...' : 'Lưu lên server'}
                      </button>
                    </div>
                    {saveToServerMessage && <p className={`text-xs ${saveToServerStatus === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{saveToServerMessage}</p>}
                  </form>
                    </>
                  )}

                  <div className="mt-5 pt-5 border-t border-slate-200 space-y-3">
                    {!showReportPanel && (
                      <>
                    <p className="text-xs font-semibold text-slate-700">Đồng bộ toàn bộ S2 &amp; cache tra cứu</p>
                    <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                      Quét Tổ KT → Trạm → OLT → Card → Port. Số port lớn có thể mất nhiều phút.
                    </p>
                    <div className="max-w-lg">
                      <label className="block text-[11px] sm:text-xs text-slate-600">
                        Mã xác thực (ghi cache chung)
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
                          <> — hiện <strong>{syncProgress.s2Count ?? 0}</strong> S2 đã gom</>
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
                          <> — <span className="font-semibold">{serverSyncMeta.lastSyncS2Total}</span> S2 đã gom</>
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
                      {activeReportId === 's2_lookup' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Lấy thông số S2 theo danh sách đầu vào
                            </p>
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={String(s2LookupPageSize)}
                                onChange={(e) => setS2LookupPageSize(Number(e.target.value) || 10)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Số dòng hiển thị mỗi trang"
                              >
                                <option value="10">10 dòng/trang</option>
                                <option value="20">20 dòng/trang</option>
                                <option value="50">50 dòng/trang</option>
                                <option value="100">100 dòng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportS2LookupExcel}
                                disabled={s2LookupExporting}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {s2LookupExporting ? 'Đang xuất…' : 'Xuất Excel'}
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2 mb-2">
                            <textarea
                              value={s2LookupInput}
                              onChange={(e) => setS2LookupInput(e.target.value)}
                              rows={4}
                              placeholder="Nhập danh sách S2 (mỗi dòng 1 mã, hoặc ngăn cách bằng dấu phẩy/chấm phẩy)"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-700 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            />
                            <div className="flex flex-col sm:flex-row lg:flex-col gap-1.5 lg:items-end">
                              <button
                                type="button"
                                onClick={handleLookupSingleS2}
                                disabled={s2LookupLoading}
                                className="w-full sm:w-auto text-[11px] px-2.5 py-1.5 rounded border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                              >
                                {s2LookupLoading ? 'Đang tra cứu…' : 'Tra cứu danh sách'}
                              </button>
                              <label className="w-full sm:w-auto text-center text-[11px] px-2.5 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">
                                Upload file S2
                                <input
                                  type="file"
                                  accept=".txt,.csv,.xlsx,.xls"
                                  onChange={handleLookupS2File}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-2">
                            Hỗ trợ file TXT/CSV/Excel. Hệ thống sẽ tìm S2 đang nằm ở OLT, Card, Port nào trong cache đồng bộ.
                            {s2LookupFileName ? ` File gần nhất: ${s2LookupFileName}.` : ''}
                          </p>
                          {s2LookupError && <p className="text-[11px] text-red-600 mb-1">{s2LookupError}</p>}
                          {!s2LookupError && s2LookupRows.length === 0 && s2LookupNotFound.length === 0 && !s2LookupLoading && (
                            <p className="text-[11px] text-slate-500">Chưa có dữ liệu tra cứu S2.</p>
                          )}
                          {s2LookupNotFound.length > 0 && (
                            <p className="text-[11px] text-amber-700 mb-1">
                              Không tìm thấy {s2LookupNotFound.length} mã S2: {s2LookupNotFound.slice(0, 10).join(', ')}
                              {s2LookupNotFound.length > 10 ? '…' : ''}
                            </p>
                          )}
                          {s2LookupRows.length > 0 && (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[680px] text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">S2 tra cứu</th>
                                    <th className="text-left py-1 px-2 font-semibold">Ký hiệu S2</th>
                                    <th className="text-left py-1 px-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Card</th>
                                    <th className="text-left py-1 px-2 font-semibold">Port</th>
                                    <th className="text-left py-1 pl-2 font-semibold">Tổ KT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedS2LookupRows.map((row, idx) => (
                                    <tr
                                      key={`${String(row?.cacheKey || '')}-lookup-${s2LookupStart + idx}`}
                                      className="border-b border-slate-100 last:border-b-0 text-slate-700"
                                    >
                                      <td className="py-1.5 pr-2">{String(row?.queryS2 || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.kyHieu || row?.tenSplitter || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.oltTen || row?.thietBiOlt || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.cardTen || row?.cardOlt || '—')}</td>
                                      <td className="py-1.5 px-2">{String(row?.portTen || row?.portOlt || '—')}</td>
                                      <td className="py-1.5 pl-2">{String(row?.toTen || row?.toQL || '—')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {s2LookupRows.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-600">
                                Hiển thị {s2LookupStart + 1}-{Math.min(s2LookupStart + s2LookupPageSize, s2LookupRows.length)} / {s2LookupRows.length} dòng
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setS2LookupPage((p) => Math.max(1, p - 1))}
                                  disabled={s2LookupCurrentPage <= 1}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang trước
                                </button>
                                <span className="text-[11px] text-slate-600">
                                  Trang {s2LookupCurrentPage}/{s2LookupTotalPages}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setS2LookupPage((p) => Math.min(s2LookupTotalPages, p + 1))}
                                  disabled={s2LookupCurrentPage >= s2LookupTotalPages}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang sau
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : activeReportId === 's2_capacity' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Báo cáo dung lượng S2
                            </p>
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={s2CapacityToFilter}
                                onChange={(e) => setS2CapacityToFilter(e.target.value)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {s2CapacityExporting ? 'Đang xuất…' : 'Xuất Excel'}
                              </button>
                              <button
                                type="button"
                                onClick={refreshS2CapacityRows}
                                disabled={s2CapacityLoading}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[720px] text-[11px]">
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
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={noSp2ToFilter}
                                onChange={(e) => setNoSp2ToFilter(e.target.value)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {noSp2Exporting ? 'Đang xuất…' : 'Xuất Excel'}
                              </button>
                              <button
                                type="button"
                                onClick={refreshNoSp2Rows}
                                disabled={noSp2Loading}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[680px] text-[11px]">
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
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={oltPonToFilter}
                                onChange={(e) => setOltPonToFilter(e.target.value)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
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
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {oltPonExporting ? 'Đang xuất…' : (oltPonFilter ? 'Xuất Excel theo OLT' : 'Xuất Excel tất cả OLT')}
                              </button>
                              <button
                                type="button"
                                onClick={refreshOltPonDetailRows}
                                disabled={oltPonLoading}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[760px] text-[11px]">
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
                      ) : activeReportId === 'tb_chuyen_dia_ban' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Lịch sử chuyển địa bàn thuê bao
                            </p>
                            <button
                              type="button"
                              onClick={handleExportTbChuyenExcel}
                              disabled={tbExporting || tbChuyenBatches.length === 0}
                              className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {tbExporting ? 'Đang xuất…' : 'Xuất Excel'}
                            </button>
                          </div>
                          {tbChuyenBatches.length === 0 ? (
                            tbTransferLoading ? (
                              <p className="text-[11px] text-slate-500">Đang tải lịch sử chuyển địa bàn...</p>
                            ) : (
                              <p className="text-[11px] text-slate-500">
                                Chưa có dữ liệu lịch sử chuyển địa bàn. Hãy thực hiện chuyển địa bàn trong module Tra cứu TB trước.
                              </p>
                            )
                          ) : (
                            <>
                              <p className="text-[10px] text-slate-500 mb-2">
                                Đã ghi nhận {tbChuyenBatches.reduce((n, b) => n + b.rows.length, 0)} dòng trong {tbChuyenBatches.length} lần thao tác.
                              </p>
                              <div className="overflow-x-auto -mx-1 px-1 max-h-[380px]">
                                <table className="min-w-[860px] text-[11px]">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-600">
                                      <th className="text-left py-1 pr-2 font-semibold">STT</th>
                                      <th className="text-left py-1 px-2 font-semibold">Account</th>
                                      <th className="text-left py-1 px-2 font-semibold">Tên KH</th>
                                      <th className="text-left py-1 px-2 font-semibold">Địa chỉ</th>
                                      <th className="text-left py-1 px-2 font-semibold">Địa bàn cũ</th>
                                      <th className="text-left py-1 px-2 font-semibold">Địa bàn mới</th>
                                      <th className="text-left py-1 px-2 font-semibold">Thời gian chuyển</th>
                                      <th className="text-left py-1 pl-2 font-semibold">Thiết bị thao tác</th>
                                      <th className="text-right py-1 pl-2 font-semibold">Thao tác</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tbChuyenBatches.flatMap((batch, bi) =>
                                      batch.rows.map((r, ri) => {
                                        const diaBanCu = r.diaBanCu ?? r.nvQLCu;
                                        const diaBanMoi = r.diaBanMoi ?? r.nvQLMoi;
                                        const globalStt =
                                          tbChuyenBatches.slice(0, bi).reduce((n, x) => n + x.rows.length, 0) + ri + 1;
                                        const rowKey = `${batch.id}-${ri}`;
                                        const daXacNhan = Boolean(r?.xacNhan);
                                        return (
                                          <tr key={`${batch.id}-report-${ri}`} className="border-b border-slate-100 last:border-b-0 text-slate-700">
                                            <td className="py-1.5 pr-2">{globalStt}</td>
                                            <td className="py-1.5 px-2">{r.account || '—'}</td>
                                            <td className="py-1.5 px-2">{r.tenKH || '—'}</td>
                                            <td className="py-1.5 px-2">{r.diaChi || '—'}</td>
                                            <td className="py-1.5 px-2">{diaBanCu || '—'}</td>
                                            <td className="py-1.5 px-2">{diaBanMoi || '—'}</td>
                                            <td className="py-1.5 px-2">{new Date(batch.thoiGian).toLocaleString('vi-VN')}</td>
                                            <td className="py-1.5 pl-2">{batch.thietBiThaoTac || '—'}</td>
                                            <td className="py-1.5 pl-2 text-right">
                                              <button
                                                type="button"
                                                onClick={() => confirmTbTransferRow(batch.id, ri)}
                                                disabled={daXacNhan || tbConfirmingTransferKey === rowKey || tbDeletingTransferKey === rowKey}
                                                className={`text-[10px] px-2 py-1 rounded border disabled:opacity-50 ${
                                                  daXacNhan
                                                    ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                                    : 'border-sky-300 text-sky-700 hover:bg-sky-50'
                                                }`}
                                              >
                                                {daXacNhan ? 'Đã xác nhận' : (tbConfirmingTransferKey === rowKey ? 'Đang xác nhận…' : 'Xác nhận')}
                                              </button>
                                              {!daXacNhan && (
                                                <button
                                                  type="button"
                                                  onClick={() => deleteTbTransferRow(batch.id, ri)}
                                                  disabled={tbDeletingTransferKey === rowKey || tbConfirmingTransferKey === rowKey}
                                                  className="ml-1 text-[10px] px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                                >
                                                  {tbDeletingTransferKey === rowKey ? 'Đang xóa…' : 'Xóa'}
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </>
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
                          <> — {lastSyncInfo.lastSyncS2Total} S2 đã gom</>
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

          {/* Form + kết quả: Tra cứu S2 hoặc TB */}
          {!showSettings && !showReportPanel && (activeMainModule === TB_MODULE_SPLITTER ? (
            <>
          {/* Form tra cứu - Tìm kiếm thông tin S2 */}
          <div className="px-3 py-3 sm:px-8 sm:py-6 shrink-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 border-b-2 border-sky-500 pb-1 mb-3 sm:mb-4">Tìm kiếm thông tin S2</h2>
            <form onSubmit={handleTraCuu} className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-8">
                <div className="space-y-0 order-1 sm:order-1">
                  <DropRow label="TTVT" required checked={useTtvt} onCheck={setUseTtvt} value={ttvt} onChange={setTtvt} options={listTtvt} />
                  <DropRow label="Tổ KT" required checked={useToQL} onCheck={setUseToQL} value={toQL} onChange={setToQL} options={listToQL} />
                  <DropRow label="Trạm BTS" checked={useVeTinh} onCheck={setUseVeTinh} value={veTinh} onChange={setVeTinh} options={listVeTinh} />
                </div>
                <div className="space-y-0 order-2 sm:order-2">
                  <DropRow label="Thiết bị OLT" checked={useThietBiOlt} onCheck={setUseThietBiOlt} value={thietBiOlt} onChange={setThietBiOlt} options={listThietBiOlt} optionValue={(item) => { if (typeof item === 'string' || typeof item === 'number') return String(item); const v = item?.THIETBI_ID ?? item?.OLT_ID ?? item?.id ?? item?.value ?? item?.code ?? ''; return v !== undefined && v !== null ? String(v) : ''; }} optionLabel={oltOptionLabel} />
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
                  Dữ liệu lấy từ API hoặc cache. Có thể dùng tùy chọn bên dưới để ưu tiên nguồn dữ liệu.
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
                      Kết quả tra cứu ({Array.isArray(ketQua.data) ? ketQua.data.length : 0} S2)
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
                    <p className="text-slate-500 text-center text-xs sm:text-sm py-6 sm:py-8">Không có bản ghi S2.</p>
                  )}
                </div>
              )}
            </div>
            </>
          ) : (
            <>
              <div className="px-3 py-3 sm:px-8 sm:py-6 shrink-0 space-y-4">
                <h2 className="text-sm sm:text-base font-semibold text-slate-800 border-b-2 border-sky-500 pb-1 mb-3 sm:mb-4">Tra cứu thuê bao từ Excel</h2>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 space-y-2">
                  {tbUploadGate.status === 'checking' ? (
                    <p className="text-xs sm:text-sm text-slate-600 py-2 px-1">Đang kiểm tra quyền upload...</p>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2 min-h-[44px]">
                      <button
                        type="button"
                        aria-expanded={tbUploadPanelExpanded}
                        aria-controls="tb-upload-panel-body"
                        onClick={() => setTbUploadPanelExpanded((v) => !v)}
                        title={tbUploadPanelExpanded ? 'Thu gọn' : 'Mở để upload / nhập mật khẩu'}
                        className="shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 touch-manipulation"
                      >
                        <svg
                          className={`w-5 h-5 transition-transform duration-200 ${tbUploadPanelExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-expanded={tbUploadPanelExpanded}
                        aria-controls="tb-upload-panel-body"
                        onClick={() => setTbUploadPanelExpanded((v) => !v)}
                        className="flex-1 text-left min-w-0 rounded-lg px-2 py-2 hover:bg-slate-100/70 transition-colors"
                      >
                        <span className="font-semibold text-slate-800 text-sm sm:text-base leading-snug">
                          {tbUploadGate.gateEnabled && tbUploadGate.status === 'locked'
                            ? 'Nhập mật khẩu để Upload dữ liệu mới'
                            : 'Upload & đồng bộ dữ liệu Excel'}
                        </span>
                      </button>
                      {tbUploadGate.gateEnabled && tbUploadGate.status === 'unlocked' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTbUploadLock();
                          }}
                          title="Khóa lại khu vực upload (trên trình duyệt này)"
                          aria-label="Khóa upload TB"
                          className="shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-800 touch-manipulation"
                        >
                          <svg className="w-4 h-4 sm:w-[18px] sm:h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  )}
                  {tbUploadPanelExpanded && tbUploadGate.status !== 'checking' ? (
                    <div id="tb-upload-panel-body" className="space-y-3 pt-2 border-t border-slate-200/90">
                  {tbUploadGate.gateEnabled && tbUploadGate.status === 'locked' && (
                    <form
                      onSubmit={submitTbUploadGate}
                      className="space-y-4 max-w-md mx-auto py-2 sm:py-4 px-1"
                    >
                      <p className="text-center text-[11px] sm:text-xs text-slate-500">
                        Cùng mã mở khóa với Cài đặt / Báo cáo.
                      </p>
                      {tbUploadGateError ? (
                        <p className="text-[11px] sm:text-xs text-red-600 text-center">{tbUploadGateError}</p>
                      ) : null}
                      <div className="space-y-2">
                        <label className="sr-only" htmlFor="tb-upload-gate-password">
                          Mật khẩu
                        </label>
                        <input
                          id="tb-upload-gate-password"
                          type="password"
                          autoComplete="current-password"
                          value={tbUploadGatePassword}
                          onChange={(e) => setTbUploadGatePassword(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 min-h-[44px]"
                          placeholder="Mật khẩu"
                        />
                        <button
                          type="submit"
                          disabled={tbUploadGateSubmitting || !tbUploadGatePassword.trim()}
                          className="w-full inline-flex items-center justify-center rounded-lg bg-sky-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-sky-700 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tbUploadGateSubmitting ? 'Đang xác nhận...' : 'Xác nhận'}
                        </button>
                      </div>
                    </form>
                  )}
                  {(tbUploadGate.status === 'unlocked' || !tbUploadGate.gateEnabled) && tbUploadGate.status !== 'checking' ? (
                    <>
                      <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                        File cần có tiêu đề cột: <strong>STT</strong>, <strong>Acount</strong>, <strong>Tên KH</strong>, <strong>Địa chỉ</strong>, <strong>Số ĐT</strong>, <strong>OLT</strong>, <strong>SLot</strong>, <strong>PORT</strong>, <strong>Nhân viên QL</strong>.
                        Bắt buộc nhận diện được: Nhân viên QL, OLT, SLOT, PORT.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={tbFileInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleTbFileSelect}
                          className="block w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 min-h-[40px] file:mr-3 file:rounded-md file:border-0 file:bg-sky-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-sky-700 hover:file:bg-sky-200"
                        />
                        <button
                          type="button"
                          onClick={handleTbExcelUpload}
                          disabled={!tbSelectedFile || tbUploading}
                          className="inline-flex items-center justify-center rounded-lg bg-sky-600 text-white px-3 py-2 text-xs sm:text-sm font-medium hover:bg-sky-700 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tbUploading ? 'Đang upload...' : 'Upload'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadTbMau}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[40px]"
                        >
                          Tải file mẫu
                        </button>
                        <button
                          type="button"
                          onClick={() => loadTbSharedRows()}
                          disabled={tbSharedLoading}
                          className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs sm:text-sm font-medium text-violet-700 hover:bg-violet-100 min-h-[40px] disabled:opacity-50"
                        >
                          {tbSharedLoading ? 'Đang tải dữ liệu chung…' : 'Tải dữ liệu chung'}
                        </button>
                        {tbFileName && <span className="text-[11px] text-slate-500 w-full sm:w-auto">File: {tbFileName}</span>}
                        {tbSharedMeta?.uploadedAt && (
                          <span className="text-[11px] text-slate-500 w-full">
                            Dữ liệu chung cập nhật: {new Date(tbSharedMeta.uploadedAt).toLocaleString('vi-VN')}
                            {tbSharedMeta.fileName ? ` · ${tbSharedMeta.fileName}` : ''}
                          </span>
                        )}
                      </div>
                      {tbUploadProgress && (
                        <div className="space-y-1">
                          <p className="text-[11px] sm:text-xs text-sky-700">
                            {tbUploadProgress.phase}
                            {tbUploadProgress.total > 1 ? ` ${tbUploadProgress.current}/${tbUploadProgress.total} chunk` : ''}
                            {typeof tbUploadProgress.percent === 'number' ? ` (${tbUploadProgress.percent}%)` : ''}
                          </p>
                          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-sky-600 transition-all"
                              style={{ width: `${Math.max(0, Math.min(100, Number(tbUploadProgress.percent || 0)))}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {tbParseMessage && (
                        <p
                          className={`text-[11px] sm:text-xs ${
                            /Thiếu|Lỗi|Không đọc|Chỉ hỗ trợ|Không có dòng|File không|Chưa có thuê bao nào được chuyển|mật khẩu|mở khóa/i.test(tbParseMessage)
                              ? 'text-red-600'
                              : 'text-emerald-800'
                          }`}
                        >
                          {tbParseMessage}
                        </p>
                      )}
                    </>
                  ) : null}
                    </div>
                  ) : null}
                </div>
                <form onSubmit={handleTbTraCuu} className="space-y-3">
                  {tbSharedLoading && tbRows.length === 0 && (
                    <p className="text-[11px] sm:text-xs text-amber-700">
                      Đang nạp dữ liệu thuê bao dùng chung, vui lòng chờ trong giây lát...
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                    <div className="space-y-2">
                      <label className="block text-[11px] sm:text-xs font-semibold text-slate-600">Nhân viên QL</label>
                      <select
                        value={tbNvQL}
                        onChange={(e) => {
                          setTbNvQL(e.target.value);
                          setTbOlt('');
                          setTbSlot('');
                          setTbPort('');
                          setTbKetQua(null);
                          setTbTimKiemLoi('');
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 min-h-[40px]"
                      >
                        <option value="">{PLACEHOLDER}</option>
                        {tbNvqlChoices.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[11px] sm:text-xs font-semibold text-slate-600">OLT</label>
                      <select
                        value={tbOlt}
                        onChange={(e) => {
                          setTbOlt(e.target.value);
                          setTbSlot('');
                          setTbPort('');
                          setTbKetQua(null);
                          setTbTimKiemLoi('');
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 min-h-[40px]"
                      >
                        <option value="">{PLACEHOLDER}</option>
                        {tbOltChoices.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[11px] sm:text-xs font-semibold text-slate-600">SLOT</label>
                      <select
                        value={tbSlot}
                        onChange={(e) => {
                          setTbSlot(e.target.value);
                          setTbPort('');
                          setTbKetQua(null);
                          setTbTimKiemLoi('');
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 min-h-[40px]"
                      >
                        <option value="">{PLACEHOLDER}</option>
                        {tbSlotChoices.map((n) => (
                          <option key={String(n)} value={String(n)}>{String(n)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[11px] sm:text-xs font-semibold text-slate-600">Port</label>
                      <select
                        value={tbPort === '' ? '' : String(tbPort)}
                        onChange={(e) => {
                          setTbPort(e.target.value);
                          setTbKetQua(null);
                          setTbTimKiemLoi('');
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 min-h-[40px]"
                      >
                        <option value="">{PLACEHOLDER}</option>
                        {tbPortChoices.map((n) => (
                          <option key={String(n)} value={String(n)}>{String(n)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={tbSharedLoading && tbRows.length === 0}
                    className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg font-semibold text-white text-xs sm:text-sm bg-sky-600 hover:bg-sky-700 min-h-[40px] sm:min-h-[44px]"
                  >
                    {tbSharedLoading && tbRows.length === 0 ? 'Đang nạp dữ liệu...' : 'Tra cứu'}
                  </button>
                  {tbTimKiemLoi && <p className="text-xs text-red-600">{tbTimKiemLoi}</p>}
                </form>
              </div>
              <div className="mt-2 sm:mt-6 mx-2 sm:mx-8 mb-2 sm:mb-6 rounded-lg sm:rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex-1 min-h-[140px] sm:min-h-[280px] p-3 sm:p-6 flex flex-col overflow-hidden">
                {tbKetQua === null && !tbTimKiemLoi && (
                  <p className="text-slate-500 text-center text-xs sm:text-base py-8 flex-1 flex items-center justify-center">
                    Upload file, chọn bộ lọc và bấm Tra cứu để xem danh sách thuê bao.
                  </p>
                )}
                {Array.isArray(tbKetQua) && (
                  <div className="w-full flex-1 min-h-0 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-slate-800 font-bold text-sm sm:text-base">
                        Kết quả tra cứu ({tbKetQua.length} thuê bao)
                      </h3>
                      <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
                        {tbKetQua.length > 0 && (
                          <select
                            value={String(tbPageSize)}
                            onChange={(e) => setTbPageSize(Number(e.target.value) || 10)}
                            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs sm:text-sm text-slate-700 min-h-[40px]"
                            title="Số thuê bao hiển thị mỗi trang"
                          >
                            <option value="10">10 thuê bao/trang</option>
                            <option value="20">20 thuê bao/trang</option>
                            <option value="50">50 thuê bao/trang</option>
                            <option value="100">100 thuê bao/trang</option>
                          </select>
                        )}
                        {tbKetQua.length > 0 && (
                          <button
                            type="button"
                            onClick={openTbChuyenModal}
                            className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-medium px-3 py-2 min-h-[40px]"
                          >
                            Chuyển địa bàn
                          </button>
                        )}
                      </div>
                    </div>
                    {tbKetQua.length === 0 ? (
                      <p className="text-slate-500 text-center text-xs sm:text-sm py-6">Không có thuê bao khớp bộ lọc.</p>
                    ) : (
                      <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="min-w-[800px] w-full text-[11px] sm:text-xs text-left">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                              <th className="py-2 px-2 font-semibold">STT</th>
                              <th className="py-2 px-2 font-semibold">Account</th>
                              <th className="py-2 px-2 font-semibold">Tên KH</th>
                              <th className="py-2 px-2 font-semibold">Địa chỉ</th>
                              <th className="py-2 px-2 font-semibold">Số ĐT</th>
                              <th className="py-2 px-2 font-semibold">OLT</th>
                              <th className="py-2 px-2 font-semibold">Slot</th>
                              <th className="py-2 px-2 font-semibold">Port</th>
                              <th className="py-2 px-2 font-semibold">NV QL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedTbRows.map((r) => (
                              <tr key={r.id} className="border-b border-slate-100 last:border-0 text-slate-800">
                                <td className="py-1.5 px-2 align-top">{r.stt || '—'}</td>
                                <td className="py-1.5 px-2 align-top font-medium">{r.account || '—'}</td>
                                <td className="py-1.5 px-2 align-top max-w-[140px] break-words">{r.tenKH || '—'}</td>
                                <td className="py-1.5 px-2 align-top max-w-[200px] break-words">{r.diaChi || '—'}</td>
                                <td className="py-1.5 px-2 align-top whitespace-nowrap">{r.soDt || '—'}</td>
                                <td className="py-1.5 px-2 align-top">{r.olt || '—'}</td>
                                <td className="py-1.5 px-2 align-top">{r.slot || '—'}</td>
                                <td className="py-1.5 px-2 align-top">{r.port ?? '—'}</td>
                                <td className="py-1.5 px-2 align-top">{r.nvQL || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-600">
                          Hiển thị {tbStart + 1}-{Math.min(tbStart + tbPageSize, tbResultRows.length)} / {tbResultRows.length} thuê bao
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTbPage((p) => Math.max(1, p - 1))}
                            disabled={tbCurrentPage <= 1}
                            className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Trang trước
                          </button>
                          <span className="text-[11px] text-slate-600">
                            Trang {tbCurrentPage}/{tbTotalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTbPage((p) => Math.min(tbTotalPages, p + 1))}
                            disabled={tbCurrentPage >= tbTotalPages}
                            className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Trang sau
                          </button>
                        </div>
                      </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ))}
        </div>
      </div>
      {tbShowChuyenModal && Array.isArray(tbKetQua) && tbKetQua.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tb-chuyen-title"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[88vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
              <h3 id="tb-chuyen-title" className="text-sm font-semibold text-slate-800">Chuyển địa bàn</h3>
              <button
                type="button"
                onClick={() => setTbShowChuyenModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Đóng"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0 space-y-3">
              <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                Chọn thuê bao cần chuyển và <strong>Nhân viên QL đích</strong> (lấy từ danh sách trong file Excel đã upload).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTbChuyenIds(new Set(tbKetQua.map((r) => r.id)))}
                  className="text-[11px] px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setTbChuyenIds(new Set())}
                  className="text-[11px] px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Bỏ chọn
                </button>
              </div>
              <ul className="max-h-[40vh] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 text-[11px] sm:text-xs">
                {tbKetQua.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 px-2 py-2 hover:bg-slate-50/80">
                    <input
                      type="checkbox"
                      checked={tbChuyenIds.has(r.id)}
                      onChange={() => toggleTbChuyenId(r.id)}
                      className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-slate-800">{r.account || '—'}</span>
                      <span className="text-slate-500">
                        {r.tenKH ? ` · ${r.tenKH}` : ''} · {r.nvQL || '—'} · Port {r.port ?? '—'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nhân viên QL đích</label>
                <select
                  value={tbChuyenTargetNv}
                  onChange={(e) => setTbChuyenTargetNv(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 min-h-[40px]"
                >
                  <option value="">{PLACEHOLDER}</option>
                  {tbNvqlChoices.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2 shrink-0 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setTbShowChuyenModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[40px]"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmTbChuyenDiaBan}
                className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 text-xs font-medium min-h-[40px]"
              >
                Xác nhận chuyển
              </button>
            </div>
          </div>
        </div>
      )}
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
