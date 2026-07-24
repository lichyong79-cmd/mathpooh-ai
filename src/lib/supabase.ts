import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const key = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  ""
).trim().replace(/\s/g, "");

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export const supabaseEnv = { url, keyPresent: Boolean(key) };
