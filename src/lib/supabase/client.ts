"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser client with the anon key.
 *
 * RLS currently blocks it from reading the queue by design — the dashboard
 * talks to /api/* routes instead. This exists so that adding Supabase Auth
 * later (and matching RLS policies) needs no restructuring.
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true } },
);
