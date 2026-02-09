#!/usr/bin/env node
/**
 * CLI tra cứu SP2 - chạy: npm run tracuu -- --port 5
 * Hoặc mở trang để đăng nhập rồi tra cứu: npm run tracuu -- --mo-trang
 */

import { traCuuSP2, moTrangTraCuu } from './tracuu-sp2.js';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const tenIndex = args.indexOf('--ten');
const diaChiIndex = args.indexOf('--dia-chi');
const moTrang = args.includes('--mo-trang');
const headless = args.includes('--headless');

const portOlt = portIndex >= 0 && args[portIndex + 1] ? args[portIndex + 1] : null;
const tenKyHieu = tenIndex >= 0 && args[tenIndex + 1] ? args[tenIndex + 1] : null;
const diaChi = diaChiIndex >= 0 && args[diaChiIndex + 1] ? args[diaChiIndex + 1] : null;

async function main() {
  if (moTrang) {
    console.log('Đang mở trang tra cứu SP2... (Đăng nhập OneBSS nếu cần.)');
    const { browser } = await moTrangTraCuu({ headless });
    console.log('Trình duyệt đã mở. Nhấn Enter trong terminal để đóng.');
    await new Promise((resolve) => process.stdin.once('data', resolve));
    await browser.close();
    return;
  }

  console.log('Đang tra cứu SP2...');
  console.log('Lưu ý: Trang OneBSS yêu cầu đăng nhập. Lần đầu chạy với --mo-trang để đăng nhập thủ công.');
  const ketQua = await traCuuSP2(
    {},
    { portOlt, tenKyHieu, diaChi, headless }
  );
  console.log('Số bản ghi:', ketQua.length);
  if (ketQua.length > 0) {
    console.log(JSON.stringify(ketQua, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
