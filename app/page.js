'use client';

import { useState } from 'react';

const PLACEHOLDER_TONG = '-- Chọn Tổ kỹ thuật --';
const PLACEHOLDER_OLT = '-- Chọn OLT --';

export default function TraCuuSP2Page() {
  const [toKyThuat, setToKyThuat] = useState('');
  const [olt, setOlt] = useState('');
  const [slot, setSlot] = useState('');
  const [port, setPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [ketQua, setKetQua] = useState(null);
  const [loi, setLoi] = useState(null);

  const handleTraCuu = async (e) => {
    e.preventDefault();
    setLoi(null);
    setKetQua(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tracuu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleLamMoiOlt = () => {
    setOlt('');
    // Có thể gọi API lấy danh sách OLT mới tùy backend
  };

  const chuaTraCuu = !ketQua && !loi && !loading;

  return (
    <main className="min-h-screen bg-gradient-subtle py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Card trắng bo góc */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Tiêu đề */}
          <div className="pt-8 pb-2 px-6 sm:px-8">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Module tra cứu Spliter cấp 2
            </h1>
            <p className="text-gray-500 text-sm sm:text-base mt-1">
              Hệ thống tra cứu thông tin Spliter cấp 2 theo OLT, Slot và Port
            </p>
          </div>

          {/* Khu vực nhập liệu */}
          <div className="px-6 sm:px-8 pb-6">
            <form onSubmit={handleTraCuu} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Tổ kỹ thuật
                  </label>
                  <select
                    value={toKyThuat}
                    onChange={(e) => setToKyThuat(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">{PLACEHOLDER_TONG}</option>
                    <option value="to1">Tổ Kỹ thuật 1</option>
                    <option value="to2">Tổ Kỹ thuật 2</option>
                    <option value="to3">Tổ Kỹ thuật Địa bàn Nho Quan</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                      OLT
                    </label>
                    <select
                      value={olt}
                      onChange={(e) => setOlt(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">{PLACEHOLDER_OLT}</option>
                      <option value="olt1">OLT Y Na 1</option>
                      <option value="olt2">OLT Nho Quan 1</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleLamMoiOlt}
                    className="rounded-lg bg-indigo-500 text-white p-2.5 hover:bg-indigo-600 focus:ring-2 focus:ring-indigo-300 shrink-0"
                    title="Làm mới OLT"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Slot
                  </label>
                  <input
                    type="text"
                    value={slot}
                    onChange={(e) => setSlot(e.target.value)}
                    placeholder="Nhập Slot (ví dụ: 3)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Port
                  </label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="Nhập Port (ví dụ: 0)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="sm:flex sm:justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold text-white uppercase tracking-wide bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Đang tra cứu...' : 'Tra cứu'}
                  </button>
                </div>
              </div>
            </form>

            {/* Khu vực hiển thị kết quả */}
            <div className="mt-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 min-h-[200px] p-6 flex flex-col items-center justify-center">
              {chuaTraCuu && (
                <p className="text-gray-500 text-center">
                  Nhập thông tin OLT, Slot và Port để tra cứu
                </p>
              )}
              {loading && (
                <p className="text-indigo-600 font-medium">Đang tra cứu...</p>
              )}
              {loi && (
                <p className="text-red-600 text-center max-w-md">{loi}</p>
              )}
              {ketQua != null && !loi && (
                <div className="w-full overflow-x-auto">
                  {ketQua.message && <p className="text-gray-600 text-center mb-2">{ketQua.message}</p>}
                  {Array.isArray(ketQua.data) && ketQua.data.length > 0 ? (
                    <table className="w-full text-sm text-left text-gray-700 border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-indigo-50 text-gray-700 uppercase">
                        <tr>
                          {Object.keys(ketQua.data[0]).map((k) => (
                            <th key={k} className="px-4 py-2 font-semibold">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ketQua.data.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-4 py-2">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-500 text-center">Không có bản ghi nào.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
