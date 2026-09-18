'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { attendanceApi, employeesApi } from '@/lib/api';
import { AttendanceRecord, Employee } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatTime } from '@/lib/utils';
import { Clock, Users } from 'lucide-react';

export default function AdminAttendancePage() {
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadAttendance = useCallback(async () => {
    try {
      const [list, emps] = await Promise.all([
        attendanceApi.getHistory({ employeeId: selectedEmp || undefined }),
        employeesApi.list(),
      ]);
      setAttendances(list || []);
      setEmployees(emps || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [selectedEmp]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Organization Attendance Sheet</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Comprehensive audit of all staff work sessions, modes, and timestamps.</p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            options={[
              { value: '', label: 'All Employees' },
              ...employees.map((e) => ({ value: e.id, label: e.displayName })),
            ]}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState message="Loading attendance records..." />
          ) : attendances.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={Clock} title="No records found" description="No attendance logs recorded for the selected filter." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Work Mode</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendances.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-semibold">{formatDate(rec.attendanceDate)}</TableCell>
                    <TableCell>
                      <Badge variant={rec.status === 'PRESENT' ? 'success' : rec.status === 'LATE' ? 'warning' : 'secondary'}>
                        {rec.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-xs">{rec.workMode}</TableCell>
                    <TableCell className="text-xs">{formatTime(rec.checkInAt)}</TableCell>
                    <TableCell className="text-xs">{rec.checkOutAt ? formatTime(rec.checkOutAt) : 'In Progress'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {rec.totalWorkMinutes ? `${Math.floor(rec.totalWorkMinutes / 60)}h ${rec.totalWorkMinutes % 60}m` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
