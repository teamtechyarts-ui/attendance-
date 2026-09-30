'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { rbacApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { ShieldAlert, ShieldCheck, Key } from 'lucide-react';

export default function LimitedAdminSettingsPage() {
  const { user } = useAuth();
  const [permissionsRegistry, setPermissionsRegistry] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canViewSettings = useMemo(
    () =>
      hasPermission(user, [
        'SETTINGS_VIEW',
        'SETTINGS_MANAGE',
        'SYSTEM_SETTINGS',
        'ROLE_VIEW',
        'PERMISSION_VIEW',
        'MANAGE_RBAC',
      ]),
    [user]
  );

  const loadData = useCallback(async () => {
    try {
      const res = await rbacApi.getPermissions();
      setPermissionsRegistry(Array.isArray(res) ? res : []);
    } catch {
      setPermissionsRegistry([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!canViewSettings) {
    return (
      <div className="p-8 border border-neutral-200 rounded-lg bg-white text-center">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-neutral-900">Access Restricted</h2>
        <p className="text-xs text-neutral-500 mt-1">
          You do not have permission to view administrative settings (SETTINGS_VIEW required).
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading settings..." />
      </div>
    );
  }

  const userPerms = new Set<string>((user?.permissions || []) as string[]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Administrative Settings & Policies</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Overview of assigned permissions and organizational authorization rules.
          </p>
        </div>
      </div>

      <Card className="border-neutral-200">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold text-neutral-900 flex items-center gap-2">
            <Key className="w-4 h-4 text-neutral-600" />
            Your Active Assigned Permissions ({user?.permissions?.length || 0})
          </CardTitle>
          <CardDescription className="text-xs text-neutral-500">
            Permissions granted to your employee profile by Super Admin
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {permissionsRegistry.map((p) => {
              const hasIt = userPerms.has(p.id || p.key);
              return (
                <div
                  key={p.id || p.key}
                  className={`p-2.5 rounded border text-xs flex items-center justify-between ${
                    hasIt
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950 font-medium'
                      : 'bg-neutral-50/40 border-neutral-100 text-neutral-400 opacity-60'
                  }`}
                >
                  <div>
                    <span className="block font-semibold">{p.label || p.id}</span>
                    <span className="text-[10px] opacity-75">{p.group || p.category}</span>
                  </div>
                  {hasIt && (
                    <Badge variant="success" className="text-[9px] py-0 px-1">
                      ACTIVE
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
