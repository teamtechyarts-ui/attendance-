'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useCollaboration } from '@/hooks/use-collaboration';
import { collaborationApi } from '@/lib/api';
import {
  Conversation,
  Message,
  MessageReaction,
  PeopleDirectoryItem,
  UserPresenceStatus,
} from '@/types';
import { resolveMessagePreview, parseSystemMessage, MeetingSummaryPayload } from '@/lib/collaboration-utils';
import { PresenceBadge } from '@/components/collaboration/presence-badge';
import { PresenceSelector } from '@/components/collaboration/presence-selector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  MessageSquare,
  Users,
  Search,
  Plus,
  Send,
  CornerDownRight,
  Smile,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronDown,
  Clock,
  AlertCircle,
  X,
  Loader2,
  Info,
  UserPlus,
  UserMinus,
  LogOut,
  Shield,
  Calendar,
  Phone,
  Video,
} from 'lucide-react';

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '✅', '👏', '🎉', '🔥', '👀'];

// Canonical message normalization and chronological sorting (createdAt ASC, deterministic tie-break)
function normalizeAndSortMessages(msgs: Message[]): Message[] {
  const map = new Map<string, Message>();

  for (const m of msgs) {
    if (!m) continue;
    const key = m.id || m.temporaryId;
    if (!key) continue;

    if (map.has(key)) {
      const existing = map.get(key)!;
      if (existing.status === 'SENDING' && m.status !== 'SENDING') {
        map.set(key, m);
      }
    } else {
      map.set(key, m);
    }
  }

  const result = Array.from(map.values());

  return result.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (isNaN(timeA) || isNaN(timeB)) return 0;
    if (timeA !== timeB) return timeA - timeB; // Chronological: Oldest at index 0, newest at bottom
    const idA = a.id || a.temporaryId || '';
    const idB = b.id || b.temporaryId || '';
    return idA.localeCompare(idB);
  });
}

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryConvId = searchParams.get('id') || searchParams.get('conversationId');

  const { user } = useAuth();
  const {
    connectionStatus,
    isConnected,
    isReady,
    presence: myPresence,
    conversations,
    isLoadingConversations,
    activeConversationId,
    setActiveConversationId,
    setUserStatus,
    sendTyping,
    typingUsers,
    incomingMessage,
    incomingReaction,
    refreshConversations,
    startCall,
    callState,
    meetingState,
    activeGroupMeetings,
    openMeetingLobby,
    startMeeting,
    joinMeeting,
    refreshActiveMeeting,
  } = useCollaboration();

  const [activeConv, setActiveConv] = useState<Conversation | null>(null);

  const displayedConv = useMemo(() => {
    if (activeConv) return activeConv;
    if (!activeConversationId) return null;
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [activeConv, activeConversationId, conversations]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [tab, setTab] = useState<'ALL' | 'DIRECT' | 'GROUP'>('ALL');

  // New Chat Modal State (Direct Chat & Group Chat)
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [searchDirectQuery, setSearchDirectQuery] = useState('');
  const [startingDirectUserId, setStartingDirectUserId] = useState<string | null>(null);

  // New Group Chat Form State
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [directoryList, setDirectoryList] = useState<PeopleDirectoryItem[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Group Details & Member Management State
  const [isGroupDetailsOpen, setIsGroupDetailsOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<string[]>([]);
  const [searchAddMemberQuery, setSearchAddMemberQuery] = useState('');
  const [addingMembers, setAddingMembers] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [removingMemberUserId, setRemovingMemberUserId] = useState<string | null>(null);
  const [leavingGroup, setLeavingGroup] = useState(false);

  // Active Floating Actions & Reaction Popover State
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState<string | null>(null);
  const [activeActionMenuMessageId, setActiveActionMenuMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Smooth scroll to quoted original message with glowing highlight
  const handleScrollToMessage = useCallback((targetMsgId: string) => {
    if (!targetMsgId) return;
    const el = document.getElementById(`msg-${targetMsgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(targetMsgId);
      setTimeout(() => {
        setHighlightedMessageId((prev) => (prev === targetMsgId ? null : prev));
      }, 2500);
    }
  }, []);

  // Global dismissal for floating menus on Escape or Outside Click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveReactionPickerMessageId(null);
        setActiveActionMenuMessageId(null);
        setHoveredMessageId(null);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        !target.closest('.message-action-bar') &&
        !target.closest('.message-reaction-picker') &&
        !target.closest('.message-bubble-container')
      ) {
        setActiveReactionPickerMessageId(null);
        setActiveActionMenuMessageId(null);
        setHoveredMessageId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const [hasUnseenNewMessages, setHasUnseenNewMessages] = useState<boolean>(false);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // In-memory session cache for instant conversation switching without network delay
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  const convDetailsCacheRef = useRef<Map<string, Conversation>>(new Map());

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Load directory on mount for resilient sender resolution and new chat modal
  useEffect(() => {
    collaborationApi
      .getPeopleDirectory()
      .then((res) => {
        if (res?.people) {
          setDirectoryList(res.people);
        }
      })
      .catch(() => {});
  }, []);

  // Authoritative conversation display title resolver
  const getConversationTitle = useCallback(
    (conv: Conversation | null | undefined): string => {
      if (!conv) return 'Chat';
      if (conv.type === 'GROUP') {
        return conv.title || 'Group Chat';
      }
      // For DIRECT chat:
      if (
        conv.otherUser?.displayName &&
        conv.otherUser.displayName !== 'Colleague' &&
        conv.otherUser.displayName !== 'Team Member' &&
        conv.otherUser.displayName !== 'Employee'
      ) {
        return conv.otherUser.displayName;
      }
      if (conv.members && user?.id) {
        const otherMember = conv.members.find((m) => m.userId !== user.id);
        const otherU = (otherMember as any)?.user;
        if (otherU?.employee?.firstName || otherU?.employee?.lastName) {
          return `${otherU.employee.firstName || ''} ${otherU.employee.lastName || ''}`.trim();
        }
        if (
          otherU?.displayName &&
          otherU.displayName !== 'Colleague' &&
          otherU.displayName !== 'Team Member'
        ) {
          return otherU.displayName;
        }
        if (otherU?.email) {
          if (otherU.role === 'SUPER_ADMIN' || otherU.email.toLowerCase().startsWith('admin@')) {
            return 'Super Admin';
          }
          const local = otherU.email.split('@')[0];
          return local.charAt(0).toUpperCase() + local.slice(1);
        }
      }
      // Check directory cache
      const otherUid = conv.directUserAId === user?.id ? conv.directUserBId : conv.directUserAId;
      if (otherUid) {
        const person = directoryList.find((p) => p.userId === otherUid);
        if (person?.displayName) return person.displayName;
      }
      if (conv.otherUser?.email) {
        if (conv.otherUser.email.toLowerCase().startsWith('admin@')) {
          return 'Super Admin';
        }
        const local = conv.otherUser.email.split('@')[0];
        return local.charAt(0).toUpperCase() + local.slice(1);
      }
      return 'Direct Chat';
    },
    [user?.id, directoryList]
  );

  // Authoritative sender display name resolver for message bubbles
  const getSenderName = useCallback(
    (msg: Message): string => {
      if (msg.senderUserId === user?.id) return 'You';

      // 1. Direct sender display name if non-generic
      if (
        msg.sender?.displayName &&
        msg.sender.displayName !== 'Colleague' &&
        msg.sender.displayName !== 'Team Member' &&
        msg.sender.displayName !== 'Employee'
      ) {
        return msg.sender.displayName;
      }

      // 2. Sender employee object
      const emp = msg.sender?.employee as any;
      if (emp?.firstName || emp?.lastName) {
        return `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
      }

      // 3. Sender email
      if (msg.sender?.email) {
        if (msg.sender.email.toLowerCase().startsWith('admin@')) return 'Super Admin';
        const local = msg.sender.email.split('@')[0];
        return local.charAt(0).toUpperCase() + local.slice(1);
      }

      // 4. Look up in active conversation members
      if (displayedConv?.members) {
        const member = displayedConv.members.find((m) => m.userId === msg.senderUserId);
        const memberUser = (member as any)?.user;
        if (memberUser?.employee?.firstName || memberUser?.employee?.lastName) {
          return `${memberUser.employee.firstName || ''} ${memberUser.employee.lastName || ''}`.trim();
        }
        if (
          memberUser?.displayName &&
          memberUser.displayName !== 'Colleague' &&
          memberUser.displayName !== 'Team Member'
        ) {
          return memberUser.displayName;
        }
        if (memberUser?.email) {
          if (
            memberUser.role === 'SUPER_ADMIN' ||
            memberUser.email.toLowerCase().startsWith('admin@')
          ) {
            return 'Super Admin';
          }
          const local = memberUser.email.split('@')[0];
          return local.charAt(0).toUpperCase() + local.slice(1);
        }
      }

      // 5. Look up in directoryList
      const person = directoryList.find((p) => p.userId === msg.senderUserId);
      if (person?.displayName && person.displayName !== 'Colleague') {
        return person.displayName;
      }
      if (person?.email) {
        if (person.email.toLowerCase().startsWith('admin@')) return 'Super Admin';
        const local = person.email.split('@')[0];
        return local.charAt(0).toUpperCase() + local.slice(1);
      }

      return 'Team Member';
    },
    [user?.id, displayedConv?.members, directoryList]
  );

  // Scroll helper with boundary awareness
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceToBottom < 80;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setHasUnseenNewMessages(false);
    }
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (!messagesContainerRef.current) return;
    if (smooth) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    setHasUnseenNewMessages(false);
    isNearBottomRef.current = true;
  }, []);

  // Switch conversation with clean state transition and URL synchronization
  const handleSelectConversation = useCallback(
    (convId: string | null) => {
      if (convId === activeConversationId) return;
      setActiveConversationId(convId);
      setReplyingTo(null);
      setEditingMessage(null);
      setHasUnseenNewMessages(false);
      isNearBottomRef.current = true;

      if (convId) {
        // Fast instant render from session cache (<5ms)
        const cachedConv = convDetailsCacheRef.current.get(convId) || null;
        const cachedMsgs = messagesCacheRef.current.get(convId);

        setActiveConv(cachedConv);
        if (cachedMsgs && cachedMsgs.length > 0) {
          setMessages(cachedMsgs);
          setLoadingMessages(false);
          setTimeout(() => scrollToBottom(false), 0);
        } else {
          setMessages([]);
          setLoadingMessages(true);
        }
        window.history.replaceState(null, '', `/chat?id=${convId}`);
      } else {
        setActiveConv(null);
        setMessages([]);
        window.history.replaceState(null, '', `/chat`);
      }
    },
    [activeConversationId, setActiveConversationId, scrollToBottom]
  );

  // Sync initial query parameter with active conversation without overriding user selections
  useEffect(() => {
    if (queryConvId && queryConvId !== activeConversationId) {
      setActiveConversationId(queryConvId);
      const cachedConv = convDetailsCacheRef.current.get(queryConvId) || null;
      const cachedMsgs = messagesCacheRef.current.get(queryConvId);

      setActiveConv(cachedConv);
      if (cachedMsgs && cachedMsgs.length > 0) {
        setMessages(cachedMsgs);
        setLoadingMessages(false);
      } else {
        setMessages([]);
        setLoadingMessages(true);
      }
    }
  }, [queryConvId]);

  // Load active conversation details & messages (race-safe)
  useEffect(() => {
    if (!activeConversationId) {
      setActiveConv(null);
      setMessages([]);
      return;
    }

    let isSubscribed = true;
    const currentReqConvId = activeConversationId;
    const hasCached = messagesCacheRef.current.has(currentReqConvId);
    if (!hasCached) {
      setLoadingMessages(true);
    }

    async function loadData() {
      try {
        const [convRes, msgRes] = await Promise.all([
          collaborationApi.getConversationById(currentReqConvId),
          collaborationApi.getConversationMessages(currentReqConvId, { limit: 50 }),
        ]);

        if (isSubscribed && activeConversationId === currentReqConvId) {
          if (convRes?.conversation) {
            setActiveConv(convRes.conversation);
            convDetailsCacheRef.current.set(currentReqConvId, convRes.conversation);
            if (convRes.conversation.type === 'GROUP') {
              refreshActiveMeeting(currentReqConvId);
            }
          }
          if (msgRes?.messages) {
            // Canonical chronological ASC sort (oldest at top, newest at bottom)
            const sorted = normalizeAndSortMessages(msgRes.messages);
            setMessages(sorted);
            messagesCacheRef.current.set(currentReqConvId, sorted);
            setTimeout(() => {
              scrollToBottom(false);
            }, 0);
          }
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
      } finally {
        if (isSubscribed && activeConversationId === currentReqConvId) {
          setLoadingMessages(false);
          setTimeout(() => {
            composerInputRef.current?.focus();
          }, 50);
        }
      }
    }

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, [activeConversationId, scrollToBottom]);

  // Handle incoming real-time messages for active conversation with deduplication & optimistic reconciliation
  useEffect(() => {
    if (!incomingMessage) return;
    if (incomingMessage.conversationId === activeConversationId) {
      const newMsg = incomingMessage.message;
      setMessages((prev) => {
        // Check if already in list by authoritative id
        const existsById = prev.some((m) => m.id === newMsg.id);
        if (existsById) return prev;

        // Check if this server message matches a pending optimistic message from current user
        const tempIdx = prev.findIndex(
          (m) =>
            (m.status === 'SENDING' || m.temporaryId) &&
            m.senderUserId === user?.id &&
            m.body === newMsg.body &&
            Math.abs(new Date(m.createdAt).getTime() - new Date(newMsg.createdAt).getTime()) < 20000
        );

        if (tempIdx >= 0) {
          const copy = [...prev];
          copy[tempIdx] = { ...newMsg, status: 'SENT' };
          return normalizeAndSortMessages(copy);
        }

        return normalizeAndSortMessages([...prev, newMsg]);
      });

      // Auto-scroll if user is near bottom or if it's the user's own message
      if (newMsg.senderUserId === user?.id || isNearBottomRef.current) {
        setTimeout(() => {
          scrollToBottom(true);
        }, 20);
      } else {
        setHasUnseenNewMessages(true);
      }

      // Mark as read immediately if actively viewing
      collaborationApi.markConversationAsRead(activeConversationId).catch(() => {});
    }
  }, [incomingMessage, activeConversationId, user?.id, scrollToBottom]);

  // Handle incoming real-time reactions
  useEffect(() => {
    if (!incomingReaction) return;
    if (incomingReaction.conversationId === activeConversationId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === incomingReaction.messageId
            ? { ...m, reactions: incomingReaction.reactions }
            : m
        )
      );
    }
  }, [incomingReaction, activeConversationId]);

  // Open New Chat modal (refreshes directory list)
  const handleOpenNewChatModal = async (initialTab: 'DIRECT' | 'GROUP' = 'DIRECT') => {
    setNewChatTab(initialTab);
    setSearchDirectQuery('');
    setGroupError(null);
    setIsNewChatModalOpen(true);
    try {
      const res = await collaborationApi.getPeopleDirectory();
      if (res?.people) {
        setDirectoryList(res.people);
      }
    } catch (err) {
      console.error('Failed to refresh directory:', err);
    }
  };

  // Start 1:1 Direct Chat with selected colleague
  const handleStartDirectChat = async (targetUserId: string) => {
    try {
      setStartingDirectUserId(targetUserId);
      const res = await collaborationApi.getOrCreateDirectConversation(targetUserId);
      if (res?.conversation) {
        setIsNewChatModalOpen(false);
        await refreshConversations();
        handleSelectConversation(res.conversation.id);
      }
    } catch (err: any) {
      console.error('Failed to start direct chat:', err);
    } finally {
      setStartingDirectUserId(null);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim() || selectedMemberIds.length === 0) return;

    try {
      setCreatingGroup(true);
      setGroupError(null);
      const res = await collaborationApi.createGroupConversation({
        title: groupTitle.trim(),
        description: groupDesc.trim() || null,
        memberUserIds: selectedMemberIds,
      });

      if (res?.conversation) {
        setIsNewChatModalOpen(false);
        setGroupTitle('');
        setGroupDesc('');
        setSelectedMemberIds([]);
        await refreshConversations();
        handleSelectConversation(res.conversation.id);
      }
    } catch (err: any) {
      console.error('Failed to create group:', err);
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Failed to create group';
      setGroupError(msg);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAddMembers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversationId || selectedAddMemberIds.length === 0) return;

    try {
      setAddingMembers(true);
      setAddMemberError(null);
      for (const targetUserId of selectedAddMemberIds) {
        await collaborationApi.addGroupMember(activeConversationId, targetUserId);
      }
      setIsAddMemberModalOpen(false);
      setSelectedAddMemberIds([]);
      setSearchAddMemberQuery('');
      const updatedConv = await collaborationApi.getConversationById(activeConversationId);
      if (updatedConv?.conversation) {
        setActiveConv(updatedConv.conversation);
      }
      await refreshConversations();
    } catch (err: any) {
      console.error('Failed to add member:', err);
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Failed to add member to group';
      setAddMemberError(msg);
    } finally {
      setAddingMembers(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!activeConversationId || removingMemberUserId) return;
    try {
      setRemovingMemberUserId(targetUserId);
      await collaborationApi.removeGroupMember(activeConversationId, targetUserId);
      const updatedConv = await collaborationApi.getConversationById(activeConversationId);
      if (updatedConv?.conversation) {
        setActiveConv(updatedConv.conversation);
      }
      await refreshConversations();
    } catch (err: any) {
      console.error('Failed to remove member:', err);
    } finally {
      setRemovingMemberUserId(null);
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeConversationId || leavingGroup) return;
    try {
      setLeavingGroup(true);
      await collaborationApi.leaveGroupConversation(activeConversationId);
      setIsGroupDetailsOpen(false);
      handleSelectConversation(null);
      await refreshConversations();
    } catch (err: any) {
      console.error('Failed to leave group:', err);
    } finally {
      setLeavingGroup(false);
    }
  };

  // Optimistic message send + server confirmation flow
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageText.trim() || !activeConversationId || !user || sending) return;

    const textToSend = messageText.trim();
    const replyId = replyingTo?.id || null;
    const replySnapshot = replyingTo ? { ...replyingTo } : undefined;

    // Immediately clear input & typing so user can keep typing
    setMessageText('');
    setReplyingTo(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(activeConversationId, false);

    const temporaryId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientNow = new Date().toISOString();

    // 1. Create optimistic client-side message
    const optimisticMsg: Message = {
      id: temporaryId,
      temporaryId,
      conversationId: activeConversationId,
      senderUserId: user.id,
      sender: {
        id: user.id,
        email: user.email || '',
        displayName: (user as any).displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'You',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        profilePhotoUrl: (user as any).profilePhotoUrl || null,
      },
      body: textToSend,
      replyToMessageId: replyId,
      replyTo: replySnapshot,
      status: 'SENDING',
      createdAt: clientNow,
    };

    // 2. Render optimistic message immediately in canonical order
    setMessages((prev) => normalizeAndSortMessages([...prev, optimisticMsg]));
    setTimeout(() => {
      scrollToBottom(true);
    }, 10);

    try {
      setSending(true);
      const res = await collaborationApi.sendMessage(activeConversationId, {
        body: textToSend,
        replyToMessageId: replyId,
      });

      if (res?.message) {
        // 3. Reconcile temporary message with server-confirmed message
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === temporaryId || m.temporaryId === temporaryId
              ? { ...res.message, status: 'SENT' as const }
              : m
          );
          return normalizeAndSortMessages(updated);
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      // Mark temporary message as failed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === temporaryId || m.temporaryId === temporaryId
            ? { ...m, status: 'FAILED' as const }
            : m
        )
      );
    } finally {
      setSending(false);
      composerInputRef.current?.focus();
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    try {
      const res = await collaborationApi.toggleReaction(messageId, emoji);
      if (res?.reactions) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m))
        );
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  };

  const handleEditMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage || !editText.trim()) return;

    try {
      const res = await collaborationApi.editMessage(editingMessage.id, { body: editText.trim() });
      if (res?.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === editingMessage.id ? { ...m, body: res.message.body, editedAt: res.message.editedAt } : m))
        );
      }
      setEditingMessage(null);
      setEditText('');
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await collaborationApi.deleteMessage(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m))
      );
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleTypingChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (activeConversationId) {
      if (e.target.value.trim().length > 0) {
        sendTyping(activeConversationId, true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          if (activeConversationIdRef.current) {
            sendTyping(activeConversationIdRef.current, false);
          }
        }, 1800);
      } else {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        sendTyping(activeConversationId, false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Tab filter
      if (tab === 'DIRECT' && c.type !== 'DIRECT') return false;
      if (tab === 'GROUP' && c.type !== 'GROUP') return false;

      // Search filter
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const title = getConversationTitle(c).toLowerCase();
        const lastMsg = resolveMessagePreview(c.lastMessage).toLowerCase();
        return title.includes(q) || lastMsg.includes(q);
      }

      return true;
    });
  }, [conversations, tab, searchFilter, getConversationTitle]);

  // Active conversation's typing users computation
  const typingSummary = useMemo(() => {
    if (!activeConversationId) return null;
    const activeTypingMap = typingUsers[activeConversationId] || {};
    const names = Object.values(activeTypingMap)
      .filter((u) => u && u.displayName)
      .map((u) => u.displayName);

    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names[0]} and ${names.length - 1} others are typing…`;
  }, [activeConversationId, typingUsers]);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      {/* Main Collaboration Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Conversation List */}
        <div
          className={`w-full md:w-80 lg:w-96 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col shrink-0 transition-all ${
            activeConversationId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header & Presence */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-bold text-sm shadow-sm">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Chats</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <PresenceSelector presence={myPresence} onStatusChange={setUserStatus} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-600 dark:text-zinc-300"
                  onClick={() => handleOpenNewChatModal('DIRECT')}
                  title="New Chat (Direct or Group)"
                  aria-label="New Chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <Input
                type="text"
                placeholder="Search conversations..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 pl-8 text-xs bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-950 p-0.5 text-xs font-medium">
              {(['ALL', 'DIRECT', 'GROUP'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 py-1 text-center rounded-md transition-all ${
                    tab === t
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-semibold'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t === 'ALL' ? 'All' : t === 'DIRECT' ? 'Direct' : 'Groups'}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {isLoadingConversations && conversations.length === 0 ? (
              <div className="p-3 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
                      <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 dark:text-zinc-500">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-medium">No conversations found</p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Start a direct chat or create a new group.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenNewChatModal('DIRECT')}
                  className="mt-3 text-xs gap-1.5 border-zinc-300 dark:border-zinc-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Chat
                </Button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = activeConversationId === conv.id;
                const isDirect = conv.type === 'DIRECT';
                const title = getConversationTitle(conv);
                const initials = title
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                const unread = conv.unreadCount || 0;
                const presenceStatus = conv.otherUser?.presence?.status || 'OFFLINE';
                const previewText = resolveMessagePreview(conv.lastMessage);

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`p-3 flex items-start gap-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-zinc-100 dark:bg-zinc-800/80 border-l-2 border-zinc-900 dark:border-white'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {isDirect ? (
                        conv.otherUser?.profilePhotoUrl ? (
                          <img
                            src={conv.otherUser.profilePhotoUrl}
                            alt={title}
                            className="h-10 w-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-xs shadow-inner">
                            {initials}
                          </div>
                        )
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-xs shadow-sm">
                          <Users className="h-5 w-5" />
                        </div>
                      )}
                      {isDirect && (
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <PresenceBadge status={presenceStatus} size="sm" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-sm truncate ${
                            unread > 0
                              ? 'font-bold text-zinc-900 dark:text-zinc-100'
                              : 'font-medium text-zinc-800 dark:text-zinc-200'
                          }`}
                        >
                          {title}
                        </span>
                        {conv.type === 'GROUP' && activeGroupMeetings[conv.id] && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Meeting
                          </span>
                        )}
                        {conv.lastMessageAt && (
                          <span className="text-[10px] text-zinc-400 shrink-0">
                            {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p
                          className={`text-xs truncate ${
                            unread > 0
                              ? 'text-zinc-900 dark:text-zinc-100 font-medium'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {previewText}
                        </p>
                        {unread > 0 && (
                          <span className="h-4 min-w-[16px] px-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Conversation */}
        <div
          className={`flex-1 flex flex-col bg-zinc-50/50 dark:bg-zinc-950 overflow-hidden ${
            !activeConversationId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {displayedConv ? (
            <>
              {/* Reconnection status banner */}
              {connectionStatus === 'RECONNECTING' && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 text-center text-xs text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1.5 shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Reconnecting to collaboration server...</span>
                </div>
              )}

              {/* Active Header */}
              <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 flex items-center justify-between shrink-0">
                <div
                  className={`flex items-center gap-3 min-w-0 ${
                    displayedConv.type === 'GROUP'
                      ? 'cursor-pointer group p-1 -ml-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors'
                      : ''
                  }`}
                  onClick={() => {
                    if (displayedConv.type === 'GROUP') {
                      setIsGroupDetailsOpen(true);
                    }
                  }}
                  title={displayedConv.type === 'GROUP' ? 'Click to view group details & members' : undefined}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectConversation(null);
                    }}
                    className="md:hidden p-1 -ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <div className="relative">
                    {displayedConv.type === 'DIRECT' ? (
                      displayedConv.otherUser?.profilePhotoUrl ? (
                        <img
                          src={displayedConv.otherUser.profilePhotoUrl}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-xs">
                          {getConversationTitle(displayedConv).slice(0, 2).toUpperCase()}
                        </div>
                      )
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-xs shadow-sm">
                        <Users className="h-4 w-4" />
                      </div>
                    )}
                    {displayedConv.type === 'DIRECT' && (
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <PresenceBadge
                          status={displayedConv.otherUser?.presence?.status || 'OFFLINE'}
                          size="sm"
                        />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                      <span>{getConversationTitle(displayedConv)}</span>
                      {displayedConv.type === 'GROUP' && (
                        <Info className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 shrink-0" />
                      )}
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {displayedConv.type === 'DIRECT' ? (
                        displayedConv.otherUser?.presence?.customStatusMessage ? (
                          `"${displayedConv.otherUser.presence.customStatusMessage}"`
                        ) : (
                          displayedConv.otherUser?.employee?.designation?.name || 'Colleague'
                        )
                      ) : (
                        <span className="hover:underline font-medium text-zinc-600 dark:text-zinc-300">
                          {displayedConv.members?.length || 0} {displayedConv.members?.length === 1 ? 'member' : 'members'} • View details
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {displayedConv.type === 'DIRECT' && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!isConnected || callState !== 'IDLE'}
                        onClick={() => {
                          const targetUserId =
                            displayedConv.otherUser?.id ||
                            displayedConv.members?.find((m) => m.userId !== user?.id)?.userId ||
                            (displayedConv.directUserAId === user?.id
                              ? displayedConv.directUserBId
                              : displayedConv.directUserAId);
                          if (targetUserId) {
                            startCall({
                              conversationId: displayedConv.id,
                              targetUserId,
                              targetUserName: getConversationTitle(displayedConv),
                              targetUserAvatar: displayedConv.otherUser?.profilePhotoUrl || null,
                              callType: 'AUDIO',
                            });
                          }
                        }}
                        className="h-8 w-8 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white disabled:opacity-40"
                        title={
                          !isConnected
                            ? 'Connecting to collaboration server...'
                            : callState !== 'IDLE'
                            ? 'Call in progress'
                            : 'Start Audio Call'
                        }
                        aria-label="Start Audio Call"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!isConnected || callState !== 'IDLE'}
                        onClick={() => {
                          const targetUserId =
                            displayedConv.otherUser?.id ||
                            displayedConv.members?.find((m) => m.userId !== user?.id)?.userId ||
                            (displayedConv.directUserAId === user?.id
                              ? displayedConv.directUserBId
                              : displayedConv.directUserAId);
                          if (targetUserId) {
                            startCall({
                              conversationId: displayedConv.id,
                              targetUserId,
                              targetUserName: getConversationTitle(displayedConv),
                              targetUserAvatar: displayedConv.otherUser?.profilePhotoUrl || null,
                              callType: 'VIDEO',
                            });
                          }
                        }}
                        className="h-8 w-8 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white disabled:opacity-40"
                        title={
                          !isConnected
                            ? 'Connecting to collaboration server...'
                            : callState !== 'IDLE'
                            ? 'Call in progress'
                            : 'Start Video Call'
                        }
                        aria-label="Start Video Call"
                      >
                        <Video className="h-4 w-4" />
                      </Button>
                    </>
                  )}

                  {displayedConv.type === 'GROUP' && (
                    <>
                      {activeGroupMeetings[displayedConv.id] ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!isConnected || meetingState !== 'IDLE' || callState !== 'IDLE'}
                          onClick={() =>
                            openMeetingLobby({
                              type: 'JOIN',
                              conversationId: displayedConv.id,
                              meetingId: activeGroupMeetings[displayedConv.id].meetingId,
                              title: displayedConv.title || 'Group Meeting',
                            })
                          }
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow disabled:opacity-40"
                          title="Join ongoing group meeting"
                          aria-label="Join Meeting"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                          </span>
                          <Video className="h-3.5 w-3.5" />
                          <span>Join Meeting</span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!isConnected || meetingState !== 'IDLE' || callState !== 'IDLE'}
                          onClick={() =>
                            openMeetingLobby({
                              type: 'START',
                              conversationId: displayedConv.id,
                              title: displayedConv.title || 'Group Meeting',
                            })
                          }
                          className="h-8 text-xs gap-1.5 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
                          title={
                            !isConnected
                              ? 'Connecting to collaboration server...'
                              : meetingState !== 'IDLE' || callState !== 'IDLE'
                              ? 'Call or meeting in progress'
                              : 'Start Group Meeting'
                          }
                          aria-label="Start Group Meeting"
                        >
                          {meetingState === 'STARTING' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Video className="h-3.5 w-3.5" />
                          )}
                          <span>Start Meeting</span>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsAddMemberModalOpen(true)}
                        className="h-8 text-xs gap-1 text-zinc-600 dark:text-zinc-300"
                        title="Add member to group"
                        aria-label="Add Member"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Add Member</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Messages Container */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-3 relative"
              >
                {loadingMessages && messages.length === 0 ? (
                  <div className="space-y-4 py-6 px-2">
                    <div className="flex items-start gap-3 max-w-[75%] animate-pulse">
                      <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-24" />
                        <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-2xl w-full" />
                      </div>
                    </div>
                    <div className="flex items-end justify-end gap-3 max-w-[75%] ml-auto animate-pulse">
                      <div className="space-y-1.5 flex-1 flex flex-col items-end">
                        <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded-2xl w-2/3" />
                      </div>
                    </div>
                    <div className="flex items-start gap-3 max-w-[75%] animate-pulse">
                      <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-20" />
                        <div className="h-14 bg-zinc-200 dark:bg-zinc-800 rounded-2xl w-5/6" />
                      </div>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-20 text-zinc-400">
                    <p className="text-sm font-medium">No messages yet</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Send a message below to start collaborating.
                    </p>
                  </div>
                ) : (
                  messages.map((msg, msgIndex) => {
                    // Render Dedicated Persistent Meeting Ended Card / System Message
                    if (msg.isSystem || (typeof msg.body === 'string' && msg.body.includes('"type":"MEETING_SUMMARY"'))) {
                      const summary = parseSystemMessage(msg.body) as MeetingSummaryPayload | null;

                      if (summary && summary.type === 'MEETING_SUMMARY') {
                        const durSeconds = summary.durationSeconds || 0;
                        const durMins = Math.floor(durSeconds / 60);
                        const remSecs = durSeconds % 60;
                        const durText =
                          durSeconds < 60
                            ? `${durSeconds}s`
                            : durMins >= 60
                            ? `${Math.floor(durMins / 60)}h ${durMins % 60}m`
                            : `${durMins}m ${remSecs > 0 ? `${remSecs}s` : ''}`.trim();

                        const startTimeStr = summary.startedAt
                          ? new Date(summary.startedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '';
                        const endTimeStr = summary.endedAt
                          ? new Date(summary.endedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '';
                        const timeRange =
                          startTimeStr && endTimeStr ? `${startTimeStr} – ${endTimeStr}` : startTimeStr || '';

                        const participantNames: string[] = Array.isArray(summary.participantNames) && summary.participantNames.length > 0
                          ? summary.participantNames
                          : Array.isArray(summary.participants)
                          ? summary.participants.map((p: any) => p?.displayName || p?.name || 'Participant')
                          : [];

                        return (
                          <div
                            key={msg.id || msg.temporaryId}
                            id={`msg-${msg.id || msg.temporaryId}`}
                            className="w-full flex justify-center my-3 select-none"
                          >
                            <div className="w-full max-w-sm sm:max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm p-4 space-y-3">
                              {/* Card Header */}
                              <div className="flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                    <Video className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                        Meeting ended
                                      </span>
                                    </div>
                                    <h4 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mt-0.5">
                                      {summary.title || 'Group Meeting'}
                                    </h4>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                                    {durText}
                                  </span>
                                  {timeRange && (
                                    <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">{timeRange}</p>
                                  )}
                                </div>
                              </div>

                              {/* Host & Participants Details */}
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-zinc-400">Host</span>
                                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                    {summary.hostName || 'Host'}
                                  </span>
                                </div>

                                {participantNames.length > 0 && (
                                  <div className="space-y-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-zinc-400">Participants</span>
                                      <span className="font-mono text-[10px] text-zinc-500">
                                        {participantNames.length} {participantNames.length === 1 ? 'member' : 'members'}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {participantNames.map((name, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-medium"
                                        >
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Generic System message
                      return (
                        <div
                          key={msg.id || msg.temporaryId}
                          id={`msg-${msg.id || msg.temporaryId}`}
                          className="w-full flex justify-center my-2 select-none"
                        >
                          <span className="px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                            {resolveMessagePreview(msg)}
                          </span>
                        </div>
                      );
                    }

                    const isOwn = msg.senderUserId === user?.id;
                    const isDeleted = Boolean(msg.deletedAt);
                    const senderName = getSenderName(msg);
                    const isReactionPickerOpen = activeReactionPickerMessageId === msg.id;
                    const isActionMenuOpen = activeActionMenuMessageId === msg.id;
                    const isHovered = hoveredMessageId === msg.id;
                    const isBarVisible = isHovered || isActionMenuOpen || isReactionPickerOpen;
                    const isTopMessage = msgIndex < 2;
                    const isHighlighted = highlightedMessageId === msg.id;

                    return (
                      <div
                        key={msg.id || msg.temporaryId}
                        id={`msg-${msg.id || msg.temporaryId}`}
                        tabIndex={0}
                        onMouseEnter={() => setHoveredMessageId(msg.id)}
                        onMouseLeave={() =>
                          setHoveredMessageId((prev) => (prev === msg.id ? null : prev))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setActiveReactionPickerMessageId(null);
                            setActiveActionMenuMessageId(null);
                            setHoveredMessageId(null);
                          }
                        }}
                        className={`relative group/msg flex flex-col py-1 outline-none transition-all duration-300 ${
                          isOwn ? 'items-end' : 'items-start'
                        }`}
                      >
                        {/* Sender name for group chats */}
                        {!isOwn && displayedConv.type === 'GROUP' && (
                          <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 ml-1 mb-0.5 select-none">
                            {senderName}
                          </span>
                        )}

                        <div className="message-bubble-container relative inline-block max-w-[85%] sm:max-w-md md:max-w-lg">
                          {/* Message Bubble */}
                          <div
                            onClick={() => {
                              // On touch/mobile devices or clicks, allow toggling action bar without shifting layout
                              if (!isDeleted && msg.status !== 'SENDING' && msg.status !== 'FAILED') {
                                setActiveActionMenuMessageId((prev) => (prev === msg.id ? null : msg.id));
                              }
                            }}
                            className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm transition-all cursor-pointer sm:cursor-default ${
                              isHighlighted
                                ? 'ring-2 ring-blue-500 dark:ring-blue-400 shadow-lg scale-[1.01]'
                                : ''
                            } ${
                              isOwn
                                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-br-sm'
                                : 'bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-800 rounded-bl-sm'
                            }`}
                          >
                            {/* WhatsApp-Style Quoted Reply Preview */}
                            {msg.replyTo && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (msg.replyTo?.id) {
                                    handleScrollToMessage(msg.replyTo.id);
                                  }
                                }}
                                className={`mb-1.5 p-2 rounded-lg text-xs border-l-4 cursor-pointer transition-all hover:opacity-95 select-none ${
                                  isOwn
                                    ? 'bg-white/15 border-white/70 text-zinc-100'
                                    : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-500 dark:border-zinc-400 text-zinc-700 dark:text-zinc-200'
                                }`}
                                title="Click to view original message"
                              >
                                <div className="font-semibold text-[11px] flex items-center gap-1.5 mb-0.5">
                                  <CornerDownRight className="h-3 w-3 opacity-70 shrink-0" />
                                  <span className="truncate">
                                    {msg.replyTo.sender?.displayName || 'Message'}
                                  </span>
                                </div>
                                <p className="truncate text-[11px] opacity-90 pl-4 font-normal">
                                  {msg.replyTo.deletedAt
                                    ? 'This message was deleted'
                                    : resolveMessagePreview(msg.replyTo)}
                                </p>
                              </div>
                            )}

                            {/* Message Body */}
                            <div className="whitespace-pre-wrap break-words leading-relaxed">
                              {isDeleted ? (
                                <span className="italic text-xs opacity-60">
                                  This message was deleted
                                </span>
                              ) : (
                                msg.body
                              )}
                            </div>

                            {/* Footer Meta */}
                            <div
                              className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none ${
                                isOwn ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-400'
                              }`}
                            >
                              {msg.editedAt && !isDeleted && <span>(edited)</span>}
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {isOwn && (
                                msg.status === 'SENDING' ? (
                                  <Clock className="h-3 w-3 opacity-60 animate-pulse" />
                                ) : msg.status === 'FAILED' ? (
                                  <span className="text-red-400 font-medium flex items-center gap-0.5">
                                    <AlertCircle className="h-3 w-3" /> Failed
                                  </span>
                                ) : (
                                  <CheckCheck className="h-3 w-3 opacity-80" />
                                )
                              )}
                            </div>
                          </div>

                          {/* Floating Contextual Actions Toolbar */}
                          {!isDeleted && msg.status !== 'SENDING' && msg.status !== 'FAILED' && (
                            <div
                              className={`message-action-bar absolute -top-3.5 ${
                                isOwn ? 'right-2' : 'left-2'
                              } z-20 flex items-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-md px-1.5 py-0.5 gap-0.5 transition-opacity duration-150 ${
                                isBarVisible
                                  ? 'opacity-100 pointer-events-auto'
                                  : 'opacity-0 pointer-events-none'
                              }`}
                            >
                              {/* Floating Reaction Picker Popover (Edge-Aware: Opens below on top messages, above on others) */}
                              {isReactionPickerOpen && (
                                <div
                                  className={`message-reaction-picker absolute ${
                                    isTopMessage ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
                                  } ${
                                    isOwn ? 'right-0' : 'left-0'
                                  } z-30 flex items-center gap-1 p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-xl max-w-[calc(100vw-32px)] sm:max-w-none animate-in fade-in zoom-in-95 duration-150`}
                                >
                                  {EMOJI_OPTIONS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleReaction(msg.id, emoji);
                                        setActiveReactionPickerMessageId(null);
                                      }}
                                      className="text-base hover:scale-125 active:scale-95 transition-transform p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                      title={`React ${emoji}`}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* React Button (Smile Icon) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveReactionPickerMessageId((prev) => (prev === msg.id ? null : msg.id));
                                }}
                                className={`p-1 rounded-full transition-colors ${
                                  isReactionPickerOpen
                                    ? 'bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                }`}
                                title="Add reaction"
                              >
                                <Smile className="h-3.5 w-3.5" />
                              </button>

                              {/* Reply Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReplyingTo(msg);
                                  setActiveReactionPickerMessageId(null);
                                  setActiveActionMenuMessageId(null);
                                  composerInputRef.current?.focus();
                                }}
                                className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                title="Reply"
                              >
                                <CornerDownRight className="h-3.5 w-3.5" />
                              </button>

                              {/* Edit Button (Own message only) */}
                              {isOwn && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingMessage(msg);
                                    setEditText(msg.body);
                                    setActiveReactionPickerMessageId(null);
                                    setActiveActionMenuMessageId(null);
                                  }}
                                  className="p-1 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Delete Button (Own message or admin) */}
                              {(isOwn || user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMessage(msg.id);
                                    setActiveReactionPickerMessageId(null);
                                    setActiveActionMenuMessageId(null);
                                  }}
                                  className="p-1 rounded-full text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Reactions Bar attached under message */}
                        {msg.reactions && msg.reactions.length > 0 && !isDeleted && (
                          <div
                            className={`flex flex-wrap gap-1 mt-1 max-w-[85%] sm:max-w-md md:max-w-lg ${
                              isOwn ? 'justify-end pr-1' : 'justify-start pl-1'
                            }`}
                          >
                            {Array.from(new Set(msg.reactions.map((r) => r.reaction))).map(
                              (emoji) => {
                                const count = msg.reactions!.filter(
                                  (r) => r.reaction === emoji
                                ).length;
                                const isUserReacted = msg.reactions!.some(
                                  (r) => r.reaction === emoji && r.userId === user?.id
                                );

                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleToggleReaction(msg.id, emoji)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                                      isUserReacted
                                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 shadow-sm'
                                        : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 shadow-sm'
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span className="text-[10px] font-bold">{count}</span>
                                  </button>
                                );
                              }
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />

                {/* Floating "New Messages" Jump Pill */}
                {hasUnseenNewMessages && (
                  <div className="sticky bottom-2 flex justify-center z-20 pointer-events-none">
                    <button
                      type="button"
                      onClick={() => scrollToBottom(true)}
                      className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg text-xs font-semibold hover:scale-105 transition-all animate-bounce"
                    >
                      <span>New messages</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Typing Indicator */}
              {typingSummary && (
                <div className="px-4 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 transition-opacity">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{typingSummary}</span>
                  <span className="inline-flex gap-0.5 ml-0.5 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce [animation-delay:0.4s]" />
                  </span>
                </div>
              )}

              {/* Reply Banner */}
              {replyingTo && (
                <div className="bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <CornerDownRight className="h-4 w-4 text-zinc-500 shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Replying to {getSenderName(replyingTo)}:
                      </span>{' '}
                      <span className="text-zinc-600 dark:text-zinc-400 italic">
                        &ldquo;{resolveMessagePreview(replyingTo)}&rdquo;
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1"
                    title="Cancel reply"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Message Composer */}
              <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      ref={composerInputRef}
                      rows={1}
                      value={messageText}
                      onChange={handleTypingChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                      className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 max-h-32 min-h-[38px]"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="icon"
                    disabled={!messageText.trim() || sending}
                    className="h-9 w-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 shrink-0"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 dark:text-zinc-500">
              <div className="h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mb-4 text-zinc-400">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Teams Collaboration
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm mt-1">
                Select a conversation from the sidebar or start a new direct or group chat.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleOpenNewChatModal('DIRECT')}
                  className="gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  New Chat
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/people')}
                  className="gap-1.5 border-zinc-300 dark:border-zinc-700"
                >
                  <Users className="h-4 w-4" />
                  Browse People
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Message Modal */}
      <Dialog
        isOpen={Boolean(editingMessage)}
        onClose={() => setEditingMessage(null)}
        title="Edit Message"
      >
        <form onSubmit={handleEditMessage} className="space-y-4">
          <Input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Edit your message..."
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditingMessage(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!editText.trim()}>
              Save changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Comprehensive New Chat Modal (Direct 1:1 Message & New Group) */}
      <Dialog
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        title="New Collaboration Chat"
      >
        <div className="space-y-4">
          {/* Modal Tab Switcher */}
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setNewChatTab('DIRECT')}
              className={`flex-1 py-1.5 text-center rounded-md transition-all ${
                newChatTab === 'DIRECT'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Direct Message
            </button>
            <button
              type="button"
              onClick={() => setNewChatTab('GROUP')}
              className={`flex-1 py-1.5 text-center rounded-md transition-all ${
                newChatTab === 'GROUP'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Create Group
            </button>
          </div>

          {newChatTab === 'DIRECT' ? (
            /* Direct Chat Colleague Selector */
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input
                  type="text"
                  placeholder="Search colleague by name, email, role..."
                  value={searchDirectQuery}
                  onChange={(e) => setSearchDirectQuery(e.target.value)}
                  className="pl-8 text-xs"
                  autoFocus
                />
              </div>

              <div className="max-h-64 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/60 p-1">
                {directoryList
                  .filter((colleague) => {
                    if (colleague.userId === user?.id) return false;
                    if (colleague.employmentStatus === 'TERMINATED') return false;
                    if (searchDirectQuery.trim()) {
                      const q = searchDirectQuery.toLowerCase();
                      const name = colleague.displayName.toLowerCase();
                      const email = colleague.email.toLowerCase();
                      const desig = (colleague.designationName || '').toLowerCase();
                      const dept = (colleague.departmentName || '').toLowerCase();
                      return name.includes(q) || email.includes(q) || desig.includes(q) || dept.includes(q);
                    }
                    return true;
                  })
                  .map((colleague) => {
                    const isStarting = startingDirectUserId === colleague.userId;
                    const initials = (colleague.displayName || 'U')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <div
                        key={colleague.userId}
                        onClick={() => !isStarting && handleStartDirectChat(colleague.userId)}
                        className="p-2.5 flex items-center justify-between rounded-lg cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            {colleague.profilePhotoUrl ? (
                              <img
                                src={colleague.profilePhotoUrl}
                                alt={colleague.displayName}
                                className="h-8 w-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-xs">
                                {initials}
                              </div>
                            )}
                            <div className="absolute -bottom-0.5 -right-0.5">
                              <PresenceBadge
                                status={colleague.presence?.status || 'OFFLINE'}
                                size="sm"
                              />
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {colleague.displayName}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                              {colleague.designationName || colleague.departmentName || colleague.email}
                            </div>
                          </div>
                        </div>

                        <div>
                          {isStarting ? (
                            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                          ) : (
                            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200">
                              Start Chat →
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            /* Create Group Form */
            <form onSubmit={handleCreateGroup} className="space-y-3">
              {groupError && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">
                  {groupError}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Group Name *
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Frontend Engineering, Product Q4"
                  value={groupTitle}
                  onChange={(e) => {
                    setGroupTitle(e.target.value);
                    if (groupError) setGroupError(null);
                  }}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Description (optional)
                </label>
                <Input
                  type="text"
                  placeholder="Group purpose or discussion topics"
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Select Members ({selectedMemberIds.length} selected) *
                </label>
                <div className="mt-1 max-h-40 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800 p-1">
                  {directoryList
                    .filter((c) => c.userId !== user?.id && c.employmentStatus !== 'TERMINATED')
                    .map((colleague) => {
                      const isSelected = selectedMemberIds.includes(colleague.userId);
                      return (
                        <div
                          key={colleague.userId}
                          onClick={() => {
                            setSelectedMemberIds((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== colleague.userId)
                                : [...prev, colleague.userId]
                            );
                          }}
                          className={`p-2 flex items-center justify-between rounded-md cursor-pointer text-xs ${
                            isSelected
                              ? 'bg-neutral-100 dark:bg-neutral-800 font-semibold'
                              : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <PresenceBadge
                              status={colleague.presence?.status || 'OFFLINE'}
                              size="sm"
                            />
                            <div>
                              <div className="text-neutral-900 dark:text-neutral-100">
                                {colleague.displayName}
                              </div>
                              <div className="text-[10px] text-neutral-500 font-normal">
                                {colleague.designationName || colleague.email}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <Button type="button" variant="ghost" onClick={() => setIsNewChatModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!groupTitle.trim() || selectedMemberIds.length === 0 || creatingGroup}
                >
                  {creatingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Group
                </Button>
              </div>
            </form>
          )}
        </div>
      </Dialog>

      {/* Group Details / Member Management Modal */}
      <Dialog
        isOpen={isGroupDetailsOpen && activeConv?.type === 'GROUP'}
        onClose={() => setIsGroupDetailsOpen(false)}
        title="Group Details"
      >
        {activeConv && (
          <div className="space-y-4 max-w-md">
            {/* Group Info Header */}
            <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/50">
              <div className="h-12 w-12 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-base shadow-sm shrink-0">
                <Users className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {getConversationTitle(activeConv)}
                </h3>
                {activeConv.description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                    {activeConv.description}
                  </p>
                )}
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 flex items-center gap-1.5 flex-wrap">
                  {(activeConv.createdByName || activeConv.creator) && (
                    <span>
                      Created by <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{activeConv.createdByName || activeConv.creator?.displayName || activeConv.creator?.email || 'Admin'}</strong>
                    </span>
                  )}
                  {activeConv.createdAt && (
                    <span>• {new Date(activeConv.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Member List Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Members ({activeConv.members?.length || 0})</span>
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedAddMemberIds([]);
                    setAddMemberError(null);
                    setSearchAddMemberQuery('');
                    setIsAddMemberModalOpen(true);
                  }}
                  className="h-7 text-xs gap-1 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add Member</span>
                </Button>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {activeConv.members?.map((member) => {
                  const memberName = member.displayName || member.user?.displayName || member.user?.email || 'User';
                  const isCreator = member.userId === activeConv.createdBy;
                  const isSelf = member.userId === user?.id;
                  const canRemove =
                    (user?.role === 'SUPER_ADMIN' || activeConv.createdBy === user?.id) &&
                    !isSelf;

                  return (
                    <div
                      key={member.userId}
                      className="p-2.5 flex items-center justify-between gap-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          {member.user?.profilePhotoUrl ? (
                            <img
                              src={member.user.profilePhotoUrl}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-xs">
                              {memberName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5">
                            <PresenceBadge
                              status={member.user?.presence?.status || 'OFFLINE'}
                              size="sm"
                            />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                            <span>{memberName}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-1.5 py-0.2 rounded font-normal">
                                You
                              </span>
                            )}
                            {isCreator && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded font-medium flex items-center gap-0.5">
                                <Shield className="h-2.5 w-2.5" />
                                Creator
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {member.user?.employee?.designation?.name ||
                              (member.user?.role === 'SUPER_ADMIN' ? 'Super Admin' : member.user?.email)}
                          </div>
                        </div>
                      </div>

                      {canRemove && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={removingMemberUserId === member.userId}
                          onClick={() => handleRemoveMember(member.userId)}
                          className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="Remove from group"
                        >
                          {removingMemberUserId === member.userId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserMinus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={leavingGroup}
                onClick={handleLeaveGroup}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 gap-1.5"
              >
                {leavingGroup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                <span>Leave Group</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsGroupDetailsOpen(false)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Add Member Modal */}
      <Dialog
        isOpen={isAddMemberModalOpen}
        onClose={() => {
          setIsAddMemberModalOpen(false);
          setSelectedAddMemberIds([]);
          setAddMemberError(null);
        }}
        title="Add Members to Group"
      >
        <form onSubmit={handleAddMembers} className="space-y-3 max-w-md">
          {addMemberError && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">
              {addMemberError}
            </div>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search colleagues by name, role or email..."
              value={searchAddMemberQuery}
              onChange={(e) => setSearchAddMemberQuery(e.target.value)}
              className="pl-8 text-xs"
            />
          </div>

          {/* Member Selection List */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Select People ({selectedAddMemberIds.length} selected)
            </label>
            <div className="mt-1 max-h-56 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800 p-1">
              {directoryList
                .filter((c) => {
                  // Exclude terminated employees
                  if (c.employmentStatus === 'TERMINATED') return false;
                  // Exclude current user
                  if (c.userId === user?.id) return false;
                  // Exclude existing group members
                  const isExisting = activeConv?.members?.some((m) => m.userId === c.userId);
                  if (isExisting) return false;
                  // Search query filter
                  if (!searchAddMemberQuery.trim()) return true;
                  const q = searchAddMemberQuery.toLowerCase();
                  return (
                    c.displayName.toLowerCase().includes(q) ||
                    (c.email && c.email.toLowerCase().includes(q)) ||
                    (c.designationName && c.designationName.toLowerCase().includes(q))
                  );
                })
                .map((colleague) => {
                  const isSelected = selectedAddMemberIds.includes(colleague.userId);
                  return (
                    <div
                      key={colleague.userId}
                      onClick={() => {
                        setSelectedAddMemberIds((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== colleague.userId)
                            : [...prev, colleague.userId]
                        );
                      }}
                      className={`p-2 flex items-center justify-between rounded-md cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative shrink-0">
                          {colleague.profilePhotoUrl ? (
                            <img
                              src={colleague.profilePhotoUrl}
                              alt=""
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-bold flex items-center justify-center text-[10px]">
                              {colleague.displayName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5">
                            <PresenceBadge
                              status={colleague.presence?.status || 'OFFLINE'}
                              size="sm"
                            />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-zinc-900 dark:text-zinc-100 truncate">
                            {colleague.displayName}
                          </div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal truncate">
                            {colleague.designationName || colleague.email}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-zinc-900 dark:text-zinc-100 shrink-0 ml-2" />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAddMemberModalOpen(false);
                setSelectedAddMemberIds([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={selectedAddMemberIds.length === 0 || addingMembers}
            >
              {addingMembers ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Add Selected ({selectedAddMemberIds.length})
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
