'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthLoading, useSession, useSupabase, useUser } from '@/components/AuthProvider';
import { isAdminUser } from '@/lib/utils/admin';
import ErrorBanner from '@/components/ErrorBanner';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = useSupabase();
  const session = useSession();
  const user = useUser();
  const isLoading = useAuthLoading();
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!session && !unauthorized) {
      router.replace('/login');
      return;
    }

    if (session && !isAdminUser(user)) {
      setUnauthorized(true);
      supabase.auth.signOut();
    }
  }, [isLoading, session, unauthorized, router, supabase, user]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-slate-100" />
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-slate-100" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <ErrorBanner
        title="Not authorized"
        message="Your account does not have admin access."
      />
    );
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}
