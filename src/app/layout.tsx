import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Controle Financeiro Pessoal | PWA',
  description: 'Aplicação Mobile-First de controle financeiro pessoal integrada ao Supabase',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Finanças',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1E1B4B',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] selection:bg-[#1E1B4B] selection:text-white">
        {children}
      </body>
    </html>
  );
}
