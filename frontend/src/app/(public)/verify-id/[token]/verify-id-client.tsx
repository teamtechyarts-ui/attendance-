'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { digitalIdApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { ShieldCheck, ShieldAlert, Building2, User, CreditCard } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function VerifyIdClient() {
  const { token } = useParams() as { token: string };
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function verify() {
      try {
        const res = await digitalIdApi.verifyPublicToken(token);
        setData(res);
      } catch (err: any) {
        setData({ isValid: false, message: 'Verification error' });
      } finally {
        setIsLoading(false);
      }
    }
    if (token) verify();
  }, [token]);

  if (isLoading) {
    return <LoadingState message="Verifying Digital Credential..." />;
  }

  const isValid = data?.isValid;
  const emp = data?.employee;

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-extrabold tracking-tight text-neutral-900">Credential Verification</h1>
          <p className="text-xs text-neutral-500">Official TeamsTechyArts Employee Digital ID Validator</p>
        </div>

        <Card className={`border-2 shadow-md ${isValid ? 'border-neutral-900' : 'border-rose-200'}`}>
          <CardHeader className="text-center pb-3">
            <div className="mx-auto mb-2">
              {isValid ? (
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-800 border border-rose-200 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
              )}
            </div>
            <CardTitle className="text-base">{isValid ? 'Official Valid Credential' : 'Invalid Credential'}</CardTitle>
            <CardDescription>{isValid ? 'This employee badge is authentic and active.' : data?.message || 'Verification token is invalid.'}</CardDescription>
          </CardHeader>

          {isValid && emp && (
            <CardContent className="space-y-4 pt-2">
              <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-3">
                <div className="flex items-center gap-3">
                  {emp.profilePhotoUrl ? (
                    <img
                      src={emp.profilePhotoUrl}
                      alt={emp.displayName || 'Employee'}
                      className="w-12 h-12 rounded-full object-cover border border-neutral-300"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">
                      {(emp.displayName || emp.employeeCode || 'E').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">{emp.displayName || 'Employee'}</h3>
                    <p className="text-xs text-neutral-500 font-mono">{emp.employeeCode || ''}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Department</span>
                    <span className="font-semibold text-neutral-800">{emp.department}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Designation</span>
                    <span className="font-semibold text-neutral-800">{emp.designation}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Card Number</span>
                    <span className="font-semibold text-neutral-800 font-mono">{emp.cardNumber}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Member Since</span>
                    <span className="font-semibold text-neutral-800">{formatDate(emp.joiningDate)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <Badge variant="success" className="text-xs py-1 px-3">
                  ● ACTIVE EMPLOYEE
                </Badge>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
