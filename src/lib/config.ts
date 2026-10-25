// The publishable key is meant to be public: every write goes through
// Postgres functions that check the caller, and tables have no client access.
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://oinroxkaugwrveabaozg.supabase.co'
export const SUPABASE_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_19PIXoiaOZnLodDtZlvE1Q_lqHtQK_x'
