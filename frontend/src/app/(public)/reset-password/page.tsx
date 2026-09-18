'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import {
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
  const isFormValid =
    hasMinLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    passwordsMatch &&
    Boolean(token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid or missing password reset token. Please request a new link.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumber) {
      setError('Password does not meet all security requirements');
      return;
    }

    setIsLoading(true);

    try {
      await authApi.resetPassword({
        token,
        newPassword,
        confirmPassword,
      });

      setSuccess(true);
    } catch (err: any) {
      const msg =
        err.message ||
        'This password reset link is invalid, has expired, or has already been used. Please request a new one.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Case 1: No token provided in URL
  if (!token) {
    return (
      <Card className="border-neutral-200/80 shadow-md">
        <CardHeader className="text-center pb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-600 border border-rose-200 mx-auto mb-2">
            <AlertCircle className="w-6 h-6" />
          </div>
          <CardTitle className="text-lg">Invalid Password Reset Link</CardTitle>
          <CardDescription>
            The password reset link is missing or invalid. Please request a new reset link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <Link href="/forgot-password" className="w-full block">
            <Button className="w-full">Request New Reset Link</Button>
          </Link>
        </CardContent>
        <CardFooter className="justify-center border-t border-neutral-100 p-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-600 hover:text-black font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // Case 2: Success state
  if (success) {
    return (
      <Card className="border-neutral-200/80 shadow-md">
        <CardHeader className="text-center pb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto mb-2">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <CardTitle className="text-lg">Password Reset Successfully</CardTitle>
          <CardDescription>
            Your password has been reset successfully. You can now sign in using your new password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <Link href="/login" className="w-full block">
            <Button className="w-full gap-2">
              Go to Sign In <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Case 3: Token present -> Show reset form
  return (
    <Card className="border-neutral-200/80 shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-neutral-800" />
          Reset Your Password
        </CardTitle>
        <CardDescription className="text-xs">
          Enter a new secure password for your TeamsTechyArts account
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* New Password Field */}
          <div className="w-full space-y-1.5">
            <label
              htmlFor="newPassword"
              className="block text-xs font-semibold text-neutral-700 tracking-tight"
            >
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
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 p-1 focus:outline-none"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="w-full space-y-1.5">
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-semibold text-neutral-700 tracking-tight"
            >
              Confirm Password
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
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-800 p-1 focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements Checklist */}
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-1.5">
            <span className="font-semibold text-neutral-700 block mb-1">
              Password Requirements:
            </span>
            <div
              className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>At least 8 characters</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${hasUppercase ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>At least one uppercase letter (A-Z)</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${hasLowercase ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>At least one lowercase letter (a-z)</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>At least one number (0-9)</span>
            </div>
            {confirmPassword.length > 0 && (
              <div
                className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>Passwords match</span>
              </div>
            )}
          </div>

          <Button
            type="submit"
            isLoading={isLoading}
            disabled={!isFormValid || isLoading}
            className="w-full gap-2 mt-2 bg-black text-white hover:bg-neutral-800"
          >
            {isLoading ? 'Resetting...' : 'Reset Password'} <ArrowRight className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-neutral-100 p-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-600 hover:text-black font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function ResetPasswordPage() {
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
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
            TeamsTechyArts Attendance
          </h1>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto">
            Enterprise Employee Attendance & Work Management Portal
          </p>
        </div>

        <Suspense
          fallback={
            <Card className="border-neutral-200/80 shadow-md p-8 text-center text-sm text-neutral-500">
              Loading password reset...
            </Card>
          }
        >
          <ResetPasswordForm />
        </Suspense>

        <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Argon2id Encrypted Password Security</span>
        </div>
      </div>
    </div>
  );
}
