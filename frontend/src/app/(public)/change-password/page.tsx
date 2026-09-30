'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { authApi } from '@/lib/api';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { KeyRound, ShieldCheck, CheckCircle2, Lock, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, session, refreshMe, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Requirements checks
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && passwordsMatch && currentPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passwordsMatch) {
      setError('New passwords do not match');
      return;
    }

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumber) {
      setError('Password does not meet all security requirements');
      return;
    }

    setIsLoading(true);

    try {
      const res: any = await authApi.changePassword({
        currentPassword,
        newPassword,
      });

      if (res?.accessToken) {
        api.setToken(res.accessToken);
      }

      setSuccess(true);
      await refreshMe();

      setTimeout(() => {
        if (user?.role === 'SUPER_ADMIN' || user?.appRole === 'SUPER_ADMIN') {
          router.push('/admin/dashboard');
        } else {
          router.push('/dashboard');
        }
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please verify your current temporary password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* TeamsTechyArts Branding Header */}
        <div className="text-center space-y-2">
          <img
            src="/images/logo.png"
            alt="TeamsTechyArts"
            className="h-12 w-auto mx-auto object-contain mb-1"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Welcome to TeamsTechyArts</h1>
          <p className="text-sm font-medium text-neutral-700">Complete your account setup</p>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Your administrator created your account successfully. For security, please update your password before continuing.
          </p>
        </div>

        <Card className="border-neutral-200 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-neutral-800" />
              Update Your Password
            </CardTitle>
            <CardDescription className="text-xs">
              Replace your temporary password with a secure personal password
            </CardDescription>
          </CardHeader>

          <CardContent>
            {success ? (
              <div className="py-6 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-neutral-900">Password Updated Successfully!</h3>
                <p className="text-xs text-neutral-500">Redirecting to your TeamsTechyArts workspace...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="w-full space-y-1.5">
                  <label htmlFor="currentPassword" className="block text-xs font-semibold text-neutral-700 tracking-tight">
                    Current / Temporary Password
                  </label>
                  <div className="relative">
                    <input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      placeholder="Enter temporary password"
                      required
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 p-1 focus:outline-none"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="w-full space-y-1.5">
                  <label htmlFor="newPassword" className="block text-xs font-semibold text-neutral-700 tracking-tight">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      required
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 p-1 focus:outline-none"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="w-full space-y-1.5">
                  <label htmlFor="confirmPassword" className="block text-xs font-semibold text-neutral-700 tracking-tight">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Re-enter new password"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 p-1 focus:outline-none"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password Requirements Checklist */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-1.5">
                  <span className="font-semibold text-neutral-700 block mb-1">Password Requirements:</span>
                  <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>At least one uppercase letter (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>At least one lowercase letter (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>At least one number (0-9)</span>
                  </div>
                  {confirmPassword.length > 0 && (
                    <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>Passwords match</span>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  isLoading={isLoading}
                  disabled={!isFormValid}
                  className="w-full gap-2 mt-2 bg-black text-white hover:bg-neutral-800"
                >
                  Update Password <ArrowRight className="w-4 h-4" />
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>End-to-end Argon2id encryption</span>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="text-neutral-500 hover:text-black font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
