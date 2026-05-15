'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { authFingerprint, getPortCache, getSyncMeta, sp2CacheKey } from '../lib/sp2-local-cache';
import {
  authorizationSeemsUnexpired,
  looksLikeAuthError,
  authHeadersForOneBss,
  getAuthAddressFromJwt,
} from '../lib/authorization-expiry';
import { formatProposalCoord, getNvDiaBanOptions } from '../lib/s2-proposal-nv-list';
import { runFullSp2Sync } from '../lib/sp2-full-sync';

const PLACEHOLDER = '';

/** TTVT máº·c Ä‘á»‹nh theo OneBSS (trang tra cá»©u splitter theo port OLT). */
const TTVT_MAC_DINH = 'Trung tÃ¢m viá»…n thÃ´ng Nho Quan';
/** TrÃ¹ng `app/api/danh-sach/route.js` â€” dÃ¹ng khi API lá»—i, chÆ°a deploy, hoáº·c trÃ¬nh duyá»‡t cache response cÅ©. */
const FALLBACK_TTVT_LIST = [{ ma: TTVT_MAC_DINH, ten: TTVT_MAC_DINH }];
const FALLBACK_TO_KY_THUAT = [
  { id: 'd4febad9-f7b4-41a4-85ab-1e8fc1fd754a', donviId: 1002688, ten: 'Tá»• Ká»¹ thuáº­t Äá»‹a bÃ n Gia Viá»…n' },
  { id: '5f0ad13b-53ee-4869-a66f-4023cba821a7', donviId: 1002689, ten: 'Tá»• Ká»¹ thuáº­t Äá»‹a bÃ n Nho Quan' },
];
const STORAGE_AUTH = 'tracuu_sp2_authorization';
const STORAGE_AUTH_UNLOCKED = 'tracuu_sp2_auth_unlocked';

/** Chá»‰ gá»­i JWT trÃ¬nh duyá»‡t khi cÃ²n háº¡n; khÃ´ng gá»­i token háº¿t háº¡n Ä‘á»ƒ server dÃ¹ng Authorization Ä‘Ã£ lÆ°u chung. */
function authHeadersForFetch(authValue) {
  const raw =
    authValue ?? (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUTH) : '') ?? '';
  return authHeadersForOneBss(raw);
}

