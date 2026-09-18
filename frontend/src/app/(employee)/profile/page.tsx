'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { employeesApi, authApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { User, Lock, Save, CheckCircle2, Shield } from 'lucide-react';

export default function ProfilePage() {
  const { user, refreshMe } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
    }
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await employeesApi.updateSelfProfile({
        displayName,
        phone: phone || null,
        city: city || null,
        emergencyContactName: emergencyName || null,
        emergencyContactPhone: emergencyPhone || null,
      });
      setSaveSuccess(true);
      refreshMe();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    setIsChangingPass(true);

    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPassMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPassMsg({ type: 'error', text: err.message || 'Failed to change password' });
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-neutral-200">
        <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Personal Profile</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Manage your employee information and account security settings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Card: Official Badge Details */}
        <Card className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-2xl mx-auto shadow">
              {user?.displayName ? user.displayName.charAt(0) : 'U'}
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">{user?.displayName || 'My Profile'}</h3>
              <p className="text-xs text-neutral-500 font-mono">{user?.email}</p>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {user?.role}
            </Badge>
          </div>

          <div className="space-y-3 pt-4 border-t border-neutral-100 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Employee Code</span>
              <span className="font-semibold text-neutral-800 font-mono">{user?.employeeCode || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Department</span>
              <span className="font-semibold text-neutral-800">{user?.departmentName || 'General'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Designation</span>
              <span className="font-semibold text-neutral-800">{user?.designationName || 'Staff'}</span>
            </div>
          </div>
        </Card>

        {/* Right 2 Columns: Editable Details & Security */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Information</CardTitle>
              <CardDescription>Update your contact and personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSave} className="space-y-4">
                {saveSuccess && (
                  <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Profile updated successfully!
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Display Name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                  <Input
                    label="Phone Number"
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <Input
                    label="City / Location"
                    placeholder="Bangalore, India"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>

                <div className="pt-2 border-t border-neutral-100">
                  <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-3">
                    Emergency Contact
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Contact Name"
                      placeholder="e.g. Jane Doe"
                      value={emergencyName}
                      onChange={(e) => setEmergencyName(e.target.value)}
                    />
                    <Input
                      label="Contact Phone"
                      placeholder="+91 9999999999"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" isLoading={isSaving} className="gap-2 text-xs">
                    <Save className="w-3.5 h-3.5" /> Save Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription>Ensure your account is protected with a strong password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                {passMsg && (
                  <div
                    className={`p-3 rounded-md text-xs ${
                      passMsg.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                  >
                    {passMsg.text}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Current Password"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <Input
                    label="New Password"
                    type="password"
                    required
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" isLoading={isChangingPass} variant="outline" className="text-xs gap-2">
                    <Lock className="w-3.5 h-3.5" /> Update Password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
