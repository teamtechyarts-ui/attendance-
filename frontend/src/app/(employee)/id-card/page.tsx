'use client';

import React, { useEffect, useState } from 'react';
import { digitalIdApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { DigitalIdCard } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { formatDate } from '@/lib/utils';
import { CreditCard, Printer, ShieldCheck, QrCode } from 'lucide-react';

export default function DigitalIdPage() {
  const { user } = useAuth();
  const [card, setCard] = useState<DigitalIdCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await digitalIdApi.getMyCard();
        setCard(data);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return <LoadingState message="Loading Digital ID Card..." />;
  }

  const verificationUrl = typeof window !== 'undefined' && card
    ? `${window.location.origin}/verify-id/${card.verificationToken}`
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Digital Employee ID</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Your official verifiable digital credential and company ID card.</p>
        </div>
        <Button onClick={handlePrint} variant="outline" size="sm" className="gap-1.5 text-xs">
          <Printer className="w-3.5 h-3.5" /> Print / Save Badge
        </Button>
      </div>

      <div className="flex justify-center py-6">
        {/* Physical ID Card Mockup */}
        <div className="w-full max-w-sm rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-2xl text-center space-y-5 relative overflow-hidden">
          {/* Card Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div className="flex items-center gap-1.5 text-left">
              <div className="w-6 h-6 rounded bg-black flex items-center justify-center text-white font-black text-xs">
                W
              </div>
              <span className="font-extrabold text-xs tracking-tight">WORKOS</span>
            </div>
            <Badge variant="success" className="text-[10px]">
              Active Badge
            </Badge>
          </div>

          {/* Photo & Name */}
          <div className="space-y-2">
            <div className="w-24 h-24 rounded-full bg-neutral-900 text-white flex items-center justify-center text-2xl font-black mx-auto border-4 border-neutral-100 shadow-md">
              {user?.displayName ? user.displayName.charAt(0) : 'U'}
            </div>
            <div>
              <h2 className="text-lg font-black text-neutral-900">{user?.displayName || 'Employee'}</h2>
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                {user?.designationName || 'Staff Member'}
              </p>
              <p className="text-[11px] text-neutral-400 font-medium">
                {user?.departmentName || 'Operations'}
              </p>
            </div>
          </div>

          {/* Details Table */}
          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-left text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Employee Code</span>
              <span className="font-mono font-bold text-neutral-900">{user?.employeeCode || 'EMP-101'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Card Number</span>
              <span className="font-mono font-bold text-neutral-900">{card?.cardNumber || 'ID-001'}</span>
            </div>
          </div>

          {/* QR Verification Block */}
          <div className="p-3 rounded-lg border border-dashed border-neutral-300 bg-white flex flex-col items-center justify-center space-y-1">
            <div className="w-20 h-20 bg-neutral-900 text-white rounded flex items-center justify-center">
              <QrCode className="w-16 h-16 text-white" />
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">Scan to Verify Credential</span>
          </div>

          <div className="text-[10px] text-neutral-400 pt-2 border-t border-neutral-100 flex items-center justify-between">
            <span>Issued: {card ? formatDate(card.issuedAt) : 'Recent'}</span>
            <span className="flex items-center gap-1 font-semibold text-neutral-700">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Authorized
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
