'use client';

import { useState, useEffect } from 'react';

const PLACEHOLDER = '-- Chọn --';
const PORT_OLT_OPTIONS = Array.from({ length: 33 }, (_, i) => i);

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

  const [listTtvt, setListTtvt] = useState([]);
  const [listToQL, setListToQL] = useState([]);
  const [listVeTinh, setListVeTinh] = useState([]);
  const [listCardOlt, setListCardOlt] = useState([]);
  const [listThietBiOlt, setListThietBiOlt] = useState([]);
  const [listPortOlt, setListPortOlt] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');

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
    // Tổ QL: donviId; Vệ tinh: DONVI_ID; OLT: THIETBI_ID; Card/Port OLT: PORTVL_ID hoặc VITRI (để luôn có value chọn được)
    const v = item?.donviId ?? item?.DONVI_ID ?? item?.THIETBI_ID ?? item?.PORTVL_ID ?? item?.VITRI ?? item?.OLT_ID ?? item?.id ?? item?.ma ?? item?.value ?? item?.code ?? '';
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
    if (!auth?.trim()) {
      setListError('Chưa có Authorization. Vào Cài đặt, nhập mật khẩu và thêm token.');
      return;
    }
    setLoadingList(true);
    setListError('');
    const urlTtvt = '/api/danh-sach?loai=ttvt';
    const urlToQL = '/api/danh-sach?loai=to_ky_thuat';
    LOG('loadDanhSach request', { urlTtvt, urlToQL, hasAuth: !!auth?.trim() });
    try {
      const headers = { Authorization: auth.trim() };
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
      if (resToQL.ok) setListToQL(normaliseList(dataToQL));
      else setListToQL([]);
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
    if (authorization?.trim()) loadDanhSach();
    else {
      setListTtvt([]);
      setListToQL([]);
      setListVeTinh([]);
      setListCardOlt([]);
      setListThietBiOlt([]);
      setListPortOlt([]);
    }
  }, [authorization]);

  useEffect(() => {
    if (!toQL || !authorization?.trim()) {
      setListVeTinh([]);
      setVeTinh('');
      setCardOlt('');
      setThietBiOlt('');
      return;
    }
    setVeTinh('');
    setCardOlt('');
    setThietBiOlt('');
    const auth = localStorage.getItem(STORAGE_AUTH);
    if (!auth?.trim()) return;
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
          setListError(data?.message || data?.error || `Không tải được danh sách Vệ tinh (${status}). Kiểm tra Authorization hoặc thử tổ QL khác.`);
          setListVeTinh([]);
          return;
        }
        if (data?.message && !Array.isArray(data) && !data?.data) {
          setListError(data.message || 'Không có dữ liệu Vệ tinh.');
          setListVeTinh([]);
          return;
        }
        setListVeTinh(normaliseList(data));
      })
      .catch((e) => { LOG('VeTinh error', e); setListError(e.message || 'Lỗi tải danh sách Vệ tinh.'); setListVeTinh([]); });
  }, [toQL, authorization]);

  // Chọn Vệ tinh → chỉ load danh sách Thiết bị OLT
  useEffect(() => {
    if (!veTinh || !authorization?.trim()) {
      setListThietBiOlt([]);
      setThietBiOlt('');
      setListCardOlt([]);
      setCardOlt('');
      return;
    }
    setThietBiOlt('');
    setListCardOlt([]);
    setCardOlt('');
    const auth = localStorage.getItem(STORAGE_AUTH);
    if (!auth?.trim()) return;
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
    if (!thietBiOlt || !authorization?.trim()) {
      setListCardOlt([]);
      setCardOlt('');
      return;
    }
    setCardOlt('');
    const auth = localStorage.getItem(STORAGE_AUTH);
    if (!auth?.trim()) return;
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

  // Chọn Card OLT → load danh sách Port OLT (body { id: cardOlt })
  useEffect(() => {
    if (!cardOlt || !authorization?.trim()) {
      setListPortOlt([]);
      setPortOlt('');
      return;
    }
    setPortOlt('');
    const auth = localStorage.getItem(STORAGE_AUTH);
    if (!auth?.trim()) return;
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
      .catch((e) => { LOG('Port OLT error', e); setListError(e.message || 'Lỗi tải Port OLT.'); setListPortOlt([]); });
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

  const handleTraCuu = async (e) => {
    e.preventDefault();
    setLoi(null);
    setKetQua(null);
    setLoading(true);
    if (!authorization?.trim()) {
      setLoi('Vui lòng nhập Authorization trong Cài đặt rồi thử lại.');
      setLoading(false);
      return;
    }
    if (!ttvt?.trim() && useTtvt) {
      setLoi('Vui lòng chọn TTVT.');
      setLoading(false);
      return;
    }
    if (!toQL?.trim() && useToQL) {
      setLoi('Vui lòng chọn Tổ QL.');
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
      const headers = { 'Content-Type': 'application/json', Authorization: authorization.trim() };
      const res = await fetch('/api/tracuu', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      LOG('Tra cứu', 'Response', { status: res.status, ok: res.ok, data });
      if (!res.ok) {
        setLoi(data.message || data.error || 'Có lỗi khi tra cứu.');
        return;
      }
      const list = Array.isArray(data) ? data : (data?.data ?? data?.list ?? data?.result ?? []);
      const message = data?.message || (list.length === 0 ? 'Không có bản ghi nào. Thử chọn đủ Tổ QL, Vệ tinh, Thiết bị OLT, Port OLT và kiểm tra Authorization.' : null);
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
      <div className="flex items-center gap-2 py-1.5">
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider shrink-0 min-w-[100px] sm:min-w-[90px]">{label}{required && '*'}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
        >
          <option value="">{PLACEHOLDER}</option>
          {(options || []).map((item, i) => (
            <option key={i} value={ov ? ov(item) : optionValue(item)}>{ol ? ol(item) : optionLabel(item)}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-r from-indigo-50/80 via-slate-50 to-violet-50/80 py-4 sm:py-6 px-3 sm:px-4 lg:px-6">
      <div className="w-full max-w-[1600px] mx-auto min-h-[calc(100vh-2rem)] flex flex-col">
        {/* Card chính - dài full chiều cao có thể */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 overflow-hidden flex-1 flex flex-col min-h-[85vh] sm:min-h-[80vh]">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 sm:px-8 py-5 sm:py-6 shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  Module tra cứu Spliter cấp 2
                </h1>
                <p className="text-indigo-100 text-xs sm:text-sm mt-1">
                  Hệ thống tra cứu thông tin Spliter cấp 2 theo OLT, Slot và Port
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-sm border border-white/40 min-h-[44px] touch-manipulation"
                aria-label={showSettings ? 'Ẩn cài đặt' : 'Cài đặt Authorization'}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span>{showSettings ? 'Ẩn cài đặt' : 'Cài đặt / Đổi Authorization'}</span>
                <svg className={`w-4 h-4 shrink-0 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Cài đặt Authorization - bảo vệ bằng mật khẩu */}
          {showSettings && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 sm:px-8 py-4 shrink-0">
              {!authUnlocked ? (
                <form onSubmit={handleUnlockAuth} className="space-y-3 max-w-xs">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nhập mật khẩu để xem / đổi Authorization</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={authPasswordInput}
                      onChange={(e) => { setAuthPasswordInput(e.target.value); setAuthPasswordError(''); }}
                      placeholder="Mật khẩu"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 placeholder-slate-400 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                      autoComplete="current-password"
                    />
                    <button type="submit" className="rounded-lg bg-indigo-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 min-h-[44px]">
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-800 placeholder-slate-400 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                  />
                  <p className="text-xs text-slate-500 mt-1">API mặc định: api-onebss.vnpt.vn. Khi token đổi, sửa ở đây.</p>
                </div>
              )}
            </div>
          )}

          {/* Form tra cứu - Tìm kiếm thông tin Splitter */}
          <div className="px-4 sm:px-8 py-4 sm:py-6 shrink-0">
            <h2 className="text-base font-semibold text-slate-800 border-b-2 border-indigo-500 pb-1.5 mb-4">Tìm kiếm thông tin Splitter</h2>
            <form onSubmit={handleTraCuu} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-0">
                  <DropRow label="TTVT" required checked={useTtvt} onCheck={setUseTtvt} value={ttvt} onChange={setTtvt} options={listTtvt} />
                  <DropRow label="Vệ tinh" checked={useVeTinh} onCheck={setUseVeTinh} value={veTinh} onChange={setVeTinh} options={listVeTinh} />
                  <DropRow label="Card OLT" checked={useCardOlt} onCheck={setUseCardOlt} value={cardOlt} onChange={setCardOlt} options={listCardOlt} />
                </div>
                <div className="space-y-0">
                  <DropRow label="Tổ QL" required checked={useToQL} onCheck={setUseToQL} value={toQL} onChange={setToQL} options={listToQL} />
                  <DropRow label="Thiết bị OLT" checked={useThietBiOlt} onCheck={setUseThietBiOlt} value={thietBiOlt} onChange={setThietBiOlt} options={listThietBiOlt} />
                  <DropRow label="Port OLT" checked={usePortOlt} onCheck={setUsePortOlt} value={portOlt} onChange={setPortOlt} options={listPortOlt.length > 0 ? listPortOlt : PORT_OLT_OPTIONS} optionValue={(v) => typeof v === 'number' ? String(v) : optionValue(v)} optionLabel={(v) => typeof v === 'number' ? String(v) : optionLabel(v)} />
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
                >
                  {loading ? 'Đang tra cứu...' : 'Tra cứu'}
                </button>
                <p className="text-xs text-slate-500 mt-2">Dữ liệu dropdown lấy từ API. Cần nhập Authorization trong Cài đặt. Nếu không tải được danh sách, liên hệ quản trị.</p>
              </div>
            </form>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {loadingList && <span className="text-xs text-slate-500">Đang tải danh sách...</span>}
              {listError && <span className="text-xs text-red-600">{listError}</span>}
              {authorization?.trim() && (
                <button type="button" onClick={loadDanhSach} disabled={loadingList} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                  Tải lại danh sách
                </button>
              )}
            </div>
          </div>

            {/* Khu vực kết quả - dài ra chiếm phần còn lại */}
            <div className="mt-4 sm:mt-6 mx-4 sm:mx-8 mb-4 sm:mb-6 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex-1 min-h-[280px] sm:min-h-[320px] p-4 sm:p-6 flex flex-col">
              {chuaTraCuu && (
                <p className="text-slate-500 text-center text-sm sm:text-base py-12 sm:py-16 flex-1 flex items-center justify-center">
                  Chọn các mục và bấm Tra cứu để xem kết quả
                </p>
              )}
              {loading && (
                <p className="text-indigo-600 font-medium text-sm sm:text-base py-12 text-center flex-1 flex items-center justify-center">Đang tra cứu...</p>
              )}
              {loi && (
                <p className="text-red-600 text-center text-sm sm:text-base max-w-md py-6">{loi}</p>
              )}
              {ketQua != null && !loi && (
                <div className="w-full overflow-x-auto flex-1 min-h-0 -mx-2 sm:mx-0">
                  {ketQua.message && <p className="text-slate-600 text-sm mb-3">{ketQua.message}</p>}
                  {Array.isArray(ketQua.data) && ketQua.data.length > 0 ? (
                    <table className="w-full text-xs sm:text-sm text-left text-slate-700 border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <thead className="bg-slate-100 text-slate-700 font-semibold">
                        <tr>
                          {Object.keys(ketQua.data[0]).map((k) => (
                            <th key={k} className="px-2 sm:px-4 py-2 sm:py-3 border-b border-slate-200 whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ketQua.data.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-2 sm:px-4 py-2 sm:py-3">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-slate-500 text-center text-sm py-8">Không có bản ghi nào.</p>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>
    </main>
  );
}