function clearStoredAuthorization(setAuthorization) {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_AUTH);
  if (typeof setAuthorization === 'function') setAuthorization('');
}
const AUTH_AUTO_LOCK_MS = 5 * 60 * 1000;
/** Äá»“ng bá»™ S2 Ä‘á»‹nh ká»³ khi token cÃ²n háº¡n (JWT). */
const AUTH_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_TO_QL_DONVI_ID = '1002689'; // Tá»• Ká»¹ thuáº­t Äá»‹a bÃ n Nho Quan
const DEFAULT_TO_QL_ID = '5f0ad13b-53ee-4869-a66f-4023cba821a7';
const REPORT_MENU_ITEMS = [
  {
    id: 's2_lookup',
    label: 'Láº¥y thÃ´ng sá»‘ S2',
    description: 'Tra cá»©u theo tá»«ng S2 hoáº·c theo file S2 Ä‘á»ƒ láº¥y OLT/Card/Port.',
  },
  {
    id: 's2_capacity',
    label: 'Dung lÆ°á»£ng S2',
    description: 'Theo dÃµi dung lÆ°á»£ng, Ä‘Ã£ dÃ¹ng, chÆ°a dÃ¹ng cá»§a splitter S2.',
  },
  {
    id: 'no_sp2_ports',
    label: 'Cá»•ng PON khÃ´ng cÃ³ S2',
    description: 'BÃ¡o cÃ¡o theo Tá»• ká»¹ thuáº­t vÃ  OLT cÃ¡c cá»•ng chÆ°a cÃ³ S2.',
  },
  {
    id: 'olt_pon_detail',
    label: 'Chi tiáº¿t S2 theo OLT/PON',
    description: 'Xem chi tiáº¿t cá»•ng PON theo OLT vÃ  xuáº¥t Excel theo OLT.',
  },
  {
    id: 'pon_one_sp2',
    label: 'Tá»· lá»‡ cá»•ng PON cÃ³ Ä‘Ãºng 1 SP2',
    description: 'Theo dÃµi tá»· lá»‡ 1 SP2 theo Tá»• KT vÃ  xuáº¥t Excel.',
  },
  {
    id: 'tb_chuyen_dia_ban',
    label: 'ThuÃª bao cáº§n chuyá»ƒn Ä‘á»‹a bÃ n khÃ¡c',
    description: 'Theo dÃµi lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n thuÃª bao vÃ  xuáº¥t Excel.',
  },
  {
    id: 's2_renovation_proposals',
    label: 'Äá» xuáº¥t cáº£i táº¡o Spliter cáº¥p 2',
    description: 'Danh sÃ¡ch Ä‘á» xuáº¥t cáº£i táº¡o S2 kÃ¨m Ä‘á»‹a chá»‰ vÃ  tá»a Ä‘á»™ GPS lÃºc ghi nháº­n.',
  },
];

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('TrÃ¬nh duyá»‡t khÃ´ng há»— trá»£ Ä‘á»‹nh vá»‹ GPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        const code = err?.code;
        if (code === 1) reject(new Error('Báº¡n Ä‘Ã£ tá»« chá»‘i quyá»n truy cáº­p vá»‹ trÃ­. Báº­t GPS Ä‘á»ƒ lÆ°u tá»a Ä‘á»™.'));
        else if (code === 2) reject(new Error('KhÃ´ng xÃ¡c Ä‘á»‹nh Ä‘Æ°á»£c vá»‹ trÃ­. Thá»­ láº¡i ngoÃ i trá»i hoáº·c báº­t GPS.'));
        else if (code === 3) reject(new Error('Háº¿t thá»i gian chá» GPS. Thá»­ láº¡i.'));
        else reject(new Error(err?.message || 'KhÃ´ng láº¥y Ä‘Æ°á»£c tá»a Ä‘á»™.'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

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

function resolveToQlKeys(toQL) {
  const k = String(toQL || '').trim();
  if (!k) return [];
  const keys = new Set([k]);
  for (const item of FALLBACK_TO_KY_THUAT) {
    if (String(item.donviId) === k || String(item.id) === k) {
      keys.add(String(item.donviId));
      keys.add(String(item.id));
    }
  }
  return [...keys];
}

function browseTramsForTo(snap, toQL) {
  const tramByTo = snap?.tramByTo;
  if (!tramByTo || typeof tramByTo !== 'object') return [];
  for (const key of resolveToQlKeys(toQL)) {
    const list = tramByTo[key];
    if (Array.isArray(list) && list.length) return sanitizeSelectOptions(list);
  }
  return [];
}

function browseOltsForTram(snap, toQL, veTinh) {
  const oltByTram = snap?.oltByTram;
  if (!oltByTram || typeof oltByTram !== 'object' || !veTinh) return [];
  for (const toKey of resolveToQlKeys(toQL)) {
    const list = oltByTram[`${toKey}|${veTinh}`];
    if (Array.isArray(list) && list.length) return sanitizeSelectOptions(list);
  }
  return [];
}

function browseCardsForOlt(snap, thietBiOlt) {
  const list = snap?.cardByOlt?.[thietBiOlt];
  return Array.isArray(list) && list.length ? list : [];
}

function browsePortsForCard(snap, cardOlt) {
  const list = snap?.portByCard?.[cardOlt];
  return Array.isArray(list) && list.length ? list : [];
}

function hasBrowseCatalog(snap) {
  if (!snap || snap.v !== 1) return false;
  if (snap.tramByTo && typeof snap.tramByTo === 'object') {
    for (const list of Object.values(snap.tramByTo)) {
      if (Array.isArray(list) && list.length > 0) return true;
    }
  }
  return Array.isArray(snap.toKyThuat) && snap.toKyThuat.length > 0;
}

/** Cáº­p nháº­t danh sÃ¡ch dropdown tá»« cache mÃ  khÃ´ng Ä‘á»•i lá»±a chá»n Ä‘ang cÃ³. */
function mergeBrowseOptions(prev, from, selectedValue) {
  const next = sanitizeSelectOptions(from);
  if (!next.length) return prev;
  const sel = String(selectedValue || '');
  if (sel && next.some((item) => defaultDropOptionValue(item) === sel)) return next;
  return prev.length > 0 ? prev : next;
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
    .replace(/Ä‘/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ãnh xáº¡ dÃ²ng tiÃªu Ä‘á» Excel â†’ chá»‰ sá»‘ cá»™t (linh hoáº¡t tÃªn cá»™t). */
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

/** TÃªn/mÃ£ chá»§ng loáº¡i tá»« User-Agent (Ä‘áº·c biá»‡t Android cÃ³ Ä‘oáº¡n sau Â«Android xx;Â»). */
function tbParsePhoneModelFromUa(ua) {
  if (!ua) return '';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  const m = ua.match(/Android\s+[\d._]+;\s*([^)]+)\)/i);
  if (!m) return '';
  let raw = tbStripBuildSuffix(m[1]).replace(/^Linux;\s*/i, '').trim();
  if (/^K$/i.test(raw)) return '';
  if (raw.length > 96) raw = `${raw.slice(0, 93)}â€¦`;
  return raw || '';
}

/**
 * TÃªn hoáº·c chá»§ng loáº¡i Ä‘iá»‡n thoáº¡i/thiáº¿t bá»‹ lÃºc thao tÃ¡c (Client Hints + UA).
 * MÃ¡y tÃ­nh: Â«MÃ¡y tÃ­nh (há»‡ Ä‘iá»u hÃ nh ngáº¯n gá»n)Â».
 */
async function tbSummarizeThietBiThaoTacAsync() {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';

  try {
    const uad = navigator.userAgentData;
    if (uad?.getHighEntropyValues) {
      const hi = await uad.getHighEntropyValues(['model', 'platform', 'mobile']);
      const m = String(hi?.model || '').trim();
      if (hi?.mobile && m && !/^generic$/i.test(m)) return m.length > 120 ? `${m.slice(0, 117)}â€¦` : m;
    }
  } catch {
    /* bá» qua */
  }

  const fromUa = tbParsePhoneModelFromUa(ua);
  if (fromUa) return fromUa;

  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
    if (/Android/i.test(ua)) return 'Äiá»‡n thoáº¡i Android (khÃ´ng Ä‘á»c Ä‘Æ°á»£c model)';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/iPhone|iPod/i.test(ua)) return 'iPhone';
    return 'Thiáº¿t bá»‹ di Ä‘á»™ng';
  }

  let os = '';
  if (/Windows NT 10\.0|Windows NT 11\.0/i.test(ua)) os = 'Windows';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'Chrome OS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else os = 'â€”';
  if (/Macintosh|Windows|CrOS|Linux/i.test(ua)) return `MÃ¡y tÃ­nh (${os})`;
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
  /** Snapshot danh má»¥c tá»« server (lÆ°u lÃºc Ä‘á»“ng bá»™ S2). */
  const [browseSnapshot, setBrowseSnapshot] = useState(null);
  const browseSnapshotRef = useRef(null);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalTargetS2, setProposalTargetS2] = useState('');
  const [proposalNvDiaBan, setProposalNvDiaBan] = useState('');
  const [proposalText, setProposalText] = useState('');
  const [proposalSaving, setProposalSaving] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [s2Proposals, setS2Proposals] = useState([]);
  const [s2ProposalsLoading, setS2ProposalsLoading] = useState(false);
  const [s2ProposalsError, setS2ProposalsError] = useState('');
  const nvDiaBanOptions = getNvDiaBanOptions();

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
  const syncRunningRef = useRef(false);
  const catalogToQlRef = useRef('');
  const catalogVeTinhRef = useRef('');
  const catalogOltRef = useRef('');
  const catalogCardRef = useRef('');
  const startFullSyncRef = useRef(null);
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
      const raw = (localStorage.getItem(STORAGE_AUTH) || '').trim();
      if (raw && !authorizationSeemsUnexpired(raw)) {
        localStorage.removeItem(STORAGE_AUTH);
        setAuthorization('');
      } else {
        setAuthorization(raw);
      }
      setAuthUnlocked(sessionStorage.getItem(STORAGE_AUTH_UNLOCKED) === '1');
    }
  }, []);

  /** PhiÃªn sessionStorage khÃ´ng cÃ³ cookie httpOnly â†’ Ä‘á»“ng bá»™ láº¡i tráº¡ng thÃ¡i khÃ³a. */
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
    syncRunningRef.current = syncRunning;
  }, [syncRunning]);

  useEffect(() => {
    if (!authUnlocked) return;
    const t = setTimeout(() => {
      setAuthUnlocked(false);
      setShowReportPanel(false);
      setUnlockToOpenReport(false);
      if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_AUTH_UNLOCKED);
      setAuthPasswordError('PhiÃªn Ä‘Ã£ háº¿t háº¡n. Vui lÃ²ng thá»­ láº¡i.');
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

  /** MÃ¡y khÃ¡c: tá»± cáº­p nháº­t meta + danh má»¥c cache khi admin Ä‘ang Ä‘á»“ng bá»™ lÃªn Supabase. */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const tick = () => {
      refreshServerMeta();
      if (!syncRunningRef.current) refreshBrowseSnapshot();
    };
    tick();
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    browseSnapshotRef.current = browseSnapshot;
  }, [browseSnapshot]);

  function browseSnapshotFingerprint(snap) {
    if (!snap || snap.v !== 1) return '';
    const tram = snap.tramByTo && typeof snap.tramByTo === 'object' ? Object.keys(snap.tramByTo).length : 0;
    const olt = snap.oltByTram && typeof snap.oltByTram === 'object' ? Object.keys(snap.oltByTram).length : 0;
    const card = snap.cardByOlt && typeof snap.cardByOlt === 'object' ? Object.keys(snap.cardByOlt).length : 0;
    const port = snap.portByCard && typeof snap.portByCard === 'object' ? Object.keys(snap.portByCard).length : 0;
    return `${tram}|${olt}|${card}|${port}`;
  }

  async function refreshBrowseSnapshot() {
    try {
      const res = await fetch('/api/sp2-cache?browse=1');
      const j = await res.json().catch(() => ({}));
      if (res.status === 503 || !j.ok) {
        setBrowseSnapshot(null);
        return;
      }
      if (j.snapshot && j.snapshot.v === 1) {
        setBrowseSnapshot((prev) => {
          if (browseSnapshotFingerprint(prev) === browseSnapshotFingerprint(j.snapshot)) return prev;
          return j.snapshot;
        });
      } else setBrowseSnapshot(null);
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
        setPonStatsError(j.message || `KhÃ´ng táº£i Ä‘Æ°á»£c thá»‘ng kÃª (${res.status}).`);
        return;
      }
      setPonOneSp2Stats(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setPonOneSp2Stats([]);
      setPonStatsError(e?.message || 'Lá»—i táº£i thá»‘ng kÃª.');
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
        throw new Error(j.message || `KhÃ´ng xuáº¥t Ä‘Æ°á»£c Excel (${res.status}).`);
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
      setPonStatsError(e?.message || 'Lá»—i xuáº¥t Excel.');
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
        setOltPonError(j.message || `KhÃ´ng táº£i Ä‘Æ°á»£c bÃ¡o cÃ¡o OLT/PON (${res.status}).`);
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
      setOltPonError(e?.message || 'Lá»—i táº£i bÃ¡o cÃ¡o OLT/PON.');
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
        throw new Error(j.message || `KhÃ´ng xuáº¥t Ä‘Æ°á»£c Excel OLT/PON (${res.status}).`);
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
      setOltPonError(e?.message || 'Lá»—i xuáº¥t Excel OLT/PON.');
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
        setNoSp2Error(j.message || `KhÃ´ng táº£i Ä‘Æ°á»£c bÃ¡o cÃ¡o cá»•ng khÃ´ng cÃ³ S2 (${res.status}).`);
        return;
      }
      setNoSp2Rows(Array.isArray(j.rows) ? j.rows : []);
      setNoSp2ToOptions(Array.isArray(j.toOptions) ? j.toOptions : []);
      setNoSp2OltOptions(Array.isArray(j.oltOptions) ? j.oltOptions : []);
    } catch (e) {
      setNoSp2Rows([]);
      setNoSp2ToOptions([]);
      setNoSp2OltOptions([]);
      setNoSp2Error(e?.message || 'Lá»—i táº£i bÃ¡o cÃ¡o cá»•ng khÃ´ng cÃ³ S2.');
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
        throw new Error(j.message || `KhÃ´ng xuáº¥t Ä‘Æ°á»£c Excel cá»•ng khÃ´ng cÃ³ S2 (${res.status}).`);
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
      setNoSp2Error(e?.message || 'Lá»—i xuáº¥t Excel cá»•ng khÃ´ng cÃ³ S2.');
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
        setS2CapacityError(j.message || `KhÃ´ng táº£i Ä‘Æ°á»£c bÃ¡o cÃ¡o dung lÆ°á»£ng S2 (${res.status}).`);
        return;
      }
      setS2CapacityRows(Array.isArray(j.rows) ? j.rows : []);
      setS2CapacityToOptions(Array.isArray(j.toOptions) ? j.toOptions : []);
      setS2CapacityOltOptions(Array.isArray(j.oltOptions) ? j.oltOptions : []);
    } catch (e) {
      setS2CapacityRows([]);
      setS2CapacityToOptions([]);
      setS2CapacityOltOptions([]);
      setS2CapacityError(e?.message || 'Lá»—i táº£i bÃ¡o cÃ¡o dung lÆ°á»£ng S2.');
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
        throw new Error(j.message || `KhÃ´ng xuáº¥t Ä‘Æ°á»£c Excel dung lÆ°á»£ng S2 (${res.status}).`);
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
      setS2CapacityError(e?.message || 'Lá»—i xuáº¥t Excel dung lÆ°á»£ng S2.');
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
      setS2LookupError('Vui lÃ²ng nháº­p Ã­t nháº¥t 1 mÃ£ S2 Ä‘á»ƒ tra cá»©u.');
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
        setS2LookupError(j?.message || `KhÃ´ng tra cá»©u Ä‘Æ°á»£c S2 (${res.status}).`);
        return;
      }
      setS2LookupRows(Array.isArray(j.rows) ? j.rows : []);
      setS2LookupNotFound(Array.isArray(j.notFound) ? j.notFound : []);
    } catch (e) {
      setS2LookupRows([]);
      setS2LookupNotFound([]);
      setS2LookupError(e?.message || 'Lá»—i tra cá»©u S2.');
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
        setS2LookupError('File khÃ´ng cÃ³ dá»¯ liá»‡u S2 há»£p lá»‡.');
        return;
      }
      await runS2Lookup(tokens);
    } catch (e) {
      setS2LookupRows([]);
      setS2LookupNotFound([]);
      setS2LookupError(e?.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c file S2.');
    } finally {
      if (event?.target) event.target.value = '';
    }
  };

  const handleExportS2LookupExcel = async () => {
    if (s2LookupRows.length === 0 && s2LookupNotFound.length === 0) {
      setS2LookupError('ChÆ°a cÃ³ dá»¯ liá»‡u Ä‘á»ƒ xuáº¥t Excel.');
      return;
    }
    setS2LookupExporting(true);
    setS2LookupError('');
    try {
      const xlsx = await import('xlsx');
      const datePart = new Date().toISOString().slice(0, 10);
      const foundRows = s2LookupRows.map((r, idx) => ({
        STT: idx + 1,
        TRANG_THAI: 'TÃ¬m tháº¥y',
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
        TRANG_THAI: 'KhÃ´ng tÃ¬m tháº¥y',
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
      setS2LookupError(e?.message || 'Lá»—i xuáº¥t Excel tra cá»©u S2.');
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
          'TÃªn KH': 'Nguyá»…n VÄƒn B',
          'Äá»‹a chá»‰': 'Sá»‘ nhÃ  â€¦, xÃ£ â€¦, tá»‰nh â€¦',
          'Sá»‘ ÄT': '0912345678',
          OLT: 'OLT YÃªn Quang',
          SLot: '3',
          PORT: '1',
          'NhÃ¢n viÃªn QL': 'Nguyá»…n VÄƒn A',
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
      setTbParseMessage(e?.message || 'KhÃ´ng táº¡o Ä‘Æ°á»£c file máº«u.');
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
                setTbParseMessage(`Äang Ä‘á»“ng bá»™ dá»¯ liá»‡u chung tá»« server${cached?.fileName ? ` (${cached.fileName})` : ''}...`);
              }
            }
          } catch {
            // bá» qua cache há»ng
          }
        }
      }

      const res = await fetch('/api/tb-cache', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c dá»¯ liá»‡u dÃ¹ng chung tá»« server.';
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
              'TrÃªn server váº«n cÃ²n báº£n ghi Ä‘á»“ng bá»™ nhÆ°ng khÃ´ng cÃ²n dÃ²ng thuÃª bao Ä‘i kÃ¨m (cÃ³ thá»ƒ Ä‘Ã£ xÃ³a tay hoáº·c lá»—i lÆ°u). HÃ£y upload láº¡i file Excel.'
            );
          } else {
            setTbParseMessage(
              'ChÆ°a cÃ³ dá»¯ liá»‡u dÃ¹ng chung trÃªn server. HÃ£y upload 1 file Excel trÃªn báº¥t ká»³ thiáº¿t bá»‹ nÃ o (hoáº·c kiá»ƒm tra biáº¿n mÃ´i trÆ°á»ng Supabase trÃªn Vercel dÃ¹ng Ä‘Ãºng project cÃ³ dá»¯ liá»‡u).'
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
          // Bá» qua lá»—i quota localStorage
        }
      }
      const timeText = meta.uploadedAt ? new Date(meta.uploadedAt).toLocaleString('vi-VN') : '';
      if (!silent) {
        const base = `ÄÃ£ táº£i ${rows.length} thuÃª bao tá»« dá»¯ liá»‡u dÃ¹ng chung${timeText ? ` (${timeText})` : ''}.`;
        setTbParseMessage(
          data.partialRecovery
            ? `${base} Upload trÆ°á»›c chÆ°a chá»‘t trÃªn server â€” chá»‰ cÃ²n pháº§n Ä‘Ã£ lÆ°u (cÃ³ thá»ƒ upload láº¡i Ä‘á»ƒ Ä‘á»“ng bá»™ Ä‘á»§).`
            : base
        );
      }
    } catch (e) {
      if (!silent && !tbRows.length) setTbParseMessage(e?.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c dá»¯ liá»‡u dÃ¹ng chung tá»« server.');
    } finally {
      setTbSharedLoading(false);
    }
  };

  /** CÃ¹ng API/máº­t kháº©u vá»›i CÃ i Ä‘áº·t / BÃ¡o cÃ¡o (`UNLOCK_PASSWORD`); Ä‘áº·t cookie httpOnly cho upload TB. */
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
        return { ok: false, message: String(j?.message || 'KhÃ´ng thá»ƒ má»Ÿ khÃ³a.') };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || 'KhÃ´ng xÃ¡c thá»±c Ä‘Æ°á»£c.' };
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
      setTbUploadGateError('Lá»—i máº¡ng khi gá»­i máº­t kháº©u.');
    } finally {
      setTbUploadGateSubmitting(false);
    }
  };

  const handleTbUploadLock = async () => {
    try {
      await fetch('/api/admin/lock', { method: 'POST', credentials: 'include' });
    } catch {
      /* bá» qua */
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
        if (!silent) setTbParseMessage(data?.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n tá»« server.');
        return;
      }
      const batches = Array.isArray(data?.batches) ? data.batches : [];
      setTbChuyenBatches(batches);
    } catch (e) {
      if (!silent) setTbParseMessage(e?.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n tá»« server.');
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
        setTbParseMessage(data?.message || 'KhÃ´ng xÃ¡c nháº­n Ä‘Æ°á»£c dÃ²ng lá»‹ch sá»­ chuyá»ƒn.');
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
      setTbParseMessage('ÄÃ£ xÃ¡c nháº­n 1 dÃ²ng lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n.');
    } catch (e) {
      setTbParseMessage(e?.message || 'KhÃ´ng xÃ¡c nháº­n Ä‘Æ°á»£c dÃ²ng lá»‹ch sá»­ chuyá»ƒn.');
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
        setTbParseMessage(data?.message || 'KhÃ´ng xÃ³a Ä‘Æ°á»£c dÃ²ng lá»‹ch sá»­ chuyá»ƒn.');
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
      setTbParseMessage('ÄÃ£ xÃ³a 1 dÃ²ng lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n.');
    } catch (e) {
      setTbParseMessage(e?.message || 'KhÃ´ng xÃ³a Ä‘Æ°á»£c dÃ²ng lá»‹ch sá»­ chuyá»ƒn.');
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
      setTbParseMessage('Vui lÃ²ng nháº­p máº­t kháº©u Ä‘á»ƒ má»Ÿ khÃ³a khu vá»±c upload.');
      return;
    }
    setTbUploading(true);
    setTbUploadProgress({ phase: 'Äang Ä‘á»c file Excel...', current: 0, total: 1, percent: 0 });
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
        setTbParseMessage('Chá»‰ há»— trá»£ file .xlsx hoáº·c .xls');
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
        setTbParseMessage('File khÃ´ng cÃ³ dá»¯ liá»‡u.');
        return;
      }
      const col = tbResolveColumnIndices(matrix[0]);
      const need = ['nvQL', 'olt', 'slot', 'port'];
      const missing = need.filter((k) => col[k] == null);
      if (missing.length) {
        setTbRows([]);
        setTbParseMessage(
          `Thiáº¿u cá»™t báº¯t buá»™c trong dÃ²ng tiÃªu Ä‘á»: ${missing.join(', ')}. Cáº§n cÃ³: NhÃ¢n viÃªn QL, OLT, SLOT, PORT (vÃ  cÃ¡c cá»™t khÃ¡c theo máº«u).`
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
        setTbParseMessage('KhÃ´ng cÃ³ dÃ²ng dá»¯ liá»‡u há»£p lá»‡ sau tiÃªu Ä‘á».');
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
          // Bá» qua lá»—i quota localStorage, váº«n tiáº¿p tá»¥c lÆ°u server
        }
      }
      let sharedSaved = false;
      let sharedSaveMessage = '';
      try {
        const chunkSize = 400;
        const totalChunks = Math.max(1, Math.ceil(hydratedRows.length / chunkSize));
        setTbUploadProgress({ phase: 'Äang upload dá»¯ liá»‡u lÃªn server...', current: 0, total: totalChunks, percent: 0 });
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
            throw new Error(serverMsg || `Lá»—i lÆ°u chunk ${i + 1}/${totalChunks}.`);
          }
          const currentChunk = i + 1;
          const percent = Math.min(100, Math.round((currentChunk / totalChunks) * 100));
          setTbUploadProgress({
            phase: 'Äang upload dá»¯ liá»‡u lÃªn server...',
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
          sharedSaveMessage = 'KhÃ´ng nháº­n Ä‘Æ°á»£c pháº£n há»“i chá»‘t upload.';
          setTbSharedMeta(null);
        }
      } catch (saveErr) {
        sharedSaveMessage = String(saveErr?.message || '');
        setTbSharedMeta(null);
      }
      setTbParseMessage(
        sharedSaved
          ? `ÄÃ£ nháº­p ${hydratedRows.length} thuÃª bao tá»« file vÃ  lÆ°u dÃ¹ng chung Ä‘á»ƒ tra cá»©u trÃªn thiáº¿t bá»‹ khÃ¡c.`
          : `ÄÃ£ nháº­p ${hydratedRows.length} thuÃª bao tá»« file (khÃ´ng lÆ°u Ä‘Æ°á»£c dá»¯ liá»‡u dÃ¹ng chung lÃªn server${sharedSaveMessage ? `: ${sharedSaveMessage}` : ''}).`
      );
    } catch (e) {
      setTbRows([]);
      setTbParseMessage(e?.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c file Excel.');
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
      setTbTimKiemLoi('Vui lÃ²ng upload file Excel danh sÃ¡ch thuÃª bao.');
      setTbKetQua(null);
      return;
    }
    if (!tbNvQL || !tbOlt || !tbSlot || !tbPort) {
      setTbTimKiemLoi('Vui lÃ²ng chá»n Ä‘á»§ NhÃ¢n viÃªn QL, OLT, SLOT vÃ  Port.');
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
      setTbParseMessage('Chá»n NhÃ¢n viÃªn QL Ä‘Ã­ch Ä‘á»ƒ chuyá»ƒn Ä‘á»‹a bÃ n.');
      return;
    }
    if (!Array.isArray(tbKetQua) || !tbKetQua.length) return;
    const picked = tbKetQua.filter((r) => tbChuyenIds.has(r.id));
    if (!picked.length) {
      setTbParseMessage('Chá»n Ã­t nháº¥t má»™t thuÃª bao trong danh sÃ¡ch.');
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
          `ÄÃ£ chuyá»ƒn ${picked.length} thuÃª bao sang Â«${target}Â», nhÆ°ng khÃ´ng lÆ°u Ä‘Æ°á»£c lá»‹ch sá»­ server: ${saveData?.message || saveRes.statusText || 'Lá»—i khÃ´ng rÃµ'}`
        );
        setTbShowChuyenModal(false);
        return;
      }
    } catch (saveErr) {
      setTbParseMessage(
        `ÄÃ£ chuyá»ƒn ${picked.length} thuÃª bao sang Â«${target}Â», nhÆ°ng khÃ´ng lÆ°u Ä‘Æ°á»£c lá»‹ch sá»­ server: ${saveErr?.message || 'Lá»—i máº¡ng'}`
      );
      setTbShowChuyenModal(false);
      return;
    }
    setTbShowChuyenModal(false);
    setTbParseMessage(`ÄÃ£ chuyá»ƒn ${picked.length} thuÃª bao sang Â«${target}Â». CÃ³ thá»ƒ xem/xuáº¥t á»Ÿ má»¥c BÃ¡o cÃ¡o.`);
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
          'TÃªn KH': r.tenKH ?? '',
          'Äá»‹a chá»‰': r.diaChi ?? '',
          'Äá»‹a bÃ n cÅ©': diaBanCu,
          'Äá»‹a bÃ n má»›i': diaBanMoi,
          'Thá»i gian chuyá»ƒn': new Date(batch.thoiGian).toLocaleString('vi-VN'),
          'Thiáº¿t bá»‹ thao tÃ¡c': batch.thietBiThaoTac || 'â€”',
        });
      });
    });
    if (!flat.length) {
      setTbParseMessage('ChÆ°a cÃ³ thuÃª bao nÃ o Ä‘Æ°á»£c chuyá»ƒn Ä‘á»‹a bÃ n Ä‘á»ƒ xuáº¥t.');
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
      setTbParseMessage(e?.message || 'Lá»—i xuáº¥t Excel.');
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
          setTbUploadGateError('KhÃ´ng kiá»ƒm tra Ä‘Æ°á»£c khÃ³a upload. Thá»­ táº£i láº¡i trang.');
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

  // Äá»“ng bá»™ key cá»§a toQL khi nguá»“n dá»¯ liá»‡u Ä‘á»•i kiá»ƒu (uuid <-> donviId) Ä‘á»ƒ dropdown khÃ´ng rÆ¡i vá» "-- Chá»n --".
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

  /** Khi chÆ°a cÃ³ danh sÃ¡ch Tá»• KT tá»« API nhÆ°ng Ä‘Ã£ cÃ³ snapshot Ä‘á»“ng bá»™ â€” Ä‘á»• tá»« snapshot. */
  useEffect(() => {
    if (!browseSnapshot?.toKyThuat?.length) return;
    if (listToQL.length > 0) return;
    const list = browseSnapshot.toKyThuat;
    setListToQL(list);
    setListError('');
    const nhoQuan = pickDefaultToQlItem(list);
    if (nhoQuan != null) setToQL(optionValue(nhoQuan));
  }, [browseSnapshot, listToQL.length]);

  /**
   * @returns {Promise<{ kind: 'hit'|'miss'|'unconfigured'|'error', data?: unknown[], message?: string }>}
   */
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
      const j = await res.json().catch(() => ({}));
      if (res.status === 503 || j?.message?.includes('ChÆ°a cáº¥u hÃ¬nh Supabase')) {
        return {
          kind: 'unconfigured',
          message: j?.message || 'ChÆ°a cáº¥u hÃ¬nh Supabase trÃªn server (kiá»ƒm tra biáº¿n mÃ´i trÆ°á»ng Vercel).',
        };
      }
      if (!j.ok) {
        return { kind: 'error', message: j?.message || 'Lá»—i Ä‘á»c cache Supabase.' };
      }
      if (!j.hit) return { kind: 'miss' };
      return { kind: 'hit', data: Array.isArray(j.data) ? j.data : [] };
    } catch (e) {
      return { kind: 'error', message: e?.message || 'KhÃ´ng káº¿t ná»‘i Ä‘Æ°á»£c cache server.' };
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
    // Tá»• KT: donviId; Tráº¡m BTS: DONVI_ID; OLT: THIETBI_ID; Card OLT: CARD_ID/THIETBI_ID/VITRI; Port: PORTVL_ID
    const v = item?.donviId ?? item?.DONVI_ID ?? item?.THIETBI_ID ?? item?.CARD_ID ?? item?.SLOT_ID ?? item?.PORTVL_ID ?? item?.VITRI ?? item?.OLT_ID ?? item?.id ?? item?.ma ?? item?.value ?? item?.code ?? (item?.TEN_TB != null && item.TEN_TB !== '' ? item.TEN_TB : '');
    return v !== undefined && v !== null ? String(v) : '';
  }
  function optionLabel(item) {
    if (typeof item === 'string') return item;
    // Card OLT: Æ°u tiÃªn TEN_TB (#01 NGLT-C...), khÃ´ng cÃ³ thÃ¬ dÃ¹ng Slot VITRI
    if (item?.TEN_TB != null && item.TEN_TB !== '') return item.TEN_TB;
    const vitri = item?.VITRI;
    if (vitri !== undefined && vitri !== null) return `Slot ${vitri}`;
    return item?.TEN_DV ?? item?.TEN_OLT ?? item?.ten ?? item?.name ?? item?.label ?? item?.title ?? String(optionValue(item) || '');
  }

  function toQlDisplayName(rawToQl) {
    const key = String(rawToQl || '');
    if (!key) return 'â€”';
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
      const fetchOpts = { headers: authHeadersForFetch(auth), cache: 'no-store' };
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
          ? 'KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch. LiÃªn há»‡ quáº£n trá»‹ Ä‘á»ƒ kiá»ƒm tra cáº¥u hÃ¬nh.'
          : 'KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch. Kiá»ƒm tra Authorization vÃ  API danh sÃ¡ch OneBSS.'));
      }
    } catch (e) {
      LOG('loadDanhSach error', e);
      setListError(e.message || 'Lá»—i táº£i danh sÃ¡ch.');
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

  // Sau khi cÃ³ danh sÃ¡ch Tráº¡m BTS cho tá»• Ä‘ang chá»n, tá»± chá»n pháº§n tá»­ Ä‘áº§u náº¿u chÆ°a chá»n.
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

  // Sau khi cÃ³ danh sÃ¡ch OLT cá»§a Tráº¡m BTS Ä‘ang chá»n, tá»± chá»n pháº§n tá»­ Ä‘áº§u náº¿u chÆ°a chá»n.
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
      catalogToQlRef.current = '';
      setListVeTinh([]);
      setVeTinh('');
      setCardOlt('');
      setThietBiOlt('');
      return;
    }
    const toQlChanged = catalogToQlRef.current !== toQL;
    catalogToQlRef.current = toQL;
    if (toQlChanged) {
      catalogVeTinhRef.current = '';
      catalogOltRef.current = '';
      catalogCardRef.current = '';
      setVeTinh('');
      setCardOlt('');
      setThietBiOlt('');
    }
    const snapNow = browseSnapshotRef.current;
    const fromBrowseInit = browseTramsForTo(snapNow, toQL);
    if (fromBrowseInit.length) {
      setListVeTinh((prev) => mergeBrowseOptions(prev, fromBrowseInit, toQlChanged ? '' : veTinh));
      if (toQlChanged) setListError('Äang dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).');
    } else if (toQlChanged) {
      setListVeTinh([]);
    }
    const url = `/api/danh-sach?loai=tram_bts&toKyThuat=${encodeURIComponent(toQL)}`;
    LOG('VeTinh request', url, 'toQL', toQL);
    fetch(url, { headers: authHeadersForFetch(authorization), cache: 'no-store' })
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
        const fromBrowseClean = browseTramsForTo(browseSnapshotRef.current, toQL);
        if (looksLikeAuthError(status, data)) {
          clearStoredAuthorization(setAuthorization);
        }
        if (fromBrowseClean.length > 0) {
          setListError(looksLikeAuthError(status, data) ? 'Authorization háº¿t háº¡n â€” Ä‘Ã£ dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).' : '');
          setListVeTinh(fromBrowseClean);
          return;
        }
        if (!ok) {
          setListError(data?.message || data?.error || `KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch Tráº¡m BTS (${status}). Kiá»ƒm tra Authorization hoáº·c thá»­ tá»• KT khÃ¡c.`);
        } else {
          setListError(data?.message || 'KhÃ´ng cÃ³ dá»¯ liá»‡u Tráº¡m BTS.');
        }
        setListVeTinh([]);
      })
      .catch((e) => {
        const fromBrowseClean = browseTramsForTo(browseSnapshotRef.current, toQL);
        if (fromBrowseClean.length > 0) {
          setListError('');
          setListVeTinh(fromBrowseClean);
          return;
        }
        LOG('VeTinh error', e);
        setListError(e.message || 'Lá»—i táº£i danh sÃ¡ch Tráº¡m BTS.');
        setListVeTinh([]);
      });
  }, [toQL, authorization]);

  // Chá»n Tráº¡m BTS â†’ chá»‰ load danh sÃ¡ch Thiáº¿t bá»‹ OLT
  useEffect(() => {
    if (!veTinh) {
      catalogVeTinhRef.current = '';
      setListThietBiOlt([]);
      setThietBiOlt('');
      setListCardOlt([]);
      setCardOlt('');
      return;
    }
    const veTinhChanged = catalogVeTinhRef.current !== veTinh;
    catalogVeTinhRef.current = veTinh;
    if (veTinhChanged) {
      catalogOltRef.current = '';
      catalogCardRef.current = '';
      setThietBiOlt('');
      setListCardOlt([]);
      setCardOlt('');
    }
    const snapNow = browseSnapshotRef.current;
    const fromBrowseInitOlt = browseOltsForTram(snapNow, toQL, veTinh);
    if (fromBrowseInitOlt.length) {
      setListThietBiOlt((prev) => mergeBrowseOptions(prev, fromBrowseInitOlt, veTinhChanged ? '' : thietBiOlt));
      if (veTinhChanged) setListError('Äang dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).');
    } else if (veTinhChanged) {
      setListThietBiOlt([]);
    }
    const url = `/api/danh-sach?loai=olt&toKyThuat=${encodeURIComponent(toQL)}&tramBts=${encodeURIComponent(veTinh)}`;
    LOG('OLT request', url, 'veTinh (DONVI_ID)', veTinh);
    fetch(url, { headers: authHeadersForFetch(authorization), cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        const listOlt = sanitizeSelectOptions(normaliseList(data));
        LOG('OLT data', { ok, len: listOlt.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload && listOlt.length > 0) {
          setListError('');
          setListThietBiOlt(listOlt);
          return;
        }
        const fromBrowseClean = browseOltsForTram(browseSnapshotRef.current, toQL, veTinh);
        const authErr = looksLikeAuthError(status, data);
        if (authErr) clearStoredAuthorization(setAuthorization);
        if (fromBrowseClean.length > 0) {
          setListError(authErr ? 'Authorization háº¿t háº¡n â€” Ä‘Ã£ dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).' : '');
          setListThietBiOlt(fromBrowseClean);
          return;
        }
        if (!ok && data?.message) setListError(data.message || 'KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch Thiáº¿t bá»‹ OLT.');
        setListThietBiOlt([]);
      })
      .catch((e) => {
        const fromBrowseClean = browseOltsForTram(browseSnapshotRef.current, toQL, veTinh);
        if (fromBrowseClean.length > 0) {
          setListError('');
          setListThietBiOlt(fromBrowseClean);
          return;
        }
        LOG('OLT error', e);
        setListError(e.message || 'Lá»—i táº£i OLT.');
        setListThietBiOlt([]);
      });
  }, [veTinh, toQL, authorization]);

  // Chá»n Thiáº¿t bá»‹ OLT â†’ load danh sÃ¡ch Card OLT (body { id: THIETBI_ID })
  useEffect(() => {
    if (!thietBiOlt) {
      catalogOltRef.current = '';
      setListCardOlt([]);
      setCardOlt('');
      return;
    }
    const oltChanged = catalogOltRef.current !== thietBiOlt;
    catalogOltRef.current = thietBiOlt;
    if (oltChanged) {
      catalogCardRef.current = '';
      setCardOlt('');
    }
    const snapNowCard = browseSnapshotRef.current;
    const fromBrowseInitCard = browseCardsForOlt(snapNowCard, thietBiOlt);
    if (fromBrowseInitCard.length) {
      setListCardOlt((prev) => mergeBrowseOptions(prev, fromBrowseInitCard, oltChanged ? '' : cardOlt));
      if (oltChanged) setListError('Äang dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).');
    } else if (oltChanged) {
      setListCardOlt([]);
    }
    const url = `/api/danh-sach?loai=card_olt&olt=${encodeURIComponent(thietBiOlt)}`;
    LOG('Card OLT request', url, 'thietBiOlt (THIETBI_ID)', thietBiOlt);
    fetch(url, { headers: authHeadersForFetch(authorization), cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        const list = normaliseList(data);
        LOG('Card OLT data', { ok, len: list.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload && list.length > 0) {
          setListError('');
          setListCardOlt(list);
          return;
        }
        const fromBrowse = browseCardsForOlt(browseSnapshotRef.current, thietBiOlt);
        const authErr = looksLikeAuthError(status, data);
        if (authErr) clearStoredAuthorization(setAuthorization);
        if (fromBrowse.length > 0) {
          setListError(authErr ? 'Authorization háº¿t háº¡n â€” Ä‘Ã£ dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).' : '');
          setListCardOlt(fromBrowse);
          return;
        }
        if (!ok && data?.message) setListError(data.message || 'KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch Card OLT.');
        else if (ok && list.length === 0) setListError('KhÃ´ng cÃ³ Card OLT cho thiáº¿t bá»‹ nÃ y.');
        setListCardOlt([]);
      })
      .catch((e) => {
        const fromBrowse = browseCardsForOlt(browseSnapshotRef.current, thietBiOlt);
        if (fromBrowse.length > 0) {
          setListError('');
          setListCardOlt(fromBrowse);
          return;
        }
        LOG('Card OLT error', e);
        setListError(e.message || 'Lá»—i táº£i Card OLT.');
        setListCardOlt([]);
      });
  }, [thietBiOlt, authorization]);

  // Chá»n Card OLT â†’ load danh sÃ¡ch Port OLT tá»« API (layDsPortOltTheoCardOlt), khÃ´ng dÃ¹ng danh sÃ¡ch cá»‘ Ä‘á»‹nh
  useEffect(() => {
    if (!cardOlt) {
      catalogCardRef.current = '';
      setListPortOlt([]);
      setPortOlt('');
      setLoadingPortOlt(false);
      return;
    }
    const cardChanged = catalogCardRef.current !== cardOlt;
    catalogCardRef.current = cardOlt;
    if (cardChanged) setPortOlt('');
    setLoadingPortOlt(true);
    const snapNowPort = browseSnapshotRef.current;
    const fromBrowseInitPort = browsePortsForCard(snapNowPort, cardOlt);
    if (fromBrowseInitPort.length) {
      setListPortOlt((prev) => mergeBrowseOptions(prev, fromBrowseInitPort, cardChanged ? '' : portOlt));
      if (cardChanged) setListError('Äang dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).');
    } else if (cardChanged) {
      setListPortOlt([]);
    }
    const url = `/api/danh-sach?loai=port_olt&cardOlt=${encodeURIComponent(cardOlt)}`;
    LOG('Port OLT request', url);
    fetch(url, { headers: authHeadersForFetch(authorization), cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})).then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        const list = normaliseList(data);
        LOG('Port OLT data', { ok, len: list.length });
        const badPayload = data?.message && !Array.isArray(data) && !data?.data;
        if (ok && !badPayload && list.length > 0) {
          setListError('');
          setListPortOlt(list);
          return;
        }
        const fromBrowse = browsePortsForCard(browseSnapshotRef.current, cardOlt);
        const authErr = looksLikeAuthError(status, data);
        if (authErr) clearStoredAuthorization(setAuthorization);
        if (fromBrowse.length > 0) {
          setListError(authErr ? 'Authorization háº¿t háº¡n â€” Ä‘Ã£ dÃ¹ng danh má»¥c cache Ä‘á»“ng bá»™ (Supabase).' : '');
          setListPortOlt(fromBrowse);
          return;
        }
        if (!ok && data?.message) setListError(data.message || 'KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch Port OLT.');
        setListPortOlt([]);
      })
      .catch((e) => {
        const fromBrowse = browsePortsForCard(browseSnapshotRef.current, cardOlt);
        if (fromBrowse.length > 0) {
          setListError('');
          setListPortOlt(fromBrowse);
          return;
        }
        LOG('Port OLT error', e);
        setListError(e.message || 'Lá»—i táº£i Port OLT.');
        setListPortOlt([]);
      })
      .finally(() => setLoadingPortOlt(false));
  }, [cardOlt, authorization]);

  /** Cache danh má»¥c tÄƒng dáº§n khi Ä‘á»“ng bá»™ â€” chá»‰ bá»• sung option, khÃ´ng reset Tráº¡m/OLT Ä‘ang chá»n. */
  useEffect(() => {
    if (!toQL || !browseSnapshot) return;
    const from = browseTramsForTo(browseSnapshot, toQL);
    if (!from.length) return;
    setListVeTinh((prev) => mergeBrowseOptions(prev, from, veTinh));
  }, [browseSnapshot, toQL, veTinh]);

  useEffect(() => {
    if (!toQL || !veTinh || !browseSnapshot) return;
    const from = browseOltsForTram(browseSnapshot, toQL, veTinh);
    if (!from.length) return;
    setListThietBiOlt((prev) => mergeBrowseOptions(prev, from, thietBiOlt));
  }, [browseSnapshot, toQL, veTinh, thietBiOlt]);

  useEffect(() => {
    if (!thietBiOlt || !browseSnapshot) return;
    const from = browseCardsForOlt(browseSnapshot, thietBiOlt);
    if (!from.length) return;
    setListCardOlt((prev) => mergeBrowseOptions(prev, from, cardOlt));
  }, [browseSnapshot, thietBiOlt, cardOlt]);

  useEffect(() => {
    if (!cardOlt || !browseSnapshot) return;
    const from = browsePortsForCard(browseSnapshot, cardOlt);
    if (!from.length) return;
    setListPortOlt((prev) => mergeBrowseOptions(prev, from, portOlt));
  }, [browseSnapshot, cardOlt, portOlt]);

  /** Äá»“ng bá»™ toÃ n bá»™ S2 má»—i 5 phÃºt khi JWT Authorization cÃ²n háº¡n; tab áº©n thÃ¬ bá» qua tick. */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const authTrim = (authorization || '').trim();
    if (!authorizationSeemsUnexpired(authTrim)) return undefined;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (syncRunningRef.current) return;
      const latest = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_AUTH)) || '';
      if (!authorizationSeemsUnexpired(String(latest).trim())) return;
      const fn = startFullSyncRef.current;
      if (typeof fn === 'function') void Promise.resolve(fn()).catch(() => {});
    }, AUTH_AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [authorization]);

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
    const authRaw = (authOverride && authOverride.trim()) || (authorization && authorization.trim()) || '';
    const auth = authorizationSeemsUnexpired(authRaw) ? authRaw : '';
    if (syncRunning) return { skipped: true };
    setListError('');
    clearSyncProgressTimer();
    syncProgressLatestRef.current = null;
    syncProgressLastAtRef.current = 0;
    syncAbortRef.current = new AbortController();
    setSyncRunning(true);
    setSyncProgress({ phase: 'scan', done: 0, total: 0, label: 'Äang chuáº©n bá»‹â€¦' });
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
        setListError(`ÄÃ£ dá»«ng Ä‘á»“ng bá»™. ÄÃ£ xá»­ lÃ½ ${result.completed ?? 0}/${result.total ?? 'â€”'} port.`);
      } else if (result.errors > 0) {
        setListError(`Äá»“ng bá»™ xong vá»›i ${result.errors} lá»—i (tra cá»©u API) trÃªn ${result.total} port. CÃ³ thá»ƒ cháº¡y láº¡i.`);
      }
      return { skipped: false, result };
    } catch (err) {
      LOG('Äá»“ng bá»™ toÃ n bá»™', err);
      setListError(err.message || 'Lá»—i Ä‘á»“ng bá»™ toÃ n bá»™.');
      return { skipped: false, error: err };
    } finally {
      clearSyncProgressTimer();
      setSyncRunning(false);
      syncAbortRef.current = null;
      setSyncProgress(null);
    }
  };

  startFullSyncRef.current = startFullSync;

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
        setSaveToServerMessage('ÄÃ£ lÆ°u. Äang tá»± Ä‘á»™ng Ä‘á»“ng bá»™ dá»¯ liá»‡u S2...');
        setAdminPasswordForServer('');
        setShowSettings(false);
        if (!syncRunning && syncAuth) {
          startFullSync({ authOverride: syncAuth, adminPasswordOverride: syncAdminPwd })
            .then((r) => {
              if (r?.skipped) {
                setSaveToServerMessage('ÄÃ£ lÆ°u. Äá»“ng bá»™ Ä‘ang cháº¡y sáºµn, tiáº¿p tá»¥c dÃ¹ng tra cá»©u bÃ¬nh thÆ°á»ng.');
                return;
              }
              if (r?.error) {
                setSaveToServerMessage(`ÄÃ£ lÆ°u nhÆ°ng tá»± Ä‘á»“ng bá»™ lá»—i: ${r.error?.message || 'KhÃ´ng xÃ¡c Ä‘á»‹nh'}`);
                return;
              }
              setSaveToServerMessage('ÄÃ£ lÆ°u vÃ  tá»± Ä‘á»™ng Ä‘á»“ng bá»™ hoÃ n táº¥t. Báº¡n váº«n cÃ³ thá»ƒ tra cá»©u trong lÃºc Ä‘á»“ng bá»™.');
            })
            .catch((syncErr) => {
              setSaveToServerMessage(`ÄÃ£ lÆ°u nhÆ°ng tá»± Ä‘á»“ng bá»™ lá»—i: ${syncErr?.message || 'KhÃ´ng xÃ¡c Ä‘á»‹nh'}`);
            });
        } else if (!syncAuth) {
          setSaveToServerMessage('ÄÃ£ lÆ°u. KhÃ´ng thá»ƒ tá»± Ä‘á»“ng bá»™ vÃ¬ Authorization Ä‘ang trá»‘ng.');
        } else {
          setSaveToServerMessage('ÄÃ£ lÆ°u. Äá»“ng bá»™ Ä‘ang cháº¡y sáºµn, tiáº¿p tá»¥c dÃ¹ng tra cá»©u bÃ¬nh thÆ°á»ng.');
        }
      } else {
        setSaveToServerStatus('error');
        setSaveToServerMessage(data.message || 'KhÃ´ng lÆ°u Ä‘Æ°á»£c.');
      }
    } catch (err) {
      setSaveToServerStatus('error');
      setSaveToServerMessage(err.message || 'Lá»—i káº¿t ná»‘i.');
    }
  };

  function resolveAuthAddressForProposal() {
    const trim = (authorization || '').trim();
    if (trim) {
      const a = getAuthAddressFromJwt(trim);
      if (a) return a;
    }
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_AUTH) || '';
      const a = getAuthAddressFromJwt(stored);
      if (a) return a;
    }
    return '';
  }

  const refreshS2Proposals = async () => {
    setS2ProposalsLoading(true);
    setS2ProposalsError('');
    try {
      const res = await fetch('/api/s2-proposals', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setS2Proposals([]);
        setS2ProposalsError(j?.message || `KhÃ´ng táº£i Ä‘Æ°á»£c bÃ¡o cÃ¡o (${res.status}).`);
        return;
      }
      setS2Proposals(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setS2Proposals([]);
      setS2ProposalsError(e?.message || 'Lá»—i táº£i bÃ¡o cÃ¡o Ä‘á» xuáº¥t.');
    } finally {
      setS2ProposalsLoading(false);
    }
  };

  const openProposalModal = (tenS2) => {
    setProposalTargetS2(String(tenS2 || '').trim());
    setProposalNvDiaBan('');
    setProposalText('');
    setProposalError('');
    setProposalModalOpen(true);
  };

  const closeProposalModal = () => {
    if (proposalSaving) return;
    setProposalModalOpen(false);
    setProposalTargetS2('');
    setProposalNvDiaBan('');
    setProposalText('');
    setProposalError('');
  };

  const handleSaveProposal = async () => {
    const tenSp2 = String(proposalTargetS2 || '').trim();
    const tenNvDiaBan = String(proposalNvDiaBan || '').trim();
    const deXuat = String(proposalText || '').trim();
    if (!tenNvDiaBan || !deXuat) return;
    setProposalSaving(true);
    setProposalError('');
    try {
      const { latitude, longitude } = await getCurrentPositionAsync();
      const diaChi = resolveAuthAddressForProposal();
      const toaDo = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      const res = await fetch('/api/s2-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenSp2,
          tenNvDiaBan,
          deXuat,
          diaChi,
          latitude,
          longitude,
          toaDo,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setProposalError(j?.message || `KhÃ´ng lÆ°u Ä‘Æ°á»£c (${res.status}).`);
        return;
      }
      setProposalModalOpen(false);
      setProposalTargetS2('');
      setProposalNvDiaBan('');
      setProposalText('');
      if (showReportPanel && activeReportId === 's2_renovation_proposals') {
        await refreshS2Proposals();
      }
    } catch (e) {
      setProposalError(e?.message || 'Lá»—i khi lÆ°u Ä‘á» xuáº¥t.');
    } finally {
      setProposalSaving(false);
    }
  };

  const proposalCanSave =
    !!String(proposalNvDiaBan || '').trim() && !!String(proposalText || '').trim() && !proposalSaving;

  useEffect(() => {
    if (!showReportPanel || activeReportId !== 's2_renovation_proposals') return;
    refreshS2Proposals();
  }, [showReportPanel, activeReportId]);

  const handleTraCuu = async (e) => {
    e.preventDefault();
    setLoi(null);
    setKetQua(null);
    setLoading(true);
    if (!ttvt?.trim() && useTtvt) {
      setLoi('Vui lÃ²ng chá»n TTVT.');
      setLoading(false);
      return;
    }
    if (!toQL?.trim() && useToQL) {
      setLoi('Vui lÃ²ng chá»n Tá»• KT.');
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
    LOG('Tra cá»©u', 'Request body', body);

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
        if (srv.kind === 'hit') {
          const arr = srv.data ?? [];
          const message =
            arr.length === 0
              ? 'KhÃ´ng cÃ³ báº£n ghi trong cache chung (Supabase) cho port Ä‘Ã£ chá»n.'
              : null;
          setKetQua({ data: arr, message, fromCache: 'server' });
          return;
        }
        if (srv.kind === 'unconfigured') {
          setLoi(srv.message || 'ChÆ°a cáº¥u hÃ¬nh Supabase trÃªn server.');
          return;
        }
        const cached = await getPortCache(cacheKey, fp);
        if (cached === null) {
          setLoi(
            'ChÆ°a cÃ³ dá»¯ liá»‡u Ä‘á»“ng bá»™ cho bá»™ lá»c nÃ y. Quáº£n trá»‹ cháº¡y Â«Äá»“ng bá»™ toÃ n bá»™ S2Â» kÃ¨m mÃ£ ghi cache chung, hoáº·c táº¯t Â«Chá»‰ tra cá»©u tá»« cacheÂ».'
          );
          return;
        }
        const message =
          cached.length === 0
            ? 'KhÃ´ng cÃ³ báº£n ghi trong bá»™ nhá»› trÃ¬nh duyá»‡t cho port Ä‘Ã£ chá»n.'
            : null;
        setKetQua({ data: cached, message, fromCache: 'local' });
        return;
      }

      let clientAuthValid = authorizationSeemsUnexpired(authTrim);
      let clientAuthExpired = !!(authTrim && !clientAuthValid);
      let noClientAuth = !authTrim;
      let supabaseDiag = null;

      const invalidateClientAuth = () => {
        clearStoredAuthorization(setAuthorization);
        clientAuthValid = false;
        clientAuthExpired = true;
        noClientAuth = true;
      };

      const applyCacheFallback = async () => {
        const srv = await fetchServerPortCache(keyBody);
        if (srv.kind === 'unconfigured' || srv.kind === 'error') {
          supabaseDiag = srv.message || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c cache Supabase.';
          return false;
        }
        if (srv.kind === 'hit') {
          const arr = srv.data ?? [];
          const expiredHint =
            clientAuthExpired || noClientAuth
              ? arr.length === 0
                ? 'Authorization Ä‘Ã£ háº¿t háº¡n. KhÃ´ng cÃ³ báº£n ghi trong cache Supabase cho port nÃ y.'
                : 'Authorization Ä‘Ã£ háº¿t háº¡n â€” Ä‘ang dÃ¹ng cache Ä‘á»“ng bá»™ (Supabase).'
              : null;
          const cacheMsg =
            arr.length === 0 && clientAuthValid && apiFallbackNotice
              ? 'KhÃ´ng cÃ³ báº£n ghi trong cache chung sau khi API khÃ´ng tráº£ dá»¯ liá»‡u.'
              : null;
          const message = [expiredHint, apiFallbackNotice, cacheMsg].filter(Boolean).join(' ') || null;
          setKetQua({ data: arr, message, fromCache: 'server' });
          return true;
        }
        const cached = await getPortCache(cacheKey, fp);
        if (cached !== null) {
          const expiredHint = clientAuthExpired
            ? 'Authorization Ä‘Ã£ háº¿t háº¡n â€” Ä‘ang dÃ¹ng cache trÃ¬nh duyá»‡t.'
            : null;
          const cacheMsg =
            cached.length === 0 && !clientAuthExpired
              ? 'KhÃ´ng cÃ³ báº£n ghi trong bá»™ nhá»› trÃ¬nh duyá»‡t. Báº­t Â«LuÃ´n gá»i APIÂ» Ä‘á»ƒ há»i láº¡i server.'
              : null;
          const message = [expiredHint, apiFallbackNotice, cacheMsg].filter(Boolean).join(' ') || null;
          setKetQua({ data: cached, message, fromCache: 'local' });
          return true;
        }
        return false;
      };

      const failWithoutCache = () => {
        if (supabaseDiag) {
          setLoi(
            `${supabaseDiag} Tra cá»©u khÃ´ng cáº§n Authorization chá»‰ hoáº¡t Ä‘á»™ng khi Ä‘Ã£ cáº¥u hÃ¬nh Supabase vÃ  Ä‘á»“ng bá»™ dá»¯ liá»‡u lÃªn server.`
          );
          return;
        }
        if (clientAuthExpired || noClientAuth) {
          const browseHint = hasBrowseCatalog(browseSnapshotRef.current)
            ? ' Danh má»¥c Tráº¡m/OLT váº«n cÃ³ thá»ƒ chá»n tá»« cache; cáº§n chá»n Ä‘á»§ Port OLT Ä‘Ã£ Ä‘Æ°á»£c Ä‘á»“ng bá»™.'
            : '';
          setLoi(
            `Authorization Ä‘Ã£ háº¿t háº¡n hoáº·c khÃ´ng há»£p lá»‡, vÃ  chÆ°a cÃ³ dá»¯ liá»‡u S2 trÃªn Supabase cho port nÃ y.${browseHint} Quáº£n trá»‹ cáº§n lÆ°u Authorization má»›i vÃ  Â«Äá»“ng bá»™ toÃ n bá»™ S2Â» (cÃ³ mÃ£ cache chung).`
          );
          return;
        }
        setLoi(
          'ChÆ°a cÃ³ dá»¯ liá»‡u cache trÃªn Supabase cho port Ä‘Ã£ chá»n. Quáº£n trá»‹ cáº§n cháº¡y Â«Äá»“ng bá»™ toÃ n bá»™ S2Â» vÃ  nháº­p mÃ£ ghi cache chung â€” khÃ´ng chá»‰ Ä‘á»“ng bá»™ trÃªn má»™t trÃ¬nh duyá»‡t.'
        );
      };

      /** JWT háº¿t háº¡n/sai: Supabase trÆ°á»›c; cÃ²n háº¡n (mÃ¡y hoáº·c server): OneBSS trÆ°á»›c. */
      if (!boQuaCache && !clientAuthValid) {
        if (await applyCacheFallback()) return;
      }

      if (!boQuaCache) {
        try {
          const headers = {
            'Content-Type': 'application/json',
            ...authHeadersForFetch(authTrim),
          };
          const res = await fetch('/api/tracuu', { method: 'POST', headers, body: JSON.stringify(body) });
          const data = await res.json().catch(() => ({}));
          LOG('Tra cá»©u', 'Response (API)', { status: res.status, ok: res.ok, data });
          if (res.ok) {
            const list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
            const arr = Array.isArray(list) ? list : [];
            if (arr.length > 0) {
              const serverHint =
                !clientAuthValid
                  ? 'Tra cá»©u qua Authorization lÆ°u trÃªn server.'
                  : null;
              setKetQua({
                data: arr,
                message: [serverHint, data?.message].filter(Boolean).join(' ') || null,
                fromCache: 'api',
              });
              return;
            }
            if (await applyCacheFallback()) return;
            setKetQua({
              data: [],
              message: data?.message || 'KhÃ´ng cÃ³ báº£n ghi nÃ o tá»« API.',
              fromCache: 'api',
            });
            return;
          }
          if (looksLikeAuthError(res.status, data)) {
            invalidateClientAuth();
            clientAuthValid = false;
            clientAuthExpired = true;
            noClientAuth = true;
            if (await applyCacheFallback()) return;
            failWithoutCache();
            return;
          }
          apiFallbackNotice = data?.message || data?.error || `API lá»—i (${res.status}), Ä‘Ã£ chuyá»ƒn sang cache.`;
        } catch (err) {
          apiFallbackNotice = err?.message || 'KhÃ´ng gá»i Ä‘Æ°á»£c API, Ä‘Ã£ chuyá»ƒn sang cache.';
        }
        if (await applyCacheFallback()) return;
        failWithoutCache();
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        ...authHeadersForFetch(authTrim),
      };
      const res = await fetch('/api/tracuu', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      LOG('Tra cá»©u', 'Response', { status: res.status, ok: res.ok, data });
      if (!res.ok) {
        if (looksLikeAuthError(res.status, data)) {
          invalidateClientAuth();
        }
        if (await applyCacheFallback()) return;
        setLoi(data.message || data.error || 'CÃ³ lá»—i khi tra cá»©u.');
        return;
      }
      const list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
      const arr = Array.isArray(list) ? list : [];
      if (arr.length === 0 && (await applyCacheFallback())) return;
      const message = data?.message || (arr.length === 0 ? 'KhÃ´ng cÃ³ báº£n ghi nÃ o tá»« API.' : null);
      setKetQua({ data: arr, message, fromCache: 'api' });
    } catch (err) {
      LOG('Tra cá»©u', 'Lá»—i', err);
      setLoi(err.message || 'Lá»—i káº¿t ná»‘i.');
    } finally {
      setLoading(false);
    }
  };

  const chuaTraCuu = !ketQua && !loi && !loading;

  const syncPhaseLabel =
    syncProgress?.phase === 'scan'
      ? 'Äang quÃ©t danh má»¥c (Tá»• KT â†’ â€¦ â†’ Port)'
      : 'Äang tra cá»©u S2 tá»«ng port';
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
      {/* Tiáº¿n Ä‘á»™ Ä‘á»“ng bá»™ S2 â€” cá»‘ Ä‘á»‹nh Ä‘áº§u mÃ n hÃ¬nh Ä‘á»ƒ cuá»™n trang váº«n theo dÃµi Ä‘Æ°á»£c */}
      {syncRunning && syncProgress && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Tiáº¿n Ä‘á»™ Ä‘á»“ng bá»™ S2"
          className="fixed inset-x-0 top-0 z-[100] border-b border-indigo-900/30 bg-gradient-to-r from-indigo-800 via-violet-800 to-indigo-800 text-white shadow-lg"
        >
          <div className="max-w-[1600px] mx-auto px-3 py-2.5 sm:px-6 sm:py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-indigo-100">{syncPhaseLabel}</p>
              {syncProgress.phase === 'tracuu' && (
                <p className="text-sm sm:text-base font-bold text-amber-200 tabular-nums">
                  ÄÃ£ gom Ä‘Æ°á»£c <span className="text-white">{syncProgress.s2Count ?? 0}</span> S2
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
                <p className="text-xs text-indigo-200 whitespace-nowrap">Äang tÃ­nh sá»‘ portâ€¦</p>
              )}
              <button
                type="button"
                onClick={handleHuyDongBo}
                className="rounded-lg bg-white/15 hover:bg-white/25 border border-white/30 px-3 py-1.5 text-xs font-semibold"
              >
                Há»§y Ä‘á»“ng bá»™
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`w-full max-w-[1600px] mx-auto min-h-0 flex flex-col sm:min-h-[calc(100vh-2rem)] ${syncRunning && syncProgress ? 'pt-[88px] sm:pt-[100px]' : ''}`}>
        {/* Card chÃ­nh - vá»«a mÃ n hÃ¬nh mobile */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden flex-1 flex flex-col min-h-0 sm:min-h-[80vh]">
          {/* Header - gá»n trÃªn mobile */}
          <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-3 sm:px-8 sm:py-6 shrink-0">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1 pr-0 sm:pr-2">
                <h1 className="text-base sm:text-2xl font-bold text-white tracking-tight sm:truncate">
                  {activeMainModule === TB_MODULE_TB ? 'Module tra cá»©u thuÃª bao (TB)' : 'Module tra cá»©u S2'}
                </h1>
                <p className="text-sky-100 text-[11px] sm:text-sm mt-0.5 sm:mt-1 leading-snug hidden sm:block">
                  {activeMainModule === TB_MODULE_TB
                    ? 'Upload Excel, lá»c theo nhÃ¢n viÃªn QL / OLT / Slot / Port, chuyá»ƒn Ä‘á»‹a bÃ n vÃ  xuáº¥t Excel.'
                    : 'Há»‡ thá»‘ng tra cá»©u thÃ´ng tin S2 theo OLT, Slot vÃ  Port'}
                </p>
                <p className="text-sky-100/95 text-[10px] leading-snug mt-1 line-clamp-2 sm:hidden">
                  {activeMainModule === TB_MODULE_TB
                    ? 'Excel Â· NV QL / OLT / Slot / Port Â· chuyá»ƒn Ä‘á»‹a bÃ n Â· xuáº¥t file'
                    : 'Tra cá»©u S2 theo OLT, Slot, Port'}
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
                        setAuthPasswordError('Vui lÃ²ng nháº­p mÃ£ Ä‘á»ƒ má»Ÿ menu bÃ¡o cÃ¡o.');
                        return;
                      }
                      setShowSettings(true);
                      setShowReportPanel(true);
                      setShowReportMenu((v) => !v);
                    }}
                    className="inline-flex w-full h-full min-h-[48px] sm:min-h-[44px] sm:h-auto sm:w-auto shrink-0 items-center justify-center gap-1 sm:gap-2 rounded-lg border font-medium touch-manipulation transition-colors px-1.5 py-2 sm:px-4 sm:py-2.5 text-[10px] sm:text-sm leading-tight bg-white/20 hover:bg-white/30 text-white border-white/40"
                    aria-label={`Menu bÃ¡o cÃ¡o - Ä‘ang chá»n ${activeReport.label}`}
                    aria-expanded={showReportMenu}
                  >
                    <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v4H3V3zm0 7h18v4H3v-4zm0 7h18v4H3v-4z" />
                    </svg>
                    <span>BÃ¡o cÃ¡o</span>
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
                  aria-label={showSettings ? 'áº¨n cÃ i Ä‘áº·t' : 'CÃ i Ä‘áº·t vÃ  Ä‘á»“ng bá»™'}
                >
                  <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span>{showSettings ? 'áº¨n cÃ i Ä‘áº·t' : 'CÃ i Ä‘áº·t'}</span>
                  <span className="hidden sm:inline">{showSettings ? '' : ' / Äá»“ng bá»™'}</span>
                  <svg className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeMainModule === TB_MODULE_SPLITTER}
                  aria-label="Tra cá»©u S2"
                  title="Tra cá»©u S2"
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
                  Tra cá»©u S2
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeMainModule === TB_MODULE_TB}
                  aria-label="Module tra cá»©u thuÃª bao"
                  title="Tra cá»©u TB"
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
                  Tra cá»©u TB
                </button>
              </div>
            </div>
          </div>

          {/* CÃ i Ä‘áº·t â€” khu vá»±c quáº£n trá»‹ */}
          {showSettings && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-3 sm:px-8 py-3 sm:py-4 shrink-0">
              {!authUnlocked ? (
                <form onSubmit={handleUnlockAuth} className="space-y-3 max-w-xs">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nháº­p mÃ£ Ä‘á»ƒ má»Ÿ cÃ i Ä‘áº·t</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      value={authPasswordInput}
                      onChange={(e) => { setAuthPasswordInput(e.target.value); setAuthPasswordError(''); }}
                      placeholder="MÃ£ má»Ÿ khÃ³a"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                      autoComplete="current-password"
                    />
                    <button type="submit" disabled={authUnlocking} className="rounded-lg bg-sky-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-sky-700 min-h-[44px] whitespace-nowrap disabled:opacity-50">
                      {authUnlocking ? 'Äang kiá»ƒm traâ€¦' : 'Má»Ÿ khÃ³a'}
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
                      KhÃ³a láº¡i
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
                    <label className="block text-xs text-slate-600">MÃ£ xÃ¡c thá»±c lÆ°u server</label>
                    <div className="flex gap-2 flex-wrap items-center">
                      <input
                        type="password"
                        value={adminPasswordForServer}
                        onChange={(e) => { setAdminPasswordForServer(e.target.value); setSaveToServerStatus(''); }}
                        placeholder="MÃ£ xÃ¡c thá»±c"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48 max-w-full"
                      />
                      <button type="submit" disabled={saveToServerStatus === 'saving' || !authorization?.trim()} className="rounded-lg bg-sky-600 text-white px-4 py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
                        {saveToServerStatus === 'saving' ? 'Äang lÆ°u...' : 'LÆ°u lÃªn server'}
                      </button>
                    </div>
                    {saveToServerMessage && <p className={`text-xs ${saveToServerStatus === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{saveToServerMessage}</p>}
                  </form>
                    </>
                  )}

                  <div className="mt-5 pt-5 border-t border-slate-200 space-y-3">
                    {!showReportPanel && (
                      <>
                    <p className="text-xs font-semibold text-slate-700">Äá»“ng bá»™ toÃ n bá»™ S2 &amp; cache tra cá»©u</p>
                    <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                      QuÃ©t Tá»• KT â†’ Tráº¡m â†’ OLT â†’ Card â†’ Port. Sá»‘ port lá»›n cÃ³ thá»ƒ máº¥t nhiá»u phÃºt.
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Náº¿u Authorization lÃ  JWT cÃ²n háº¡n, trang sáº½ tá»± cháº¡y Ä‘á»“ng bá»™ láº¡i má»—i 5 phÃºt (chá»‰ khi tab Ä‘ang hiá»ƒn thá»‹; khÃ´ng cháº¡y trÃ¹ng lÃºc Ä‘ang Ä‘á»“ng bá»™ tay).
                    </p>
                    <div className="max-w-lg">
                      <label className="block text-[11px] sm:text-xs text-slate-600">
                        MÃ£ xÃ¡c thá»±c (ghi cache chung)
                        <input
                          type="password"
                          value={adminPasswordForSync}
                          onChange={(e) => setAdminPasswordForSync(e.target.value)}
                          placeholder="Trá»‘ng = chá»‰ lÆ°u trÃªn mÃ¡y nÃ y"
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
                        {syncRunning ? 'Äang Ä‘á»“ng bá»™â€¦' : 'Äá»“ng bá»™ toÃ n bá»™ S2'}
                      </button>
                      {syncRunning && (
                        <button type="button" onClick={handleHuyDongBo} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[40px]">
                          Há»§y
                        </button>
                      )}
                    </div>
                    {syncRunning && syncProgress && (
                      <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1.5">
                        <span className="font-semibold">Tiáº¿n Ä‘á»™</span> trÃªn <strong>Ä‘áº§u trang</strong>
                        {syncProgress.phase === 'tracuu' && (
                          <> â€” hiá»‡n <strong>{syncProgress.s2Count ?? 0}</strong> S2 Ä‘Ã£ gom</>
                        )}
                        .
                      </p>
                    )}
                    {serverSyncMeta?.lastSyncAt != null && (
                      <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5">
                        <span className="font-semibold">Cache chung (Supabase):</span>{' '}
                        {new Date(serverSyncMeta.lastSyncAt).toLocaleString('vi-VN')}
                        {serverSyncMeta.lastSyncTotal != null && ` â€” ${serverSyncMeta.lastSyncTotal} port`}
                        {serverSyncMeta.lastSyncS2Total != null && (
                          <> â€” <span className="font-semibold">{serverSyncMeta.lastSyncS2Total}</span> S2 Ä‘Ã£ gom</>
                        )}
                        {serverSyncMeta.lastSyncErrors > 0 && ` â€” ${serverSyncMeta.lastSyncErrors} lá»—i`}
                        {serverSyncMeta.lastSyncAborted && ' â€” Ä‘Ã£ dá»«ng giá»¯a chá»«ng'}
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
                            Menu bÃ¡o cÃ¡o
                          </span>
                          {authUnlocked && (
                            <button
                              type="button"
                              onClick={handleLockAuth}
                              className="text-[10px] px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                              title="KhÃ³a láº¡i quyá»n quáº£n trá»‹"
                            >
                              KhÃ³a láº¡i
                            </button>
                          )}
                        </div>
                      </div>
                      {activeReportId === 's2_lookup' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Láº¥y thÃ´ng sá»‘ S2 theo danh sÃ¡ch Ä‘áº§u vÃ o
                            </p>
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={String(s2LookupPageSize)}
                                onChange={(e) => setS2LookupPageSize(Number(e.target.value) || 10)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Sá»‘ dÃ²ng hiá»ƒn thá»‹ má»—i trang"
                              >
                                <option value="10">10 dÃ²ng/trang</option>
                                <option value="20">20 dÃ²ng/trang</option>
                                <option value="50">50 dÃ²ng/trang</option>
                                <option value="100">100 dÃ²ng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportS2LookupExcel}
                                disabled={s2LookupExporting}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {s2LookupExporting ? 'Äang xuáº¥tâ€¦' : 'Xuáº¥t Excel'}
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2 mb-2">
                            <textarea
                              value={s2LookupInput}
                              onChange={(e) => setS2LookupInput(e.target.value)}
                              rows={4}
                              placeholder="Nháº­p danh sÃ¡ch S2 (má»—i dÃ²ng 1 mÃ£, hoáº·c ngÄƒn cÃ¡ch báº±ng dáº¥u pháº©y/cháº¥m pháº©y)"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-700 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            />
                            <div className="flex flex-col sm:flex-row lg:flex-col gap-1.5 lg:items-end">
                              <button
                                type="button"
                                onClick={handleLookupSingleS2}
                                disabled={s2LookupLoading}
                                className="w-full sm:w-auto text-[11px] px-2.5 py-1.5 rounded border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                              >
                                {s2LookupLoading ? 'Äang tra cá»©uâ€¦' : 'Tra cá»©u danh sÃ¡ch'}
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
                            Há»— trá»£ file TXT/CSV/Excel. Há»‡ thá»‘ng sáº½ tÃ¬m S2 Ä‘ang náº±m á»Ÿ OLT, Card, Port nÃ o trong cache Ä‘á»“ng bá»™.
                            {s2LookupFileName ? ` File gáº§n nháº¥t: ${s2LookupFileName}.` : ''}
                          </p>
                          {s2LookupError && <p className="text-[11px] text-red-600 mb-1">{s2LookupError}</p>}
                          {!s2LookupError && s2LookupRows.length === 0 && s2LookupNotFound.length === 0 && !s2LookupLoading && (
                            <p className="text-[11px] text-slate-500">ChÆ°a cÃ³ dá»¯ liá»‡u tra cá»©u S2.</p>
                          )}
                          {s2LookupNotFound.length > 0 && (
                            <p className="text-[11px] text-amber-700 mb-1">
                              KhÃ´ng tÃ¬m tháº¥y {s2LookupNotFound.length} mÃ£ S2: {s2LookupNotFound.slice(0, 10).join(', ')}
                              {s2LookupNotFound.length > 10 ? 'â€¦' : ''}
                            </p>
                          )}
                          {s2LookupRows.length > 0 && (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[680px] text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">S2 tra cá»©u</th>
                                    <th className="text-left py-1 px-2 font-semibold">KÃ½ hiá»‡u S2</th>
                                    <th className="text-left py-1 px-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Card</th>
                                    <th className="text-left py-1 px-2 font-semibold">Port</th>
                                    <th className="text-left py-1 pl-2 font-semibold">Tá»• KT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedS2LookupRows.map((row, idx) => (
                                    <tr
                                      key={`${String(row?.cacheKey || '')}-lookup-${s2LookupStart + idx}`}
                                      className="border-b border-slate-100 last:border-b-0 text-slate-700"
                                    >
                                      <td className="py-1.5 pr-2">{String(row?.queryS2 || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.kyHieu || row?.tenSplitter || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.oltTen || row?.thietBiOlt || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.cardTen || row?.cardOlt || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.portTen || row?.portOlt || 'â€”')}</td>
                                      <td className="py-1.5 pl-2">{String(row?.toTen || row?.toQL || 'â€”')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {s2LookupRows.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-600">
                                Hiá»ƒn thá»‹ {s2LookupStart + 1}-{Math.min(s2LookupStart + s2LookupPageSize, s2LookupRows.length)} / {s2LookupRows.length} dÃ²ng
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setS2LookupPage((p) => Math.max(1, p - 1))}
                                  disabled={s2LookupCurrentPage <= 1}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang trÆ°á»›c
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
                              BÃ¡o cÃ¡o dung lÆ°á»£ng S2
                            </p>
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={s2CapacityToFilter}
                                onChange={(e) => setS2CapacityToFilter(e.target.value)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lá»c theo Tá»• ká»¹ thuáº­t"
                              >
                                <option value="">Táº¥t cáº£ Tá»• KT</option>
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
                                title="Lá»c theo OLT"
                              >
                                <option value="">Táº¥t cáº£ OLT</option>
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
                                title="Sá»‘ dÃ²ng hiá»ƒn thá»‹ má»—i trang"
                              >
                                <option value="10">10 dÃ²ng/trang</option>
                                <option value="20">20 dÃ²ng/trang</option>
                                <option value="50">50 dÃ²ng/trang</option>
                                <option value="100">100 dÃ²ng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportS2CapacityExcel}
                                disabled={s2CapacityExporting}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {s2CapacityExporting ? 'Äang xuáº¥tâ€¦' : 'Xuáº¥t Excel'}
                              </button>
                              <button
                                type="button"
                                onClick={refreshS2CapacityRows}
                                disabled={s2CapacityLoading}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {s2CapacityLoading ? 'Äang táº£iâ€¦' : 'LÃ m má»›i'}
                              </button>
                            </div>
                          </div>
                          {s2CapacityError && <p className="text-[11px] text-red-600 mb-1">{s2CapacityError}</p>}
                          {!s2CapacityError && filteredS2CapacityRows.length === 0 && !s2CapacityLoading && (
                            <p className="text-[11px] text-slate-500">ChÆ°a cÃ³ dá»¯ liá»‡u dung lÆ°á»£ng S2.</p>
                          )}
                          {filteredS2CapacityRows.length > 0 && (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[720px] text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">Tá»• KT</th>
                                    <th className="text-left py-1 px-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">KÃ½ hiá»‡u</th>
                                    <th className="text-right py-1 px-2 font-semibold">Dung lÆ°á»£ng</th>
                                    <th className="text-right py-1 px-2 font-semibold">ÄÃ£ dÃ¹ng</th>
                                    <th className="text-right py-1 pl-2 font-semibold">ChÆ°a dÃ¹ng</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedS2CapacityRows.map((row, idx) => (
                                    <tr key={`${String(row?.cacheKey || '')}-cap-${s2CapacityStart + idx}`} className="border-b border-slate-100 last:border-b-0 text-slate-700">
                                      <td className="py-1.5 pr-2">{String(row?.toTen || row?.toQL || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.oltTen || row?.thietBiOlt || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.kyHieu || row?.tenSplitter || 'â€”')}</td>
                                      <td className="py-1.5 px-2 text-right">{row?.dungLuong ?? 'â€”'}</td>
                                      <td className="py-1.5 px-2 text-right">{row?.daDung ?? 'â€”'}</td>
                                      <td className="py-1.5 pl-2 text-right">{row?.chuaDung ?? 'â€”'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {filteredS2CapacityRows.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-600">
                                Hiá»ƒn thá»‹ {s2CapacityStart + 1}-{Math.min(s2CapacityStart + s2CapacityPageSize, filteredS2CapacityRows.length)} / {filteredS2CapacityRows.length} dÃ²ng
                              </p>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setS2CapacityPage((p) => Math.max(1, p - 1))} disabled={s2CapacityCurrentPage <= 1} className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Trang trÆ°á»›c</button>
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
                              Danh sÃ¡ch cá»•ng PON khÃ´ng cÃ³ S2
                            </p>
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={noSp2ToFilter}
                                onChange={(e) => setNoSp2ToFilter(e.target.value)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lá»c theo Tá»• ká»¹ thuáº­t"
                              >
                                <option value="">Táº¥t cáº£ Tá»• KT</option>
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
                                title="Lá»c theo OLT"
                              >
                                <option value="">Táº¥t cáº£ OLT</option>
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
                                title="Sá»‘ cá»•ng hiá»ƒn thá»‹ má»—i trang"
                              >
                                <option value="10">10 cá»•ng/trang</option>
                                <option value="20">20 cá»•ng/trang</option>
                                <option value="50">50 cá»•ng/trang</option>
                                <option value="100">100 cá»•ng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportNoSp2Excel}
                                disabled={noSp2Exporting}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {noSp2Exporting ? 'Äang xuáº¥tâ€¦' : 'Xuáº¥t Excel'}
                              </button>
                              <button
                                type="button"
                                onClick={refreshNoSp2Rows}
                                disabled={noSp2Loading}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {noSp2Loading ? 'Äang táº£iâ€¦' : 'LÃ m má»›i'}
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-2">
                            BÃ¡o cÃ¡o liá»‡t kÃª cÃ¡c cá»•ng PON chÆ°a cÃ³ S2, há»— trá»£ lá»c theo Tá»• ká»¹ thuáº­t vÃ  OLT.
                          </p>
                          {noSp2Error && (
                            <p className="text-[11px] text-red-600 mb-1">{noSp2Error}</p>
                          )}
                          {!noSp2Error && filteredNoSp2Rows.length === 0 && !noSp2Loading && (
                            <p className="text-[11px] text-slate-500">KhÃ´ng cÃ³ cá»•ng PON nÃ o thiáº¿u S2 theo Ä‘iá»u kiá»‡n lá»c hiá»‡n táº¡i.</p>
                          )}
                          {filteredNoSp2Rows.length > 0 && (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[680px] text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">Tá»• KT</th>
                                    <th className="text-left py-1 px-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Card</th>
                                    <th className="text-left py-1 px-2 font-semibold">Port PON</th>
                                    <th className="text-left py-1 pl-2 font-semibold">Tráº¡m BTS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedNoSp2Rows.map((row, idx) => (
                                    <tr
                                      key={`${String(row?.cacheKey || '')}-nosp2-${noSp2Start + idx}`}
                                      className="border-b border-slate-100 last:border-b-0 text-slate-700"
                                    >
                                      <td className="py-1.5 pr-2">{String(row?.toTen || row?.toQL || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.oltTen || row?.thietBiOlt || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.cardTen || row?.cardOlt || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.portTen || row?.portOlt || 'â€”')}</td>
                                      <td className="py-1.5 pl-2">{String(row?.tramTen || row?.veTinh || 'â€”')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {filteredNoSp2Rows.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-600">
                                Hiá»ƒn thá»‹ {noSp2Start + 1}-{Math.min(noSp2Start + noSp2PageSize, filteredNoSp2Rows.length)} / {filteredNoSp2Rows.length} cá»•ng
                              </p>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setNoSp2Page((p) => Math.max(1, p - 1))}
                                  disabled={noSp2CurrentPage <= 1}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang trÆ°á»›c
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
                              Chi tiáº¿t S2 theo OLT vÃ  cá»•ng PON
                            </p>
                            <div className="flex w-full sm:w-auto flex-wrap items-center gap-1.5">
                              <select
                                value={oltPonToFilter}
                                onChange={(e) => setOltPonToFilter(e.target.value)}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lá»c theo Tá»• ká»¹ thuáº­t"
                              >
                                <option value="">Táº¥t cáº£ Tá»• KT</option>
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
                                title="Lá»c theo OLT Ä‘á»ƒ xem/xuáº¥t Excel"
                              >
                                <option value="">Táº¥t cáº£ OLT</option>
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
                                title="Sá»‘ cá»•ng hiá»ƒn thá»‹ má»—i trang"
                              >
                                <option value="10">10 cá»•ng/trang</option>
                                <option value="20">20 cá»•ng/trang</option>
                                <option value="50">50 cá»•ng/trang</option>
                                <option value="100">100 cá»•ng/trang</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleExportOltPonExcel}
                                disabled={oltPonExporting}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {oltPonExporting ? 'Äang xuáº¥tâ€¦' : (oltPonFilter ? 'Xuáº¥t Excel theo OLT' : 'Xuáº¥t Excel táº¥t cáº£ OLT')}
                              </button>
                              <button
                                type="button"
                                onClick={refreshOltPonDetailRows}
                                disabled={oltPonLoading}
                                className="w-full sm:w-auto text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {oltPonLoading ? 'Äang táº£iâ€¦' : 'LÃ m má»›i'}
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-2">
                            Má»—i dÃ²ng lÃ  má»™t cá»•ng PON trong cache, cÃ³ sá»‘ lÆ°á»£ng SP2 vÃ  danh sÃ¡ch tÃªn SP2 tÆ°Æ¡ng á»©ng.
                          </p>
                          {oltPonError && (
                            <p className="text-[11px] text-red-600 mb-1">{oltPonError}</p>
                          )}
                          {!oltPonError && filteredOltPonRows.length === 0 && !oltPonLoading && (
                            <p className="text-[11px] text-slate-500">ChÆ°a cÃ³ dá»¯ liá»‡u bÃ¡o cÃ¡o OLT/PON.</p>
                          )}
                          {filteredOltPonRows.length > 0 && (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="min-w-[760px] text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">OLT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Card</th>
                                    <th className="text-left py-1 px-2 font-semibold">Port PON</th>
                                    <th className="text-right py-1 px-2 font-semibold">Sá»‘ SP2</th>
                                    <th className="text-left py-1 pl-2 font-semibold">Danh sÃ¡ch SP2</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pagedOltPonRows.map((row, idx) => (
                                    <tr
                                      key={`${String(row?.cacheKey || '')}-${oltPonStart + idx}`}
                                      className="border-b border-slate-100 last:border-b-0 text-slate-700"
                                    >
                                      <td className="py-1.5 pr-2">
                                        {String(row?.oltTen || row?.thietBiOlt || 'â€”')}
                                      </td>
                                      <td className="py-1.5 px-2">{String(row?.cardTen || row?.cardOlt || 'â€”')}</td>
                                      <td className="py-1.5 px-2">{String(row?.portTen || row?.portOlt || 'â€”')}</td>
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
                                          <span>â€”</span>
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
                                Hiá»ƒn thá»‹ {oltPonStart + 1}-{Math.min(oltPonStart + oltPonPageSize, filteredOltPonRows.length)} / {filteredOltPonRows.length} cá»•ng
                              </p>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setOltPonPage((p) => Math.max(1, p - 1))}
                                  disabled={oltPonCurrentPage <= 1}
                                  className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Trang trÆ°á»›c
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
                              Tá»· lá»‡ cá»•ng PON cÃ³ Ä‘Ãºng 1 SP2 theo Tá»• KT
                            </p>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={ponExportToQl}
                                onChange={(e) => setPonExportToQl(e.target.value)}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700"
                                title="Lá»c theo Tá»• KT Ä‘á»ƒ xuáº¥t Excel"
                              >
                                <option value="">Táº¥t cáº£ Tá»• KT</option>
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
                                {ponExporting ? 'Äang xuáº¥tâ€¦' : (ponExportToQl ? 'Xuáº¥t Excel theo tá»•' : 'Xuáº¥t Excel 1 SP2')}
                              </button>
                              <button
                                type="button"
                                onClick={refreshPonOneSp2Stats}
                                disabled={ponStatsLoading}
                                className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {ponStatsLoading ? 'Äang táº£iâ€¦' : 'LÃ m má»›i'}
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mb-2">
                            CÃ´ng thá»©c: <strong>sá»‘ cá»•ng cÃ³ Ä‘Ãºng 1 SP2 / tá»•ng sá»‘ cá»•ng Ä‘Ã£ cache</strong>.
                          </p>
                          {ponStatsError && (
                            <p className="text-[11px] text-red-600 mb-1">{ponStatsError}</p>
                          )}
                          {!ponStatsError && ponOneSp2Stats.length === 0 && !ponStatsLoading && (
                            <p className="text-[11px] text-slate-500">ChÆ°a cÃ³ dá»¯ liá»‡u thá»‘ng kÃª.</p>
                          )}
                          {ponOneSp2Stats.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">Tá»• KT</th>
                                    <th className="text-right py-1 px-2 font-semibold">1 SP2</th>
                                    <th className="text-right py-1 px-2 font-semibold">Tá»•ng cá»•ng</th>
                                    <th className="text-right py-1 pl-2 font-semibold">Tá»· lá»‡</th>
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
                      ) : activeReportId === 's2_renovation_proposals' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">Äá» xuáº¥t cáº£i táº¡o Spliter cáº¥p 2</p>
                            <button type="button" onClick={refreshS2Proposals} disabled={s2ProposalsLoading} className="text-[11px] px-2 py-1 rounded border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50">
                              {s2ProposalsLoading ? 'Äang táº£iâ€¦' : 'Táº£i láº¡i'}
                            </button>
                          </div>
                          {s2ProposalsError ? <p className="text-[11px] text-red-600 mb-2">{s2ProposalsError}</p> : null}
                          {s2ProposalsLoading && s2Proposals.length === 0 ? (
                            <p className="text-[11px] text-slate-500">Äang táº£i danh sÃ¡ch Ä‘á» xuáº¥tâ€¦</p>
                          ) : s2Proposals.length === 0 ? (
                            <p className="text-[11px] text-slate-500">ChÆ°a cÃ³ Ä‘á» xuáº¥t. Tra cá»©u S2 vÃ  báº¥m Â«Äá» xuáº¥tÂ» cáº¡nh nÃºt Copy.</p>
                          ) : (
                            <div className="overflow-x-auto -mx-1 px-1 max-h-[420px]">
                              <table className="min-w-[960px] text-[11px] w-full">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-600">
                                    <th className="text-left py-1 pr-2 font-semibold">STT</th>
                                    <th className="text-left py-1 px-2 font-semibold">Tên Spliter cấp 2</th>
                                    <th className="text-left py-1 px-2 font-semibold">Địa chỉ</th>
                                    <th className="text-left py-1 px-2 font-semibold">Long</th>
                                    <th className="text-left py-1 px-2 font-semibold">Lat</th>
                                    <th className="text-left py-1 px-2 font-semibold">NV địa bàn</th>
                                    <th className="text-left py-1 pl-2 font-semibold">Nội dung đề xuất</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s2Proposals.map((row, idx) => (
                                    <tr key={row.id || idx} className="border-b border-slate-100 text-slate-700">
                                      <td className="py-1.5 pr-2 align-top">{idx + 1}</td>
                                      <td className="py-1.5 px-2 break-words max-w-[200px] align-top">{row.tenSp2 || '—'}</td>
                                      <td className="py-1.5 px-2 break-words max-w-[160px] align-top">{row.diaChi || '—'}</td>
                                      <td className="py-1.5 px-2 whitespace-nowrap align-top font-mono text-[10px]">
                                        {formatProposalCoord(row.longitude)}
                                      </td>
                                      <td className="py-1.5 px-2 whitespace-nowrap align-top font-mono text-[10px]">
                                        {formatProposalCoord(row.latitude)}
                                      </td>
                                      <td className="py-1.5 px-2 break-words max-w-[120px] align-top">{row.tenNvDiaBan || '—'}</td>
                                      <td className="py-1.5 pl-2 break-words max-w-[240px] align-top">{row.deXuat || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <p className="text-[10px] text-slate-500 mt-2">
                            Long/Lat = GPS lúc bấm Lưu. Địa chỉ từ JWT Authorization.
                          </p>
                        </>
                      ) : activeReportId === 'tb_chuyen_dia_ban' ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <p className="text-[11px] font-semibold text-slate-700">
                              Lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n thuÃª bao
                            </p>
                            <button
                              type="button"
                              onClick={handleExportTbChuyenExcel}
                              disabled={tbExporting || tbChuyenBatches.length === 0}
                              className="text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {tbExporting ? 'Äang xuáº¥tâ€¦' : 'Xuáº¥t Excel'}
                            </button>
                          </div>
                          {tbChuyenBatches.length === 0 ? (
                            tbTransferLoading ? (
                              <p className="text-[11px] text-slate-500">Äang táº£i lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n...</p>
                            ) : (
                              <p className="text-[11px] text-slate-500">
                                ChÆ°a cÃ³ dá»¯ liá»‡u lá»‹ch sá»­ chuyá»ƒn Ä‘á»‹a bÃ n. HÃ£y thá»±c hiá»‡n chuyá»ƒn Ä‘á»‹a bÃ n trong module Tra cá»©u TB trÆ°á»›c.
                              </p>
                            )
                          ) : (
                            <>
                              <p className="text-[10px] text-slate-500 mb-2">
                                ÄÃ£ ghi nháº­n {tbChuyenBatches.reduce((n, b) => n + b.rows.length, 0)} dÃ²ng trong {tbChuyenBatches.length} láº§n thao tÃ¡c.
                              </p>
                              <div className="overflow-x-auto -mx-1 px-1 max-h-[380px]">
                                <table className="min-w-[860px] text-[11px]">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-600">
                                      <th className="text-left py-1 pr-2 font-semibold">STT</th>
                                      <th className="text-left py-1 px-2 font-semibold">Account</th>
                                      <th className="text-left py-1 px-2 font-semibold">TÃªn KH</th>
                                      <th className="text-left py-1 px-2 font-semibold">Äá»‹a chá»‰</th>
                                      <th className="text-left py-1 px-2 font-semibold">Äá»‹a bÃ n cÅ©</th>
                                      <th className="text-left py-1 px-2 font-semibold">Äá»‹a bÃ n má»›i</th>
                                      <th className="text-left py-1 px-2 font-semibold">Thá»i gian chuyá»ƒn</th>
                                      <th className="text-left py-1 pl-2 font-semibold">Thiáº¿t bá»‹ thao tÃ¡c</th>
                                      <th className="text-right py-1 pl-2 font-semibold">Thao tÃ¡c</th>
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
                                            <td className="py-1.5 px-2">{r.account || 'â€”'}</td>
                                            <td className="py-1.5 px-2">{r.tenKH || 'â€”'}</td>
                                            <td className="py-1.5 px-2">{r.diaChi || 'â€”'}</td>
                                            <td className="py-1.5 px-2">{diaBanCu || 'â€”'}</td>
                                            <td className="py-1.5 px-2">{diaBanMoi || 'â€”'}</td>
                                            <td className="py-1.5 px-2">{new Date(batch.thoiGian).toLocaleString('vi-VN')}</td>
                                            <td className="py-1.5 pl-2">{batch.thietBiThaoTac || 'â€”'}</td>
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
                                                {daXacNhan ? 'ÄÃ£ xÃ¡c nháº­n' : (tbConfirmingTransferKey === rowKey ? 'Äang xÃ¡c nháº­nâ€¦' : 'XÃ¡c nháº­n')}
                                              </button>
                                              {!daXacNhan && (
                                                <button
                                                  type="button"
                                                  onClick={() => deleteTbTransferRow(batch.id, ri)}
                                                  disabled={tbDeletingTransferKey === rowKey || tbConfirmingTransferKey === rowKey}
                                                  className="ml-1 text-[10px] px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                                >
                                                  {tbDeletingTransferKey === rowKey ? 'Äang xÃ³aâ€¦' : 'XÃ³a'}
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
                          <p className="text-[11px] font-medium text-slate-700">BÃ¡o cÃ¡o Ä‘ang Ä‘Æ°á»£c xÃ¢y dá»±ng</p>
                          <p className="text-[11px] text-slate-500 mt-1">{activeReport.description}</p>
                        </div>
                      )}
                    </div>
                    )}
                    {!showReportPanel && lastSyncInfo?.lastSyncAt && (
                      <p className="text-[11px] text-slate-500">
                        Äá»“ng bá»™ cá»¥c bá»™ (trÃ¬nh duyá»‡t nÃ y):{' '}
                        {new Date(lastSyncInfo.lastSyncAt).toLocaleString('vi-VN')}
                        {lastSyncInfo.lastSyncTotal != null && ` â€” ${lastSyncInfo.lastSyncTotal} port`}
                        {lastSyncInfo.lastSyncS2Total != null && (
                          <> â€” {lastSyncInfo.lastSyncS2Total} S2 Ä‘Ã£ gom</>
                        )}
                        {lastSyncInfo.lastSyncErrors > 0 && ` â€” ${lastSyncInfo.lastSyncErrors} lá»—i`}
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
                        Chá»‰ tra cá»©u tá»« cache (Supabase + trÃ¬nh duyá»‡t, khÃ´ng gá»i API)
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
                        LuÃ´n gá»i API (bá» qua bá»™ nhá»›)
                      </label>
                    </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form + káº¿t quáº£: Tra cá»©u S2 hoáº·c TB */}
          {!showSettings && !showReportPanel && (activeMainModule === TB_MODULE_SPLITTER ? (
            <>
          {/* Form tra cá»©u - TÃ¬m kiáº¿m thÃ´ng tin S2 */}
          <div className="px-3 py-3 sm:px-8 sm:py-6 shrink-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 border-b-2 border-sky-500 pb-1 mb-3 sm:mb-4">TÃ¬m kiáº¿m thÃ´ng tin S2</h2>
            <form onSubmit={handleTraCuu} className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-8">
                <div className="space-y-0 order-1 sm:order-1">
                  <DropRow label="TTVT" required checked={useTtvt} onCheck={setUseTtvt} value={ttvt} onChange={setTtvt} options={listTtvt} />
                  <DropRow label="Tá»• KT" required checked={useToQL} onCheck={setUseToQL} value={toQL} onChange={setToQL} options={listToQL} />
                  <DropRow label="Tráº¡m BTS" checked={useVeTinh} onCheck={setUseVeTinh} value={veTinh} onChange={setVeTinh} options={listVeTinh} />
                </div>
                <div className="space-y-0 order-2 sm:order-2">
                  <DropRow label="Thiáº¿t bá»‹ OLT" checked={useThietBiOlt} onCheck={setUseThietBiOlt} value={thietBiOlt} onChange={setThietBiOlt} options={listThietBiOlt} optionValue={(item) => { if (typeof item === 'string' || typeof item === 'number') return String(item); const v = item?.THIETBI_ID ?? item?.OLT_ID ?? item?.id ?? item?.value ?? item?.code ?? ''; return v !== undefined && v !== null ? String(v) : ''; }} optionLabel={oltOptionLabel} />
                  <DropRow label="Card OLT" checked={useCardOlt} onCheck={setUseCardOlt} value={cardOlt} onChange={setCardOlt} options={listCardOlt} optionValue={(item) => { if (typeof item === 'string') return item; const keyVal = item?.KEY; const idFromKey = (typeof keyVal === 'string' && keyVal.includes('#')) ? (keyVal.split('#')[1]?.trim() || keyVal) : null; const v = idFromKey ?? item?.CARD_ID ?? item?.THIETBI_ID ?? item?.SLOT_ID ?? item?.PORTVL_ID ?? item?.VITRI ?? item?.TEN_TB ?? item?.id ?? item?.ma ?? item?.value ?? item?.code ?? ''; return (v !== undefined && v !== null) ? String(v) : ''; }} />
                  <div>
                    <DropRow label="Port OLT" checked={usePortOlt} onCheck={setUsePortOlt} value={portOlt} onChange={setPortOlt} options={listPortOlt} optionValue={(item) => { if (typeof item === 'number') return String(item); if (typeof item === 'string') return item; const v = item?.PORTVL_ID ?? item?.VITRI ?? item?.id ?? item?.value ?? ''; return (v !== undefined && v !== null) ? String(v) : ''; }} optionLabel={(item) => { if (typeof item === 'number') return String(item); if (typeof item === 'string') return item; const vitri = item?.VITRI; if (vitri !== undefined && vitri !== null) return String(vitri); return item?.PORTVL_ID != null ? String(item.PORTVL_ID) : (item?.TEN_TB ?? optionLabel(item) ?? ''); }} />
                    {cardOlt && !loadingPortOlt && listPortOlt.length === 0 && <p className="text-xs text-amber-600 mt-0.5 -mb-1">ChÆ°a cÃ³ Port. Kiá»ƒm tra Card Ä‘Ã£ chá»n hoáº·c API.</p>}
                  </div>
                </div>
              </div>
              <div className="pt-1 sm:pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg font-semibold text-white text-xs sm:text-sm bg-sky-600 hover:bg-sky-700 focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-70 disabled:cursor-not-allowed min-h-[40px] sm:min-h-[44px]"
                >
                  {loading ? 'Äang tra cá»©u...' : 'Tra cá»©u'}
                </button>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5 sm:mt-2">
                  Authorization (JWT) cÃ²n háº¡n â†’ tra cá»©u OneBSS trÆ°á»›c. Háº¿t háº¡n hoáº·c khÃ´ng nháº­p â†’ dÃ¹ng cache Supabase (náº¿u Ä‘Ã£ Ä‘á»“ng bá»™). Â«LuÃ´n gá»i APIÂ» bá» qua cache; Â«Chá»‰ tra cá»©u tá»« cacheÂ» khÃ´ng gá»i API.
                </p>
                {serverSyncMeta?.lastSyncInProgress ? (
                  <p className="text-[11px] text-sky-700 mt-1">
                    Äang Ä‘á»“ng bá»™ lÃªn Supabase
                    {serverSyncMeta.lastSyncCompleted != null && serverSyncMeta.lastSyncTotal != null
                      ? `: ${serverSyncMeta.lastSyncCompleted}/${serverSyncMeta.lastSyncTotal} port`
                      : ''}
                    . MÃ¡y khÃ¡c cÃ³ thá»ƒ chá»n danh má»¥c tá»« cache vÃ  tra cá»©u port Ä‘Ã£ lÆ°u â€” khÃ´ng cáº§n Authorization.
                  </p>
                ) : serverSyncMeta?.lastSyncAt ? (
                  <p className={`text-[11px] mt-1 ${(serverSyncMeta.lastSyncTotal ?? 0) > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    Cache chung: Ä‘á»“ng bá»™ lÃºc {new Date(serverSyncMeta.lastSyncAt).toLocaleString('vi-VN')}
                    {serverSyncMeta.lastSyncTotal != null ? ` â€” ${serverSyncMeta.lastSyncTotal} port` : ''}.
                    {(serverSyncMeta.lastSyncTotal ?? 0) === 0 &&
                      ' ChÆ°a cÃ³ port â€” Authorization cÃ³ thá»ƒ sai khi Ä‘á»“ng bá»™; cáº§n lÆ°u token má»›i vÃ  Ä‘á»“ng bá»™ láº¡i.'}
                  </p>
                ) : hasBrowseCatalog(browseSnapshot) ? (
                  <p className="text-[11px] text-sky-700 mt-1">
                    ÄÃ£ cÃ³ danh má»¥c cache trÃªn server. Chá»n Tráº¡m/OLT/Card/Port rá»“i tra cá»©u (khÃ´ng cáº§n Authorization náº¿u port Ä‘Ã£ Ä‘Æ°á»£c Ä‘á»“ng bá»™).
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 mt-1">
                    ChÆ°a cÃ³ cache trÃªn Supabase. Quáº£n trá»‹ cáº§n Â«Äá»“ng bá»™ toÃ n bá»™ S2Â» kÃ¨m mÃ£ ghi cache chung (khÃ´ng chá»‰ Ä‘á»“ng bá»™ trÃªn má»™t trÃ¬nh duyá»‡t).
                  </p>
                )}
              </div>
            </form>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {loadingList && <span className="text-xs text-slate-500">Äang táº£i danh sÃ¡ch...</span>}
              {listError && <span className="text-xs text-red-600">{listError}</span>}
              <button type="button" onClick={loadDanhSach} disabled={loadingList} className="hidden text-xs text-sky-600 hover:underline disabled:opacity-50">
                Táº£i láº¡i danh sÃ¡ch
              </button>
            </div>
          </div>

            {/* Khu vá»±c káº¿t quáº£ - vá»«a mÃ n hÃ¬nh mobile */}
            <div className="mt-2 sm:mt-6 mx-2 sm:mx-8 mb-2 sm:mb-6 rounded-lg sm:rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex-1 min-h-[140px] sm:min-h-[320px] p-3 sm:p-6 flex flex-col overflow-hidden">
              {chuaTraCuu && (
                <p className="text-slate-500 text-center text-xs sm:text-base py-6 sm:py-16 flex-1 flex items-center justify-center">
                  Chá»n cÃ¡c má»¥c vÃ  báº¥m Tra cá»©u Ä‘á»ƒ xem káº¿t quáº£
                </p>
              )}
              {loading && (
                <p className="text-sky-600 font-medium text-xs sm:text-base py-6 sm:py-12 text-center flex-1 flex items-center justify-center">Äang tra cá»©u...</p>
              )}
              {loi && (
                <p className="text-red-600 text-center text-xs sm:text-base max-w-md py-4 sm:py-6">{loi}</p>
              )}
              {ketQua != null && !loi && (
                <div className="w-full overflow-x-auto flex-1 min-h-0 -mx-1 sm:mx-0">
                  <h3 className="text-slate-800 font-bold text-sm sm:text-base mb-2 sm:mb-3 flex flex-wrap items-center gap-2">
                    <span>
                      Káº¿t quáº£ tra cá»©u ({Array.isArray(ketQua.data) ? ketQua.data.length : 0} S2)
                    </span>
                    {ketQua.fromCache === 'server' && (
                      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                        Cache chung (Supabase)
                      </span>
                    )}
                    {ketQua.fromCache === 'local' && (
                      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                        TrÃ¬nh duyá»‡t nÃ y
                      </span>
                    )}
                  </h3>
                  {ketQua.message && <p className="text-slate-600 text-xs sm:text-sm mb-2 sm:mb-3">{ketQua.message}</p>}
                  {Array.isArray(ketQua.data) && ketQua.data.length > 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="grid grid-cols-[1fr_auto] gap-0">
                        <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-2 sm:px-6 sm:py-3 text-white font-semibold text-xs sm:text-sm uppercase tracking-wide min-w-0">
                          Danh sÃ¡ch S2 tÃ¬m tháº¥y
                        </div>
                        <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-2 sm:px-6 sm:py-3 text-white font-semibold text-xs sm:text-sm uppercase tracking-wide text-right shrink-0">
                          HÃ nh Ä‘á»™ng
                        </div>
                      </div>
                      {ketQua.data.map((row, i) => {
                        const tenS2 = row?.TEN_KC ?? row?.KYHIEU ?? row?.ten ?? row?.name ?? '';
                        const copyText = String(tenS2 || '');
                        return (
                          <div key={i} className="grid grid-cols-[1fr_auto] gap-0 border-t border-slate-100 hover:bg-slate-50/50 min-w-0">
                            <div className="px-3 py-2 sm:px-6 sm:py-3 text-slate-800 text-xs sm:text-sm font-medium min-w-0 break-words" title={copyText || undefined}>
                              {copyText || 'â€”'}
                            </div>
                            <div className="px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 flex-wrap">
                              <button
                                type="button"
                                onClick={() => openProposalModal(copyText)}
                                disabled={!copyText}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-medium disabled:opacity-50"
                              >
                                Äá» xuáº¥t
                              </button>
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
                    <p className="text-slate-500 text-center text-xs sm:text-sm py-6 sm:py-8">KhÃ´ng cÃ³ báº£n ghi S2.</p>
                  )}
                </div>
              )}
            </div>
            </>
          ) : (
            <>
              <div className="px-3 py-3 sm:px-8 sm:py-6 shrink-0 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b-2 border-sky-500 pb-1 mb-3 sm:mb-4">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-800 min-w-0 flex-1 leading-snug pr-2">
                    Tra cá»©u thuÃª bao tá»« Excel
                  </h2>
                  {tbUploadGate.status !== 'checking' ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-expanded={tbUploadPanelExpanded}
                        aria-controls="tb-upload-panel-body"
                        onClick={() => setTbUploadPanelExpanded((v) => !v)}
                        title={tbUploadPanelExpanded ? 'Thu gá»n upload' : 'Má»Ÿ upload hoáº·c nháº­p máº­t kháº©u'}
                        aria-label={tbUploadPanelExpanded ? 'Thu gá»n' : 'Má»Ÿ panel upload'}
                        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900 touch-manipulation"
                      >
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 ${tbUploadPanelExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {tbUploadGate.gateEnabled && tbUploadGate.status === 'unlocked' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTbUploadLock();
                          }}
                          title="KhÃ³a láº¡i khu vá»±c upload (trÃªn trÃ¬nh duyá»‡t nÃ y)"
                          aria-label="KhÃ³a upload TB"
                          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-50 hover:text-slate-800 touch-manipulation"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {tbUploadGate.status === 'checking' ? (
                  <p className="text-xs sm:text-sm text-slate-600 -mt-2">Äang kiá»ƒm tra quyá»n upload...</p>
                ) : null}
                {tbUploadPanelExpanded && tbUploadGate.status !== 'checking' ? (
                  <div id="tb-upload-panel-body" className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4 space-y-3">
                  {tbUploadGate.gateEnabled && tbUploadGate.status === 'locked' && (
                    <form onSubmit={submitTbUploadGate} className="space-y-3 max-w-xs py-2 sm:py-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5" htmlFor="tb-upload-gate-password">
                          MÃ£ má»Ÿ khÃ³a
                        </label>
                        <p className="text-[11px] text-slate-500 leading-snug">CÃ¹ng mÃ£ vá»›i CÃ i Ä‘áº·t / BÃ¡o cÃ¡o.</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id="tb-upload-gate-password"
                          type="password"
                          autoComplete="current-password"
                          value={tbUploadGatePassword}
                          onChange={(e) => {
                            setTbUploadGatePassword(e.target.value);
                            setTbUploadGateError('');
                          }}
                          placeholder="MÃ£ má»Ÿ khÃ³a"
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                        />
                        <button
                          type="submit"
                          disabled={tbUploadGateSubmitting || !tbUploadGatePassword.trim()}
                          className="rounded-lg bg-sky-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-sky-700 min-h-[44px] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tbUploadGateSubmitting ? 'Äang kiá»ƒm traâ€¦' : 'XÃ¡c nháº­n'}
                        </button>
                      </div>
                      {tbUploadGateError ? <p className="text-xs text-red-600">{tbUploadGateError}</p> : null}
                    </form>
                  )}
                  {(tbUploadGate.status === 'unlocked' || !tbUploadGate.gateEnabled) && tbUploadGate.status !== 'checking' ? (
                    <>
                      <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                        File cáº§n cÃ³ tiÃªu Ä‘á» cá»™t: <strong>STT</strong>, <strong>Acount</strong>, <strong>TÃªn KH</strong>, <strong>Äá»‹a chá»‰</strong>, <strong>Sá»‘ ÄT</strong>, <strong>OLT</strong>, <strong>SLot</strong>, <strong>PORT</strong>, <strong>NhÃ¢n viÃªn QL</strong>.
                        Báº¯t buá»™c nháº­n diá»‡n Ä‘Æ°á»£c: NhÃ¢n viÃªn QL, OLT, SLOT, PORT.
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
                          {tbUploading ? 'Äang upload...' : 'Upload'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadTbMau}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[40px]"
                        >
                          Táº£i file máº«u
                        </button>
                        <button
                          type="button"
                          onClick={() => loadTbSharedRows()}
                          disabled={tbSharedLoading}
                          className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs sm:text-sm font-medium text-violet-700 hover:bg-violet-100 min-h-[40px] disabled:opacity-50"
                        >
                          {tbSharedLoading ? 'Äang táº£i dá»¯ liá»‡u chungâ€¦' : 'Táº£i dá»¯ liá»‡u chung'}
                        </button>
                        {tbFileName && <span className="text-[11px] text-slate-500 w-full sm:w-auto">File: {tbFileName}</span>}
                        {tbSharedMeta?.uploadedAt && (
                          <span className="text-[11px] text-slate-500 w-full">
                            Dá»¯ liá»‡u chung cáº­p nháº­t: {new Date(tbSharedMeta.uploadedAt).toLocaleString('vi-VN')}
                            {tbSharedMeta.fileName ? ` Â· ${tbSharedMeta.fileName}` : ''}
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
                            /Thiáº¿u|Lá»—i|KhÃ´ng Ä‘á»c|Chá»‰ há»— trá»£|KhÃ´ng cÃ³ dÃ²ng|File khÃ´ng|ChÆ°a cÃ³ thuÃª bao nÃ o Ä‘Æ°á»£c chuyá»ƒn|máº­t kháº©u|má»Ÿ khÃ³a/i.test(tbParseMessage)
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
                <form onSubmit={handleTbTraCuu} className="space-y-3">
                  {tbSharedLoading && tbRows.length === 0 && (
                    <p className="text-[11px] sm:text-xs text-amber-700">
                      Äang náº¡p dá»¯ liá»‡u thuÃª bao dÃ¹ng chung, vui lÃ²ng chá» trong giÃ¢y lÃ¡t...
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                    <div className="space-y-2">
                      <label className="block text-[11px] sm:text-xs font-semibold text-slate-600">NhÃ¢n viÃªn QL</label>
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
                    {tbSharedLoading && tbRows.length === 0 ? 'Äang náº¡p dá»¯ liá»‡u...' : 'Tra cá»©u'}
                  </button>
                  {tbTimKiemLoi && <p className="text-xs text-red-600">{tbTimKiemLoi}</p>}
                </form>
              </div>
              <div className="mt-2 sm:mt-6 mx-2 sm:mx-8 mb-2 sm:mb-6 rounded-lg sm:rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex-1 min-h-[140px] sm:min-h-[280px] p-3 sm:p-6 flex flex-col overflow-hidden">
                {tbKetQua === null && !tbTimKiemLoi && (
                  <p className="text-slate-500 text-center text-xs sm:text-base py-8 flex-1 flex items-center justify-center">
                    Upload file, chá»n bá»™ lá»c vÃ  báº¥m Tra cá»©u Ä‘á»ƒ xem danh sÃ¡ch thuÃª bao.
                  </p>
                )}
                {Array.isArray(tbKetQua) && (
                  <div className="w-full flex-1 min-h-0 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-slate-800 font-bold text-sm sm:text-base">
                        Káº¿t quáº£ tra cá»©u ({tbKetQua.length} thuÃª bao)
                      </h3>
                      <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
                        {tbKetQua.length > 0 && (
                          <select
                            value={String(tbPageSize)}
                            onChange={(e) => setTbPageSize(Number(e.target.value) || 10)}
                            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs sm:text-sm text-slate-700 min-h-[40px]"
                            title="Sá»‘ thuÃª bao hiá»ƒn thá»‹ má»—i trang"
                          >
                            <option value="10">10 thuÃª bao/trang</option>
                            <option value="20">20 thuÃª bao/trang</option>
                            <option value="50">50 thuÃª bao/trang</option>
                            <option value="100">100 thuÃª bao/trang</option>
                          </select>
                        )}
                        {tbKetQua.length > 0 && (
                          <button
                            type="button"
                            onClick={openTbChuyenModal}
                            className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-medium px-3 py-2 min-h-[40px]"
                          >
                            Chuyá»ƒn Ä‘á»‹a bÃ n
                          </button>
                        )}
                      </div>
                    </div>
                    {tbKetQua.length === 0 ? (
                      <p className="text-slate-500 text-center text-xs sm:text-sm py-6">KhÃ´ng cÃ³ thuÃª bao khá»›p bá»™ lá»c.</p>
                    ) : (
                      <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="min-w-[800px] w-full text-[11px] sm:text-xs text-left">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                              <th className="py-2 px-2 font-semibold">STT</th>
                              <th className="py-2 px-2 font-semibold">Account</th>
                              <th className="py-2 px-2 font-semibold">TÃªn KH</th>
                              <th className="py-2 px-2 font-semibold">Äá»‹a chá»‰</th>
                              <th className="py-2 px-2 font-semibold">Sá»‘ ÄT</th>
                              <th className="py-2 px-2 font-semibold">OLT</th>
                              <th className="py-2 px-2 font-semibold">Slot</th>
                              <th className="py-2 px-2 font-semibold">Port</th>
                              <th className="py-2 px-2 font-semibold">NV QL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedTbRows.map((r) => (
                              <tr key={r.id} className="border-b border-slate-100 last:border-0 text-slate-800">
                                <td className="py-1.5 px-2 align-top">{r.stt || 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top font-medium">{r.account || 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top max-w-[140px] break-words">{r.tenKH || 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top max-w-[200px] break-words">{r.diaChi || 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top whitespace-nowrap">{r.soDt || 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top">{r.olt || 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top">{r.slot || 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top">{r.port ?? 'â€”'}</td>
                                <td className="py-1.5 px-2 align-top">{r.nvQL || 'â€”'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-600">
                          Hiá»ƒn thá»‹ {tbStart + 1}-{Math.min(tbStart + tbPageSize, tbResultRows.length)} / {tbResultRows.length} thuÃª bao
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTbPage((p) => Math.max(1, p - 1))}
                            disabled={tbCurrentPage <= 1}
                            className="text-[11px] px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Trang trÆ°á»›c
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
              <h3 id="tb-chuyen-title" className="text-sm font-semibold text-slate-800">Chuyá»ƒn Ä‘á»‹a bÃ n</h3>
              <button
                type="button"
                onClick={() => setTbShowChuyenModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="ÄÃ³ng"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0 space-y-3">
              <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                Chá»n thuÃª bao cáº§n chuyá»ƒn vÃ  <strong>NhÃ¢n viÃªn QL Ä‘Ã­ch</strong> (láº¥y tá»« danh sÃ¡ch trong file Excel Ä‘Ã£ upload).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTbChuyenIds(new Set(tbKetQua.map((r) => r.id)))}
                  className="text-[11px] px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Chá»n táº¥t cáº£
                </button>
                <button
                  type="button"
                  onClick={() => setTbChuyenIds(new Set())}
                  className="text-[11px] px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Bá» chá»n
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
                      <span className="font-medium text-slate-800">{r.account || 'â€”'}</span>
                      <span className="text-slate-500">
                        {r.tenKH ? ` Â· ${r.tenKH}` : ''} Â· {r.nvQL || 'â€”'} Â· Port {r.port ?? 'â€”'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">NhÃ¢n viÃªn QL Ä‘Ã­ch</label>
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
                Há»§y
              </button>
              <button
                type="button"
                onClick={confirmTbChuyenDiaBan}
                className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 text-xs font-medium min-h-[40px]"
              >
                XÃ¡c nháº­n chuyá»ƒn
              </button>
            </div>
          </div>
        </div>
      )}
    {proposalModalOpen && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={closeProposalModal}>
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-md p-4 sm:p-6 border border-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-slate-800 mb-1">Äá» xuáº¥t cáº£i táº¡o S2</h3>
          <p className="text-xs text-slate-600 mb-4 break-words">{proposalTargetS2 || 'â€”'}</p>
          <label className="block text-xs font-semibold text-slate-600 mb-1">TÃªn NV Ä‘á»‹a bÃ n *</label>
          <select
            value={proposalNvDiaBan}
            onChange={(e) => setProposalNvDiaBan(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3 min-h-[40px]"
          >
            <option value="">â€” Chá»n NV Ä‘á»‹a bÃ n â€”</option>
            {nvDiaBanOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Ná»™i dung Ä‘á» xuáº¥t *</label>
          <textarea
            value={proposalText}
            onChange={(e) => setProposalText(e.target.value)}
            rows={4}
            placeholder="MÃ´ táº£ Ä‘á» xuáº¥t cáº£i táº¡oâ€¦"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2 resize-y"
          />
          <p className="text-[10px] text-slate-500 mb-3">
            Äá»‹a chá»‰ ghi nháº­n: {resolveAuthAddressForProposal() || '(chÆ°a cÃ³ trong JWT â€” kiá»ƒm tra Authorization)'}
            . Khi LÆ°u sáº½ láº¥y tá»a Ä‘á»™ GPS hiá»‡n táº¡i.
          </p>
          {proposalError && <p className="text-xs text-red-600 mb-2">{proposalError}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={closeProposalModal}
              disabled={proposalSaving}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Há»§y
            </button>
            <button
              type="button"
              onClick={handleSaveProposal}
              disabled={!proposalCanSave}
              className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {proposalSaving ? 'Äang lÆ°uâ€¦' : 'LÆ°u láº¡i'}
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
