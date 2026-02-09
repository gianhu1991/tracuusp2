#!/usr/bin/env node
/**
 * Script push code lên GitHub dùng GITHUB_TOKEN.
 * Token lấy từ .env.local (dòng GITHUB_TOKEN=xxx) hoặc biến môi trường GITHUB_TOKEN.
 *
 * Cách dùng:
 * 1. Tạo file .env.local ở thư mục gốc dự án (đã có trong .gitignore).
 * 2. Thêm dòng: GITHUB_TOKEN=ghp_xxxxxxxx (thay bằng Personal Access Token của bạn).
 * 3. Chạy: node scripts/push.js
 *
 * Tạo token: GitHub → Settings → Developer settings → Personal access tokens → Generate new token (quyền repo).
 */

const { readFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env.local');

let token = process.env.GITHUB_TOKEN;

if (!token && existsSync(envPath)) {
  try {
    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/GITHUB_TOKEN\s*=\s*(.+)/);
    if (match) token = match[1].trim().replace(/^["']|["']$/g, '');
  } catch (e) {
    console.error('Không đọc được .env.local:', e.message);
  }
}

if (!token) {
  console.error('Chưa có GITHUB_TOKEN.');
  console.error('Cách 1: Tạo file .env.local với nội dung: GITHUB_TOKEN=ghp_xxxx');
  console.error('Cách 2: Chạy: set GITHUB_TOKEN=ghp_xxxx (Windows) rồi chạy lại script.');
  process.exit(1);
}

const remoteWithToken = `https://${token}@github.com/gianhu1991/tracuusp2.git`;
const remoteClean = 'https://github.com/gianhu1991/tracuusp2.git';

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

try {
  run('git remote set-url origin ' + remoteWithToken);
  run('git push origin main');
  run('git remote set-url origin ' + remoteClean);
  console.log('Push xong.');
} catch (e) {
  run('git remote set-url origin ' + remoteClean);
  process.exit(e.status || 1);
}
