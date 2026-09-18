import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { TopNav } from '@/components/layout/top-nav';
import { AttendanceBanner } from '@/components/attendance/attendance-banner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Teams TechyArts - Employee Work & Attendance Management System',
  description: 'Enterprise Work Management System with Attendance-Gated Access, Task Timers, Leave, and Live Activity Monitoring.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-full flex flex-col bg-[#FBFBFA] text-neutral-900`}>
        <AuthProvider>
          <TopNav />
          <AttendanceBanner />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
