import { User } from '@supabase/supabase-js';

export const isAdminUser = (user: User | null) => {
  const metadata = user?.app_metadata as { is_admin?: boolean } | undefined;
  return Boolean(metadata?.is_admin);
};
