'use client';

import { useState, useEffect } from 'react';

const PLACEHOLDER_TONG = '-- Chọn Tổ kỹ thuật --';
const PLACEHOLDER_OLT = '-- Chọn OLT --';

const STORAGE_AUTH = 'tracuu_sp2_authorization';

export default function TraCuuSP2Page() {
  const [toKyThuat, setToKyThuat] = useState('');
  const [olt, setOlt] = useState('');
  const [slot, setSlot] = useState('');
  const [port, setPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [ketQua, setKetQua] = useState(null);
  const [loi, setLoi] = useState(null);

  const [authorization, setAuthorization] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthorization(localStorage.getItem(STORAGE_AUTH) || '');
    }
  }, []);

  const saveAuth = (value) => {
    setAuthorization(value);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_AUTH, value);
  };

  const handleTraCuu = async (e) => {
    e.preventDefault();
    setLoi(null);
    setKetQua(null);
    setLoading(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authorization.trim()) headers['Authorization'] = authorization.trim();
      const res = await fetch('/api/tracuu', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          toKyThuat: toKyThuat || undefined,
          olt: olt || undefined,
          slot: slot || undefined,
          port: port || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoi(data.message || data.error || 'Có lỗi khi tra cứu.');
        return;
      }
      setKetQua(Array.isArray(data) ? { data: data } : { data: data.data || [], message: data.message });
    } catch (err) {
      setLoi(err.message || 'Lỗi kết nối.');
    } finally {
      setLoading(false);
    }
  };

  const handleLamMoiOlt = () => setOlt('');
  const chuaTraCuu = !ketQua && !loi && !loading;

  return (
    <main className="min-h-screen bg-gradient-to-r from-indigo-50/80 via-slate-50 to-violet-50/80 py-4 sm:py-6 px-3 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto min-h-[calc(100vh-2rem)] flex flex-col">
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

          {/* Cài đặt Authorization - chỉ cần đổi token */}
          {showSettings && (
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 sm:px-8 py-4 shrink-0">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Authorization (Bearer token)</label>
                <input
                  type="password"
                  value={authorization}
                  onChange={(e) => saveAuth(e.target.value)}
                  placeholder="Bearer eyJhbGci... hoặc token của bạn"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-800 placeholder-slate-400 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                />
                <p className="text-xs text-slate-500 mt-1">API mặc định: api-onebss.vnpt.vn. Khi token đổi, sửa ở đây.</p>
              </div>
            </div>
          )}

          {/* Form tra cứu - mobile: xếp dọc, desktop: hàng ngang */}
          <div className="px-4 sm:px-8 py-4 sm:py-6 shrink-0">
            <form onSubmit={handleTraCuu} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-4 items-stretch sm:items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Tổ kỹ thuật</label>
                  <select
                    value={toKyThuat}
                    onChange={(e) => setToKyThuat(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-700 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] touch-manipulation"
                  >
                    <option value="">{PLACEHOLDER_TONG}</option>
                    <option value="to1">Tổ Kỹ thuật 1</option>
                    <option value="to2">Tổ Kỹ thuật 2</option>
                    <option value="to3">Tổ Kỹ thuật Địa bàn Nho Quan</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">OLT</label>
                    <select
                      value={olt}
                      onChange={(e) => setOlt(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-700 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] touch-manipulation"
                    >
                      <option value="">{PLACEHOLDER_OLT}</option>
                      <option value="olt1">OLT Y Na 1</option>
                      <option value="olt2">OLT Nho Quan 1</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleLamMoiOlt}
                    className="rounded-lg bg-indigo-500 text-white p-3 sm:p-2.5 hover:bg-indigo-600 focus:ring-2 focus:ring-indigo-300 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                    title="Làm mới OLT"
                    aria-label="Làm mới OLT"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Slot</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                    placeholder="Ví dụ: 3"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-700 placeholder-slate-400 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] touch-manipulation"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Port</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="Ví dụ: 0"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 sm:py-2.5 text-slate-700 placeholder-slate-400 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] touch-manipulation"
                  />
                </div>
                <div className="sm:flex sm:justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-lg font-semibold text-white text-base sm:text-sm bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed min-h-[48px] touch-manipulation"
                  >
                    {loading ? 'Đang tra cứu...' : 'Tra cứu'}
                  </button>
                </div>
              </div>
            </form>
          </div>

            {/* Khu vực kết quả - dài ra chiếm phần còn lại */}
            <div className="mt-4 sm:mt-6 mx-4 sm:mx-8 mb-4 sm:mb-6 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex-1 min-h-[280px] sm:min-h-[320px] p-4 sm:p-6 flex flex-col">
              {chuaTraCuu && (
                <p className="text-slate-500 text-center text-sm sm:text-base py-12 sm:py-16 flex-1 flex items-center justify-center">
                  Nhập thông tin OLT, Slot và Port để tra cứu
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
