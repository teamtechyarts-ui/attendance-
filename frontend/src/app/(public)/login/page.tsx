'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/loading-state';
import { Lock, Mail, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { user, session, isLoading: isAuthLoading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && user) {
      if (session?.firstLoginRequired || session?.accessMode === 'FIRST_LOGIN_REQUIRED' || user.firstLoginRequired) {
        router.replace('/change-password');
      } else if (user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN') {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, session, isAuthLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({ email, password });
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
      setIsLoading(false);
    }
  };

  if (user) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center">
        <LoadingState message="Redirecting to workspace..." />
      </div>
    );
  }

  const handleQuickLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img
            src="/images/logo.png"
            alt="TeamsTechyArts"
            className="h-12 w-auto mx-auto object-contain mb-2"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">TeamsTechyArts Workspace</h1>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto">
            Enterprise Employee Attendance & Work Management Portal
          </p>
        </div>

        <Card className="border-neutral-200/80 shadow-md">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your work email and password to access your portal</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium animate-in fade-in">
                  {error}
                </div>
              )}

              <Input
                id="email"
                label="Work Email"
                type="email"
                placeholder="name@company.com"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <div className="space-y-1">
                <div className="w-full space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-neutral-700 tracking-tight">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 p-1 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Link href="/forgot-password" className="text-xs text-neutral-500 hover:text-black transition-colors font-medium">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button type="submit" isLoading={isLoading} className="w-full gap-2 mt-2">
                Sign In <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
          {/* <CardFooter className="flex-col items-start gap-3 bg-neutral-50/50 p-4 rounded-b-lg border-t border-neutral-100">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Super Admin Account:</span>
            <div className="flex flex-wrap gap-2 w-full">
              <button
                type="button"
                onClick={() => handleQuickLogin('teamtechyarts@gmail.com', 'Admin@123456')}
                className="flex-1 py-1.5 px-2.5 rounded border border-neutral-200 bg-white text-[11px] font-semibold text-neutral-800 hover:bg-neutral-100 text-left"
              >
                Super Admin
                <span className="block text-[10px] text-neutral-400 font-normal">teamtechyarts@gmail.com</span>
              </button>
            </div>
          </CardFooter> */}
        </Card>

        <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Attendance-Gated Secure Authentication</span>
        </div>
      </div>
    </div>
  );
}
