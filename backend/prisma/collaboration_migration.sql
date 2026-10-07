-- ============================================================
-- TEAMS TECHYARTS COLLABORATION SCHEMA MIGRATION
-- Additive, Non-destructive PostgreSQL migration for Supabase
-- ============================================================

-- 1. ENUMS (Safe creation)
DO $$ BEGIN
  CREATE TYPE "conversation_type" AS ENUM ('DIRECT', 'GROUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "conversation_member_role" AS ENUM ('ADMIN', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "user_presence_status" AS ENUM ('AVAILABLE', 'BUSY', 'DO_NOT_DISTURB', 'AWAY', 'OFFLINE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "meeting_status" AS ENUM ('SCHEDULED', 'LOBBY', 'ACTIVE', 'ENDING', 'ENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "meeting_participant_status" AS ENUM ('INVITED', 'JOINING', 'JOINED', 'LEFT', 'DISCONNECTED', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. CONVERSATIONS
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" "conversation_type" NOT NULL DEFAULT 'DIRECT',
  "title" VARCHAR,
  "description" VARCHAR,
  "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "direct_user_a_id" UUID,
  "direct_user_b_id" UUID,
  "direct_key" VARCHAR UNIQUE,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "last_message_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- 3. CONVERSATION MEMBERS
CREATE TABLE IF NOT EXISTS "conversation_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "conversation_member_role" NOT NULL DEFAULT 'MEMBER',
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "left_at" TIMESTAMPTZ(6),
  "last_read_message_id" UUID,
  "last_read_at" TIMESTAMPTZ(6),
  "muted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "conversation_members_conv_user_unique" UNIQUE ("conversation_id", "user_id")
);

-- 4. MESSAGES
CREATE TABLE IF NOT EXISTS "messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" TEXT NOT NULL,
  "reply_to_message_id" UUID REFERENCES "messages"("id") ON DELETE SET NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "edited_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6)
);

-- 5. MESSAGE REACTIONS
CREATE TABLE IF NOT EXISTS "message_reactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reaction" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "message_reactions_msg_user_unique" UNIQUE ("message_id", "user_id")
);

-- 6. MESSAGE ATTACHMENTS
CREATE TABLE IF NOT EXISTS "message_attachments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "file_name" VARCHAR NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "file_type" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- 7. USER PRESENCE
CREATE TABLE IF NOT EXISTS "user_presence" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "user_presence_status" NOT NULL DEFAULT 'OFFLINE',
  "custom_status_message" VARCHAR,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- 8. MEETINGS
CREATE TABLE IF NOT EXISTS "meetings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "host_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" VARCHAR,
  "status" "meeting_status" NOT NULL DEFAULT 'ACTIVE',
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "ended_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- 9. MEETING PARTICIPANTS
CREATE TABLE IF NOT EXISTS "meeting_participants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" UUID NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "meeting_participant_status" NOT NULL DEFAULT 'JOINED',
  "is_muted" BOOLEAN NOT NULL DEFAULT false,
  "is_camera_off" BOOLEAN NOT NULL DEFAULT false,
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "left_at" TIMESTAMPTZ(6),
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "meeting_participants_mtg_user_unique" UNIQUE ("meeting_id", "user_id")
);

-- INDEXES
CREATE INDEX IF NOT EXISTS "idx_conv_members_user" ON "conversation_members"("user_id");
CREATE INDEX IF NOT EXISTS "idx_conv_members_conv" ON "conversation_members"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_messages_conv" ON "messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_messages_created_at" ON "messages"("created_at");
CREATE INDEX IF NOT EXISTS "idx_meetings_conv" ON "meetings"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_meetings_status" ON "meetings"("status");
CREATE INDEX IF NOT EXISTS "idx_meeting_participants_meeting" ON "meeting_participants"("meeting_id");
CREATE INDEX IF NOT EXISTS "idx_meeting_participants_user" ON "meeting_participants"("user_id");
