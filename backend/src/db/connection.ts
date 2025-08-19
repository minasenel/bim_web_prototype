import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    // Support the requested naming: SUPABASE_KEY, with safe fallbacks
    const key =
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing Supabase config. Set SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY)'
      );
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

// For Supabase REST, we assume you manage schema via SQL Editor or migrations in Supabase.
export async function ensureDatabaseInitialized(): Promise<void> {
  // No-op for Supabase; ensure tables exist via Supabase SQL editor:
  // products(id serial pk, name text not null, brand text, category text)
  // stores(id serial pk, name text not null, latitude real not null, longitude real not null, address text)
  // stock(product_id int, store_id int, quantity int default 0, primary key(product_id, store_id))
}


