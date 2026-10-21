// Read-only check against the configured project; intentionally unauthenticated.
import { createClient } from '@supabase/supabase-js';
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
for (const table of ['projects', 'notes', 'feedback']) {
  const { data, error } = await client.from(table).select('id').limit(1);
  if (!error || error.code !== '42501' || data !== null) {
    throw new Error(`Anonymous access check failed for ${table}: ${error?.message || 'data accessible'}`);
  }
  console.log(`PASS: anonymous access denied to ${table}`);
}
const { data, error } = await client.storage.from('references').createSignedUrl('someone-else/image.jpg',60);
if (data?.signedUrl || !error) throw new Error('Anonymous storage access was accepted');
console.log('PASS: anonymous access denied to private references');
