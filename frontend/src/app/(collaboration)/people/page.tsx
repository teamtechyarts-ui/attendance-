'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { collaborationApi, departmentsApi } from '@/lib/api';
import { PeopleDirectoryItem, Department } from '@/types';
import { useCollaboration } from '@/hooks/use-collaboration';
import { PresenceBadge } from '@/components/collaboration/presence-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Users,
  Search,
  MessageSquare,
  Building2,
  Briefcase,
  Mail,
  Filter,
  Loader2,
  UserCheck,
} from 'lucide-react';

export default function PeoplePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { presence: myPresence } = useCollaboration();
  const [people, setPeople] = useState<PeopleDirectoryItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedPresenceFilter, setSelectedPresenceFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [peopleRes, deptRes] = await Promise.all([
          collaborationApi.getPeopleDirectory(),
          departmentsApi.list().catch(() => []),
        ]);
        if (peopleRes?.people) {
          setPeople(peopleRes.people);
        }
        if (Array.isArray(deptRes)) {
          setDepartments(deptRes);
        }
      } catch (err) {
        console.error('Failed to load people directory:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleStartChat = async (targetUserId: string) => {
    try {
      setStartingChatUserId(targetUserId);
      const res = await collaborationApi.getOrCreateDirectConversation(targetUserId);
      if (res?.conversation?.id) {
        router.push(`/chat?id=${res.conversation.id}`);
      }
    } catch (err) {
      console.error('Failed to start chat:', err);
    } finally {
      setStartingChatUserId(null);
    }
  };

  const filteredPeople = useMemo(() => {
    return people.filter((p) => {
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = p.displayName.toLowerCase().includes(q);
        const matchEmail = p.email.toLowerCase().includes(q);
        const matchDept = (p.departmentName || '').toLowerCase().includes(q);
        const matchDesig = (p.designationName || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchDept && !matchDesig) return false;
      }

      // Department filter
      if (selectedDepartment !== 'ALL') {
        if (p.departmentId !== selectedDepartment) return false;
      }

      // Presence filter
      if (selectedPresenceFilter !== 'ALL') {
        if (selectedPresenceFilter === 'ONLINE') {
          if (!p.presence?.isOnline && p.presence?.status === 'OFFLINE') return false;
        } else if (p.presence?.status !== selectedPresenceFilter) {
          return false;
        }
      }

      return true;
    });
  }, [people, search, selectedDepartment, selectedPresenceFilter]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold shadow-sm">
                <Users className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                People Directory
              </h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Find colleagues, view real-time presence, and start direct collaboration chats.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/chat')}
              className="gap-1.5 border-zinc-300 dark:border-zinc-700 font-medium"
            >
              <MessageSquare className="h-4 w-4" />
              Open Chat
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Search by name, email, role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-50/50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            {/* Department Filter */}
            <div>
              <Select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="bg-zinc-50/50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800 text-xs h-10"
              >
                <option value="ALL">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Presence Filter */}
            <div>
              <Select
                value={selectedPresenceFilter}
                onChange={(e) => setSelectedPresenceFilter(e.target.value)}
                className="bg-zinc-50/50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800 text-xs h-10"
              >
                <option value="ALL">All Availability</option>
                <option value="AVAILABLE">Available</option>
                <option value="BUSY">Busy</option>
                <option value="DO_NOT_DISTURB">Do not disturb</option>
                <option value="AWAY">Away</option>
                <option value="OFFLINE">Offline</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-1">
            <span>
              Showing <strong className="text-zinc-900 dark:text-zinc-100">{filteredPeople.length}</strong> colleagues
            </span>
            {(search || selectedDepartment !== 'ALL' || selectedPresenceFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedDepartment('ALL');
                  setSelectedPresenceFilter('ALL');
                }}
                className="text-zinc-600 dark:text-zinc-300 hover:underline font-medium"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* Directory Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <Loader2 className="h-8 w-8 animate-spin mb-3 text-zinc-600 dark:text-zinc-300" />
            <p className="text-sm">Loading people directory...</p>
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">No colleagues found</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              Try adjusting your search criteria or filters to find other employees.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPeople.map((person) => {
              const isStarting = startingChatUserId === person.userId;
              const initials = person.displayName
                ? person.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : 'U';

              return (
                <div
                  key={person.userId || person.employeeId}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Avatar & Presence */}
                    <div className="flex items-start justify-between">
                      <div className="relative">
                        {person.profilePhotoUrl ? (
                          <img
                            src={person.profilePhotoUrl}
                            alt={person.displayName}
                            className="h-12 w-12 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-sm shadow-inner">
                            {initials}
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <PresenceBadge status={person.presence?.status || 'OFFLINE'} size="md" />
                        </div>
                      </div>

                      <PresenceBadge
                        status={person.presence?.status || 'OFFLINE'}
                        size="sm"
                        showLabel
                      />
                    </div>

                    {/* Name & Title */}
                    <div>
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {person.displayName}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                        <Briefcase className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{person.designationName || 'Team Member'}</span>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                      {person.departmentName && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{person.departmentName}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate">{person.email}</span>
                      </div>
                      {person.presence?.customStatusMessage && (
                        <div className="text-xs italic text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-1.5 rounded border border-zinc-100 dark:border-zinc-800/50 truncate">
                          &ldquo;{person.presence.customStatusMessage}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2">
                    {user?.id === person.userId ? (
                      <div className="w-full py-2 px-3 text-center text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 select-none">
                        You (Current User)
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleStartChat(person.userId)}
                        disabled={isStarting}
                        className="w-full gap-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 font-medium shadow-sm transition-all"
                        aria-label={`Message ${person.displayName}`}
                      >
                        {isStarting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Opening Chat...
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-4 w-4" />
                            Message
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
