'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { calendarApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle, Briefcase } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<any>({ holidays: [], events: [], leaves: [], attendances: [], tasks: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const fetchEvents = useCallback(async () => {
    try {
      const res = await calendarApi.getEvents({ year, month });
      setData(res);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const getEventDateStr = (ev: any): string => {
    const raw = ev.startAt || ev.start_at;
    if (!raw) return '';
    if (ev.allDay || ev.all_day || ev.eventType === 'HOLIDAY' || ev.event_type === 'HOLIDAY') {
      return typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10);
    }
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  const getHolidayDateStr = (h: any): string => {
    const raw = h.holidayDate || h.holiday_date;
    if (!raw) return '';
    return typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10);
  };

  // Generate calendar grid days
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0 = Sun, 1 = Mon...
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Work Calendar</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Your schedule overview including assigned tasks, team meetings, company holidays, and leaves.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handlePrevMonth} variant="outline" size="icon">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-bold min-w-[140px] text-center">{monthName}</span>
          <Button onClick={handleNextMonth} variant="outline" size="icon">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="space-y-4">
          {/* Days Header */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 pb-2 border-b border-neutral-200">
            <span className="text-neutral-400">Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span className="text-neutral-400">Sat</span>
          </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-1">
              {blanks.map((b) => (
                <div key={`blank-${b}`} className="min-h-[110px] p-2 bg-neutral-50/50 rounded-md border border-transparent" />
              ))}

              {days.map((d) => {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isHoliday = data.holidays?.find((h: any) => getHolidayDateStr(h) === dateStr);
                const isLeave = data.leaves?.find((l: any) => {
                  const s = (l.startDate || l.start_date || '').slice(0, 10);
                  const e = (l.endDate || l.end_date || '').slice(0, 10);
                  return Boolean(s && e && dateStr >= s && dateStr <= e);
                });
                const isAttended = data.attendances?.find((a: any) => (a.attendanceDate || a.attendance_date || '').slice(0, 10) === dateStr);
                const dayEvents = data.events?.filter((e: any) => getEventDateStr(e) === dateStr);
                const dayTasks = data.tasks?.filter((t: any) => (t.startDate?.slice(0, 10) === dateStr || t.dueDate?.slice(0, 10) === dateStr));

                return (
                  <div
                    key={d}
                    className="min-h-[110px] p-2 rounded-md border border-neutral-200 bg-white flex flex-col justify-between hover:border-black transition-colors"
                  >
                    <span className="text-xs font-bold text-neutral-800">{d}</span>
                    <div className="space-y-1 mt-1">
                      {isHoliday && (
                        <span className="block px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-900 text-white truncate" title={isHoliday.name}>
                          ★ {isHoliday.name}
                        </span>
                      )}

                      {isLeave && (
                        <span className="block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 truncate">
                          On Leave
                        </span>
                      )}

                      {isAttended && isAttended.checkInAt && (
                        <span className="block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 truncate">
                          ✓ {isAttended.workMode || 'Present'}
                        </span>
                      )}

                      {dayEvents?.map((ev: any) => (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedItem({ type: 'EVENT', item: ev })}
                          className="w-full text-left block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-900 truncate transition-colors"
                        >
                          📅 {ev.title}
                        </button>
                      ))}

                      {dayTasks?.map((t: any) => (
                        <Link
                          key={t.id}
                          href="/tasks"
                          className="block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100 truncate transition-colors"
                        >
                          ✓ Task: {t.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </Card>

      {/* Item Detail Modal */}
      <Dialog
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.item?.title || 'Details'}
        description="Calendar event details."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="default">{selectedItem?.item?.eventType || 'EVENT'}</Badge>
            <Badge variant={selectedItem?.item?.visibility === 'EVERYONE' ? 'success' : 'secondary'}>
              {selectedItem?.item?.visibility === 'EVERYONE' ? 'Company Wide' : 'Invited Attendees'}
            </Badge>
          </div>

          {selectedItem?.item?.description && (
            <p className="text-xs text-neutral-700 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
              {selectedItem.item.description}
            </p>
          )}

          <div className="text-xs text-neutral-500 space-y-1">
            <div>
              <strong>Start:</strong> {selectedItem?.item?.startAt ? formatDate(selectedItem.item.startAt) : '—'}
            </div>
            <div>
              <strong>End:</strong> {selectedItem?.item?.endAt ? formatDate(selectedItem.item.endAt) : '—'}
            </div>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-neutral-100">
            <Button variant="outline" size="sm" onClick={() => setSelectedItem(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
