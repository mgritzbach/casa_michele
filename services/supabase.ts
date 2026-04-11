import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cbtroatixvydpwoviezf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNidHJvYXRpeHZ5ZHB3b3ZpZXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDIyNTAsImV4cCI6MjA4NjMxODI1MH0.Lmegn_0huwUfwPFDANFdeO9hkdu3FiAE2yPEOIDQqCs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
