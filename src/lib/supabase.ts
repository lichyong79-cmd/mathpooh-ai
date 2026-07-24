export type SupabaseConfig = {
  url: string;
  key: string;
};

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const rawKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export const supabaseUrl = rawUrl.trim().replace(/\/$/, "");
export const supabaseKey = rawKey.replace(/\s/g, "");

export const supabaseConfig: SupabaseConfig | null =
  supabaseUrl && supabaseKey
    ? { url: supabaseUrl, key: supabaseKey }
    : null;

export function getSupabaseConfig(): SupabaseConfig | null {
  return supabaseConfig;
}
