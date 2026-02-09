'use client';

import { useState, useEffect } from 'react';

const PLACEHOLDER = '-- Chọn --';

/** TTVT mặc định theo OneBSS (trang tra cứu splitter theo port OLT). */
const TTVT_MAC_DINH = 'Trung tâm viễn thông Nho Quan';
const STORAGE_AUTH = 'tracuu_sp2_authorization';
const STORAGE_AUTH_UNLOCKED = 'tracuu_sp2_auth_unlocked';
const AUTH_PASSWORD = '1234';

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
  const [authUnlocked, setAuthUnlocked] = useState(false);
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authPasswordError, setAuthPasswordError] = useState('');
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
  const [showCopyToast, setShowCopyToast] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthorization(localStorage.getItem(STORAGE_AUTH) || '');
      setAuthUnlocked(sessionStorage.getItem(STORAGE_AUTH_UNLOCKED) === '1');
    }
  }, []);

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
        if (!ok) {
          setListError(data?.message || data?.error || `Không tải được danh sách Trạm BTS (${status}). Kiểm tra Authorization hoặc thử tổ KT khác.`);
          setListVeTinh([]);
          return;
        }
        if (data?.message && !Array.isArray(data) && !data?.data) {
          setListError(data.message || 'Không có dữ liệu Trạm BTS.');
          setListVeTinh([]);
          return;
        }
        setListVeTinh(normaliseList(data));
      })
      .catch((e) => { LOG('VeTinh error', e); setListError(e.message || 'Lỗi tải danh sách Trạm BTS.'); setListVeTinh([]); });
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
        if (!ok && data?.message) setListError(data.message || 'Không tải được danh sách Thiết bị OLT.');
        else if (ok && listOlt.length === 0) setListError('Không có thiết bị OLT cho vệ tinh này.');
        if (data?.message && !Array.isArray(data) && !data?.data) { setListThietBiOlt([]); } else { setListThietBiOlt(listOlt); }
      })
      .catch((e) => { LOG('OLT error', e); setListError(e.message || 'Lỗi tải OLT.'); setListThietBiOlt([]); });
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
        if (!ok && data?.message) setListError(data.message || 'Không tải được danh sách Card OLT.');
        else if (ok && list.length === 0) setListError('Không có Card OLT cho thiết bị này.');
        if (data?.message && !Array.isArray(data) && !data?.data) { setListCardOlt([]); } else { setListCardOlt(list); }
      })
      .catch((e) => { LOG('Card OLT error', e); setListError(e.message || 'Lỗi tải Card OLT.'); setListCardOlt([]); });
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
        if (!ok && data?.message) setListError(data.message || 'Không tải được danh sách Port OLT.');
        if (data?.message && !Array.isArray(data) && !data?.data) { setListPortOlt([]); } else { setListPortOlt(list); }
      })
      .catch((e) => { LOG('Port OLT error', e); setListError(e.message || 'Lỗi tải Port OLT.'); setListPortOlt([]); })
      .finally(() => setLoadingPortOlt(false));
  }, [cardOlt, authorization]);

  const handleUnlockAuth = (e) => {
    e.preventDefault();
    setAuthPasswordError('');
    if (authPasswordInput === AUTH_PASSWORD) {
      setAuthUnlocked(true);
      if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_AUTH_UNLOCKED, '1');
      setAuthPasswordInput('');
    } else {
      setAuthPasswordError('Mật khẩu không đúng.');
    }
  };

  const handleLockAuth = () => {
    setAuthUnlocked(false);
    if (typeof window !== 'undefined') sessionStorage.removeItem(STORAGE_AUTH_UNLOCKED);
  };

  const saveAuth = (value) => {
    setAuthorization(value);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_AUTH, value);
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
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: (authorization && authorization.trim()) || '' };
      const res = await fetch('/api/tracuu', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      LOG('Tra cứu', 'Response', { status: res.status, ok: res.ok, data });
      if (!res.ok) {
        setLoi(data.message || data.error || 'Có lỗi khi tra cứu.');
        return;
      }
      const list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
      const message = data?.message || (list.length === 0 ? 'Không có bản ghi nào. Thử chọn đủ Tổ KT, Trạm BTS, Thiết bị OLT, Port OLT và kiểm tra Authorization.' : null);
      setKetQua({ data: Array.isArray(list) ? list : [], message });
    } catch (err) {
      LOG('Tra cứu', 'Lỗi', err);
      setLoi(err.message || 'Lỗi kết nối.');
    } finally {
      setLoading(false);
    }
  };

  const chuaTraCuu = !ketQua && !loi && !loading;

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
      <div className="w-full max-w-[1600px] mx-auto min-h-0 flex flex-col sm:min-h-[calc(100vh-2rem)]">
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
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="shrink-0 inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-xs sm:text-sm border border-white/40 min-h-[36px] sm:min-h-[44px] touch-manipulation"
                aria-label={showSettings ? 'Ẩn cài đặt' : 'Cài đặt Authorization'}
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span>{showSettings ? 'Ẩn cài đặt' : 'Cài đặt'}</span>
                <span className="hidden sm:inline">{showSettings ? '' : ' / Đổi Authorization'}</span>
                <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Cài đặt Authorization - bảo vệ bằng mật khẩu */}
          {showSettings && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-3 sm:px-8 py-3 sm:py-4 shrink-0">
              {!authUnlocked ? (
                <form onSubmit={handleUnlockAuth} className="space-y-3 max-w-xs">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nhập mật khẩu để xem / đổi Authorization</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={authPasswordInput}
                      onChange={(e) => { setAuthPasswordInput(e.target.value); setAuthPasswordError(''); }}
                      placeholder="Mật khẩu"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                      autoComplete="current-password"
                    />
                    <button type="submit" className="rounded-lg bg-sky-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-sky-700 min-h-[44px]">
                      Mở khóa
                    </button>
                  </div>
                  {authPasswordError && <p className="text-xs text-red-600">{authPasswordError}</p>}
                </form>
              ) : (
                <div>
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
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1.5 sm:mt-2">Dữ liệu lấy từ API. Nếu quản trị đã <strong>Lưu token lên server</strong>, mọi người dùng được. Không tải được: nhập token trong Cài đặt hoặc nhờ quản trị lưu token.</p>
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
                  <h3 className="text-slate-800 font-bold text-sm sm:text-base mb-2 sm:mb-3">
                    Kết quả tra cứu ({Array.isArray(ketQua.data) ? ketQua.data.length : 0} Spliter cấp 2)
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
                            <div className="px-3 py-2 sm:px-6 sm:py-3 text-slate-800 text-xs sm:text-sm font-medium min-w-0 truncate sm:truncate" title={copyText || undefined}>
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
