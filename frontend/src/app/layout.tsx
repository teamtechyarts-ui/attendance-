import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';
import { NotificationsProvider } from '@/hooks/use-notifications';
import { TaskTimerProvider } from '@/hooks/use-task-timer';
import { CollaborationProvider } from '@/context/collaboration-context';
import { CallOverlay } from '@/components/collaboration/call-overlay';
import { MeetingOverlay } from '@/components/collaboration/meeting-overlay';
import { IncomingMeetingPrompt } from '@/components/collaboration/incoming-meeting-prompt';
import { TopNav } from '@/components/layout/top-nav';
import { AttendanceBanner } from '@/components/attendance/attendance-banner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Teams TechyArts - Employee Work & Attendance Management System',
  description: 'Enterprise Work Management System with Attendance-Gated Access, Task Timers, Leave, and Live Activity Monitoring.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
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
          <NotificationsProvider>
            <TaskTimerProvider>
              <CollaborationProvider>
                <TopNav />
                <AttendanceBanner />
                <main className="flex-1 w-full max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>
                <CallOverlay />
                <MeetingOverlay />
                <IncomingMeetingPrompt />
              </CollaborationProvider>
            </TaskTimerProvider>
          </NotificationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

