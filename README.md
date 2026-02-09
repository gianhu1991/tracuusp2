# Module tra cứu Spliter cấp 2

Giao diện web tra cứu thông tin Spliter cấp 2 theo **OLT, Slot và Port**, deploy được lên **Vercel**.

## Giao diện

- Tiêu đề: **Module tra cứu Spliter cấp 2**
- Form: Tổ kỹ thuật (dropdown), OLT (dropdown + nút làm mới), Slot, Port, nút **Tra cứu**
- Khu vực kết quả hiển thị bảng sau khi tra cứu

## Chạy local

```bash
npm install
npm run dev
```

Mở http://localhost:3000

## Deploy lên Vercel

1. Đẩy code lên GitHub (hoặc Git khác), kết nối repo với Vercel.
2. Trong Vercel: **Project → Settings → Environment Variables** thêm:
   - **BACKEND_URL** (hoặc TRACUU_BACKEND_URL): URL backend tra cứu (nếu bạn có server chạy Playwright/API).
   - **AUTHORIZATION** (hoặc TRACUU_AUTHORIZATION): Token gửi kèm request (khi token đổi, sửa ở đây).
   - **LIST_API_BASE** hoặc **LIST_API_URL** (tùy chọn): URL hoặc base URL API lấy danh sách TTVT/Tổ QL/Vệ tinh/OLT. Nếu dropdown trống và báo Not found/404, set biến này với đúng đường dẫn API danh sách OneBSS (vd: `https://api-onebss.vnpt.vn/web-ecms/danh_sach`). Ứng dụng cũng thử gọi URL tra cứu với tham số `loai=ttvt` nếu chưa cấu hình.
3. Deploy lại.

Nếu chưa có backend, giao diện vẫn chạy; khi bấm Tra cứu sẽ báo cần cấu hình BACKEND_URL.

## Cấu hình URL và Authorization (backend / CLI)

**Một chỗ để đổi:** sửa file **`config.js`** ở thư mục gốc dự án.

| Mục | Ý nghĩa |
|-----|---------|
| **baseUrl** | URL trang tra cứu (vd: `https://onebss.vnpt.vn/#/ecms/tracuu-splitter-theo-port-olt`) |
| **authorization** | Chuỗi Authorization gửi kèm request (vd: `Bearer eyJhbGci...`). Khi token thay đổi, chỉ cần sửa giá trị này trong `config.js`. |

Nếu chưa có `config.js`, copy từ `config.example.js` rồi điền URL và authorization của bạn.

## Yêu cầu

- Node.js 18+
- Tài khoản đăng nhập OneBSS VNPT (trang yêu cầu đăng nhập)

## Cài đặt

```bash
npm install
npx playwright install chromium
```

## Cách dùng

### 1. Mở trang để đăng nhập (lần đầu hoặc khi hết phiên)

```bash
npm run tracuu -- --mo-trang
```

Trình duyệt sẽ mở trang tra cứu. Bạn đăng nhập OneBSS nếu cần, sau đó nhấn Enter trong terminal để đóng.

### 2. Tra cứu theo Port OLT

```bash
npm run tracuu -- --port 5
```

### 3. Tra cứu kèm tên/ký hiệu hoặc địa chỉ

```bash
npm run tracuu -- --port 5 --ten "SPLITTER-01" --dia-chi "Nho Quan"
```

### 4. Chạy ẩn trình duyệt (headless)

```bash
npm run tracuu -- --port 5 --headless
```

**Lưu ý:** Chế độ headless thường không có sẵn session đăng nhập. Bạn có thể dùng [userDataDir](https://playwright.dev/docs/api/class-browser#browser-new-context) của Playwright để lưu cookie sau khi đăng nhập lần đầu.

## Dùng trong code

```js
import { traCuuSP2, moTrangTraCuu, getConfig } from './src/tracuu-sp2.js';

// URL và authorization lấy từ config.js
const cfg = await getConfig();
console.log('Đang dùng URL:', cfg.baseUrl);

// Cách 1: Tự mở trình duyệt và tra cứu
const danhSach = await traCuuSP2(
  {},
  { portOlt: '5', tenKyHieu: 'SPLITTER', headless: false }
);
console.log(danhSach);

// Cách 2: Mở trang, giữ browser/page để đăng nhập thủ công rồi gọi traCuuSP2
const { browser, page } = await moTrangTraCuu({ headless: false });
// ... đăng nhập trên page ...
const ketQua = await traCuuSP2({ page }, { portOlt: '5' });
await browser.close();
```

## Kết quả trả về

Mảng các object splitter, mỗi object có dạng:

- `tenSplitter`, `stt`, `id`, `kyHieu`, `capSP`, `ngayCapNhat`
- `diaChi`, `dungLuong`, `daDung`, `chuaDung`, `thietBiOLT`, `congOLT`

(Tên cột có thể thay đổi tùy giao diện OneBSS.)

## Ghi chú màu trạng thái Splitter (trên trang)

- **Đỏ:** Splitter đã hết cổng  
- **Cam:** Splitter còn 1 cổng  
- **Vàng:** Splitter còn 2 cổng  
- **Xanh lá:** Splitter còn > 2 cổng  

## Giấy phép

MIT
