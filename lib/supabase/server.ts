import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { APP_CONFIG } from '@/config/app';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components can't set cookies directly.
        }
      },
    },
  });
}
