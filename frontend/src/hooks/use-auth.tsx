'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthUser, AccessMode, SessionInfo, AttendanceRecord } from '@/types';
import { authApi, attendanceApi } from '@/lib/api';
import { api } from '@/lib/api/client';

interface AuthContextType {
  user: AuthUser | null;
  session: SessionInfo | null;
  accessMode: AccessMode | null;
  isLoading: boolean;
  todayAttendance: AttendanceRecord | null;
  login: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  markAttendanceSuccess: (record: AttendanceRecord) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  const refreshMe = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      if (data && data.user) {
        setUser(data.user);
        setSession(data);
        setAccessMode(data.accessMode);
        if (data.todayAttendance) {
          setTodayAttendance(data.todayAttendance);
        }
        if ((data.firstLoginRequired || data.accessMode === 'FIRST_LOGIN_REQUIRED' || data.user.firstLoginRequired) && pathname !== '/change-password') {
          router.push('/change-password');
        }
      }
    } catch (err: any) {
      // ONLY clear session/token if it is an explicit 401 Unauthorized or 403 Forbidden!
      // A 429 Too Many Requests, 500 Server Error, or network glitch MUST NOT wipe the user session!
      if (err?.status === 401 || err?.statusCode === 401 || err?.status === 403 || err?.statusCode === 403) {
        setUser(null);
        setSession(null);
        setAccessMode(null);
        setTodayAttendance(null);
        api.setToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [pathname, router]);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      refreshMe();
    } else {
      setIsLoading(false);
    }
  }, [refreshMe]);

  const login = async (data: any) => {
    const result = await authApi.login(data);
    api.setToken(result.accessToken);
    setUser(result.session.user);
    setSession(result.session);
    setAccessMode(result.session.accessMode);
    if (result.session.todayAttendance) {
      setTodayAttendance(result.session.todayAttendance);
    }

    if (result.session.firstLoginRequired || result.session.accessMode === 'FIRST_LOGIN_REQUIRED' || result.session.user?.firstLoginRequired) {
      router.push('/change-password');
    } else if (result.session.user.role === 'SUPER_ADMIN' || result.session.user.role === 'ADMIN') {
      router.push('/admin/dashboard');
    } else {
      router.push('/dashboard');
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      api.setToken(null);
      setUser(null);
      setSession(null);
      setAccessMode(null);
      setTodayAttendance(null);
      router.push('/login');
    }
  };

  const markAttendanceSuccess = (record: AttendanceRecord) => {
    setTodayAttendance(record);
    setAccessMode('NORMAL');
    if (session) {
      setSession({
        ...session,
        accessMode: 'NORMAL',
        attendanceRequired: false,
        restrictedUntil: null,
        todayAttendance: record,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessMode,
        isLoading,
        todayAttendance,
        login,
        logout,
        refreshMe,
        markAttendanceSuccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
