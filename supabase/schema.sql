-- ==============================================================================
-- PHENMO EVENTS — SUPABASE POSTGRESQL SCHEMA
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- It creates all tables, foreign keys, indexes, RLS policies, and realtime triggers.
-- ==============================================================================

-- 1. ACCOUNTS & STAFF MEMBERS
CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Technician',
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. INVENTORY CATEGORIES (7 Departments)
CREATE TABLE IF NOT EXISTS public.inventory_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- 3. INVENTORY ITEMS (Hardware Assets & Consolidated Models)
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES public.inventory_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Available',
    notes TEXT DEFAULT '',
    model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    serials JSONB NOT NULL DEFAULT '[]'::jsonb,
    sub_category TEXT DEFAULT '',
    condition TEXT NOT NULL DEFAULT 'Good',
    location TEXT NOT NULL DEFAULT 'In Store',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. EVENTS & PRODUCTIONS
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    venue TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '00:00',
    end_time TEXT NOT NULL DEFAULT '00:00',
    setup_time TEXT NOT NULL DEFAULT '00:00',
    breakdown_time TEXT NOT NULL DEFAULT '00:00',
    equipment_booked TEXT DEFAULT '',
    returned_equipment TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    assigned_to TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Planned',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. EVENT INVENTORY BOOKINGS & RETURN INSPECTIONS
CREATE TABLE IF NOT EXISTS public.event_inventory (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    returned_condition TEXT DEFAULT NULL,
    damage_serial_number TEXT DEFAULT NULL,
    damage_problem TEXT DEFAULT NULL,
    damage_photo TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. INTERNAL STAFF MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES FOR HIGH-PERFORMANCE SEARCH & SCANNER LOOKUPS
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_model ON public.inventory_items(LOWER(model));
CREATE INDEX IF NOT EXISTS idx_inventory_serial ON public.inventory_items(LOWER(serial_number));
CREATE INDEX IF NOT EXISTS idx_inventory_serials_gin ON public.inventory_items USING GIN(serials);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON public.inventory_items(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_event_inventory_event ON public.event_inventory(event_id);
CREATE INDEX IF NOT EXISTS idx_event_inventory_item ON public.event_inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON public.messages(sender_id, recipient_id);

-- ==============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Allow full access for backend service role (Node server with SERVICE_ROLE_KEY)
CREATE POLICY "Service role full access on accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on categories" ON public.inventory_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on items" ON public.inventory_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on events" ON public.events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on event_inventory" ON public.event_inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);

-- Allow public read/write access via anon key for the staff portal app
-- (Staff authentication and password checking are handled via application logic)
CREATE POLICY "Staff portal access on accounts" ON public.accounts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Staff portal access on categories" ON public.inventory_categories FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Staff portal access on items" ON public.inventory_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Staff portal access on events" ON public.events FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Staff portal access on event_inventory" ON public.event_inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Staff portal access on messages" ON public.messages FOR ALL TO anon USING (true) WITH CHECK (true);

-- ==============================================================================
-- SUPABASE REALTIME SUBSCRIPTIONS
-- ==============================================================================
-- Enables live sync so warehouse staff see instant inventory counts and new messages
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================================================
-- STORAGE BUCKET FOR DAMAGE & EVENT INSPECTION PHOTOS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment-photos', 'equipment-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read equipment photos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'equipment-photos');

CREATE POLICY "Staff upload equipment photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'equipment-photos');

