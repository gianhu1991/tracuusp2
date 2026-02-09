import './globals.css';

export const metadata = {
  title: 'Module tra cứu Spliter cấp 2',
  description: 'Hệ thống tra cứu thông tin Spliter cấp 2 theo OLT, Slot và Port',
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 5 },
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
