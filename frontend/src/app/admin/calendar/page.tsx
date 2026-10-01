'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { calendarApi, employeesApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Users,
  CheckCircle2,
  Trash2,
  Clock,
  Briefcase,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Employee, CalendarEvent } from '@/types';

export default function AdminCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<any>({ holidays: [], events: [], leaves: [], attendances: [], tasks: [] });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState('MEETING');
  const [visibility, setVisibility] = useState<'EVERYONE' | 'SPECIFIC'>('EVERYONE');
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const fetchEvents = useCallback(async () => {
    try {
      const [res, emps] = await Promise.all([
        calendarApi.getEvents({ year, month }),
        employeesApi.list(),
      ]);
      setData(res);
      setEmployees(emps || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month, 1));

  const toggleAttendee = (empId: string) => {
    setSelectedAttendeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startAt) return;

    setIsSubmitting(true);
    try {
      const isHoliday = eventType === 'HOLIDAY';
      let payloadStart: string;
      let payloadEnd: string;
      let isAllDay = isHoliday;

      if (isHoliday) {
        const dStr = startAt.slice(0, 10);
        payloadStart = `${dStr}T00:00:00.000Z`;
        payloadEnd = `${dStr}T23:59:59.999Z`;
        isAllDay = true;
      } else {
        const startDt = new Date(startAt);
        const endDt = endAt ? new Date(endAt) : startDt;
        payloadStart = isNaN(startDt.getTime()) ? startAt : startDt.toISOString();
        payloadEnd = isNaN(endDt.getTime()) ? (endAt || startAt) : endDt.toISOString();
      }

      await calendarApi.createEvent({
        title,
        description: description || null,
        eventType,
        visibility,
        attendeeIds: visibility === 'SPECIFIC' ? selectedAttendeeIds : undefined,
        startAt: payloadStart,
        endAt: payloadEnd,
        allDay: isAllDay,
      });
      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      setSelectedAttendeeIds([]);
      setVisibility('EVERYONE');
      setStartAt('');
      setEndAt('');
      fetchEvents();
    } catch (err: any) {
      alert(err.message || 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await calendarApi.deleteEvent(eventId);
      setSelectedEvent(null);
      fetchEvents();
    } catch (err: any) {
      alert(err.message || 'Failed to delete event');
    }
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

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Company Calendar & Scheduler</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Schedule company-wide events, meetings, specific attendee invites, and monitor task deadlines.
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
          <Button onClick={() => setIsModalOpen(true)} className="gap-1.5 shadow-sm text-xs ml-2">
            <Plus className="w-3.5 h-3.5" /> Schedule Event
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 pb-2 border-b border-neutral-200">
            <span className="text-neutral-400">Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span className="text-neutral-400">Sat</span>
          </div>

            <div className="grid grid-cols-7 gap-1">
              {blanks.map((b) => (
                <div key={`blank-${b}`} className="min-h-[110px] p-2 bg-neutral-50/50 rounded-md border border-transparent" />
              ))}

              {days.map((d) => {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isHoliday = data.holidays?.find((h: any) => getHolidayDateStr(h) === dateStr);
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
                        <span className="block px-1.5 py-0.5 rounded text-[10px] font-bold bg-black text-white truncate" title={isHoliday.name}>
                          ★ {isHoliday.name}
                        </span>
                      )}

                      {dayEvents?.map((ev: any) => (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="w-full text-left block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-900 truncate transition-colors"
                        >
                          📅 {ev.title}
                        </button>
                      ))}

                      {dayTasks?.map((t: any) => (
                        <Link
                          key={t.id}
                          href={`/admin/tasks`}
                          className="block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100 truncate transition-colors"
                        >
                          ✓ {t.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </Card>

      {/* Create Event Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule Company Event"
        description="Add a company meeting, milestone, or invite specific employees."
      >
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <Input
            label="Event Title *"
            placeholder="e.g. Q3 All Hands Meeting"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Event Type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              options={[
                { value: 'MEETING', label: 'Meeting' },
                { value: 'HOLIDAY', label: 'Holiday' },
                { value: 'TASK', label: 'Milestone / Task' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />

            <Select
              label="Audience Visibility *"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              options={[
                { value: 'EVERYONE', label: 'Company Wide (Everyone)' },
                { value: 'SPECIFIC', label: 'Specific Attendees Only' },
              ]}
            />
          </div>

          {/* Specific Attendees Multi-Select */}
          {visibility === 'SPECIFIC' && (
            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <label className="text-xs font-bold text-neutral-800 flex items-center justify-between">
                <span>Select Attendees (Active Employees Only)</span>
                <span className="text-neutral-400 font-normal">{selectedAttendeeIds.length} selected</span>
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-neutral-50 rounded-lg border border-neutral-200">
                {employees
                  .filter((e) => e.employmentStatus === 'ACTIVE' && (e as any).user?.status !== 'INACTIVE')
                  .map((emp) => {
                    const isSelected = selectedAttendeeIds.includes(emp.id);
                    return (
                      <label
                        key={emp.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-white text-xs cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAttendee(emp.id)}
                          className="rounded border-neutral-300 text-black focus:ring-0"
                        />
                        <span className="font-medium text-neutral-900">{emp.displayName}</span>
                        <span className="text-[10px] text-neutral-400">({emp.department?.name || 'Staff'})</span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}

          {eventType === 'HOLIDAY' ? (
            <div className="space-y-1">
              <Input
                label="Holiday Date *"
                type="date"
                required
                value={startAt}
                onChange={(e) => {
                  setStartAt(e.target.value);
                  setEndAt(e.target.value);
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start Date & Time *"
                type="datetime-local"
                required
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
              <Input
                label="End Date & Time *"
                type="datetime-local"
                required
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          )}

          <Textarea
            label="Description"
            placeholder="Agenda, location, Google Meet link, or notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Schedule Event
            </Button>
          </div>
        </form>
      </Dialog>

      {/* View Event Detail Modal */}
      <Dialog
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title || 'Event Details'}
        description="Calendar event information and attendee list."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="default">{selectedEvent?.eventType || 'EVENT'}</Badge>
            <Badge variant={selectedEvent?.visibility === 'EVERYONE' ? 'success' : 'secondary'}>
              {selectedEvent?.visibility === 'EVERYONE' ? 'All Company' : 'Specific Attendees'}
            </Badge>
          </div>

          {selectedEvent?.description && (
            <p className="text-xs text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
              {selectedEvent.description}
            </p>
          )}

          <div className="text-xs text-neutral-500 space-y-1">
            <div>
              <strong>Start:</strong> {selectedEvent?.startAt ? formatDate(selectedEvent.startAt) : '—'}
            </div>
            <div>
              <strong>End:</strong> {selectedEvent?.endAt ? formatDate(selectedEvent.endAt) : '—'}
            </div>
          </div>

          {selectedEvent?.attendees && selectedEvent.attendees.length > 0 && (
            <div className="pt-2 border-t border-neutral-100">
              <span className="text-xs font-bold text-neutral-800 block mb-2">Attendees ({selectedEvent.attendees.length}):</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedEvent.attendees.map((a: any) => (
                  <span key={a.id} className="px-2 py-0.5 bg-neutral-100 rounded text-[11px] font-medium text-neutral-800 border border-neutral-200">
                    {a.employee?.displayName || 'Attendee'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteEvent(selectedEvent.id)}
              className="text-xs text-red-600 hover:bg-red-50 gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Event
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
