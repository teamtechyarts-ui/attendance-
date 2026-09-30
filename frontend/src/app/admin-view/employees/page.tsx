'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { employeesApi } from '@/lib/api';
import { Employee } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, Mail, ShieldAlert } from 'lucide-react';

export default function LimitedAdminEmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const canViewEmployees = useMemo(
    () => hasPermission(user, ['EMPLOYEE_VIEW', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE', 'MANAGE_EMPLOYEES']),
    [user]
  );

  const loadData = useCallback(async () => {
    try {
      const res = await employeesApi.listAssignable();
      setEmployees(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase().trim();
    return employees.filter(
      (e) =>
        e.displayName?.toLowerCase().includes(q) ||
        e.firstName?.toLowerCase().includes(q) ||
        e.lastName?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.employeeCode?.toLowerCase().includes(q)
    );
  }, [employees, search]);

  if (!canViewEmployees) {
    return (
      <div className="p-8 border border-neutral-200 rounded-lg bg-white text-center">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-neutral-900">Access Restricted</h2>
        <p className="text-xs text-neutral-500 mt-1">
          You do not have permission to view employee personnel directories (EMPLOYEE_VIEW required).
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading employees..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Personnel Directory</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Employees within your authorized administrative scope.
          </p>
        </div>
      </div>

      <Card className="border-neutral-200">
        <CardContent className="p-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <Input
              placeholder="Search by name, code or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-neutral-200">
        <CardContent className="p-0">
          {filteredEmployees.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Employees Found"
                description="No employee records found matching your search or scope."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-neutral-100 bg-neutral-50 text-[11px]">
                    <TableHead className="py-2.5 font-bold text-neutral-700">Code</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Employee</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Department</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Designation</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp) => (
                    <TableRow key={emp.id} className="border-b border-neutral-100 hover:bg-neutral-50/70 text-xs">
                      <TableCell className="py-2.5 font-mono text-[11px] font-bold text-neutral-600">
                        {emp.employeeCode}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-[10px]">
                            {emp.displayName ? emp.displayName.charAt(0).toUpperCase() : 'E'}
                          </div>
                          <div>
                            <span className="font-semibold text-neutral-900 block">
                              {emp.displayName || `${emp.firstName} ${emp.lastName}`}
                            </span>
                            <span className="text-[10px] text-neutral-400">{emp.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-600">
                        {emp.department?.name || '—'}
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-600">
                        {emp.designation?.name || '—'}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Badge variant="success" className="text-[9px]">
                          {emp.employmentStatus || 'ACTIVE'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
