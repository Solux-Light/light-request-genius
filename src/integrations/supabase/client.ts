import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wfgvamhbcmzywzdlawqc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TqMjdlZT0yEoGtRXSv74tQ_zZ0GirwP';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
