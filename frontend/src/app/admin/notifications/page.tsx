'use client';

import React from 'react';
import { NotificationsView } from '@/components/notifications/notifications-view';

export default function AdminNotificationsPage() {
  return <NotificationsView isAdminView={true} />;
}
