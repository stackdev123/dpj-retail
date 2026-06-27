import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oyhzottozdfpajztbixt.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_zJY7FO7lXbRcstuPp0_KyA_OyjTH07p';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
