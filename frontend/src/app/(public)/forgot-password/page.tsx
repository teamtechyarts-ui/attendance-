'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email);
    } catch {
      // generic response
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img
            src="/images/logo.png"
            alt="TeamsTechyArts"
            className="h-12 w-auto mx-auto object-contain mb-2"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">TeamsTechyArts Workspace</h1>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto">
            Forgot Password Recovery Portal
          </p>
        </div>

        <Card className="border-neutral-200/80 shadow-md">
          <CardHeader>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              Enter your work email address and we will send you password reset instructions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-neutral-900 mx-auto" />
                <h4 className="text-sm font-semibold text-neutral-900">Check your inbox</h4>
                <p className="text-xs text-neutral-600">
                  If an account exists for <span className="font-semibold">{email}</span>, we have sent password reset instructions.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Work Email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button type="submit" isLoading={isLoading} className="w-full">
                  Send Reset Link
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="justify-center border-t border-neutral-100 p-4">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-neutral-600 hover:text-black font-semibold">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
