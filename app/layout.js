import './globals.css';

export const metadata = {
  title: 'Module tra cứu Spliter cấp 2',
  description: 'Hệ thống tra cứu thông tin Spliter cấp 2 theo OLT, Slot và Port',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
