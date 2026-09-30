'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { projectsApi, employeesApi } from '@/lib/api';
import { Project, Employee } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Users,
  Search,
  Mail,
  Building2,
  FolderKanban,
  CheckCircle2,
  Briefcase,
} from 'lucide-react';

export default function LimitedAdminTeamPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [projList, emps] = await Promise.all([
        projectsApi.list({ adminView: true }).catch((err) => {
          console.warn('Could not load projects for team:', err);
          return [];
        }),
        employeesApi.listAssignable().catch((err) => {
          console.warn('Could not load assignable employees:', err);
          return [];
        }),
      ]);
      setProjects(Array.isArray(projList) ? projList : []);
      setEmployees(Array.isArray(emps) ? emps : []);
    } catch (err: any) {
      console.error('Failed to load team data:', err);
      setLoadError(err.message || 'Unable to load team members. Please verify your permissions and network connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate unique team members from projects in scope
  const teamMembers = useMemo(() => {
    const map = new Map<string, { employee: any; projects: { id: string; name: string; role: string }[] }>();

    for (const p of projects) {
      for (const m of p.members || []) {
        const emp = m.employee || employees.find((e) => e.id === m.employeeId);
        if (!emp) continue;

        if (!map.has(m.employeeId)) {
          map.set(m.employeeId, {
            employee: emp,
            projects: [],
          });
        }
        map.get(m.employeeId)!.projects.push({
          id: p.id,
          name: p.name,
          role: m.projectRole,
        });
      }
    }

    let list = Array.from(map.values());
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.employee.displayName?.toLowerCase().includes(q) ||
          item.employee.firstName?.toLowerCase().includes(q) ||
          item.employee.email?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [projects, employees, search]);

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading team roster..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-12 max-w-lg mx-auto">
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Unable to Load Team</h3>
              <p className="text-xs text-neutral-600 mt-1">{loadError}</p>
            </div>
            <Button
              onClick={() => loadData()}
              size="sm"
              className="bg-neutral-900 hover:bg-black text-white text-xs"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Team Administration</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Members collaborating across your assigned projects and administrative scope.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-neutral-200">
        <CardContent className="p-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <Input
              placeholder="Search team members by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Team Roster Table */}
      <Card className="border-neutral-200">
        <CardContent className="p-0">
          {teamMembers.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Team Members Found"
                description="There are no team members associated with your assigned projects."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-neutral-100 bg-neutral-50 text-[11px]">
                    <TableHead className="py-2.5 font-bold text-neutral-700">Member</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Department</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Assigned Projects</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Project Roles</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map(({ employee, projects: empProjects }) => (
                    <TableRow key={employee.id} className="border-b border-neutral-100 hover:bg-neutral-50/70 text-xs">
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                            {employee.displayName ? employee.displayName.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <span className="font-semibold text-neutral-900 block">
                              {employee.displayName || employee.firstName}
                            </span>
                            <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                              <Mail className="w-2.5 h-2.5" />
                              {employee.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-600">
                        {employee.department?.name || '—'}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {empProjects.map((p) => (
                            <Badge key={p.id} variant="secondary" className="text-[10px] font-normal">
                              {p.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {empProjects.map((p) => (
                            <Badge key={p.id} variant="outline" className="text-[9px]">
                              {p.role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Badge variant="success" className="text-[9px]">
                          ACTIVE
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
