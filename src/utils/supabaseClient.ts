// src/utils/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

/** False when running locally without Supabase env vars; callers should skip Supabase work. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
    // eslint-disable-next-line no-console
    console.info('Supabase is not configured - running in local mode (bots are loaded from /xml).');
}

// createClient throws on empty values, which would crash the whole app at import time,
// so fall back to a placeholder client that is never used when not configured.
export const supabase = createClient(supabaseUrl || 'http://localhost:54321', supabaseAnonKey || 'local-placeholder-key');
