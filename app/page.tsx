'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import StatCard from '@/components/StatCard';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { useSession } from '@/components/AuthProvider';
import { ROUTES } from '@/config/routes';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type AdminStats = {
  total_users: number;
  active_subscriptions: number;
  active_follows: number;
  recordings_total: number;
  recordings_ready: number;
  recordings_failed: number;
};

export default function DashboardPage() {
  const session = useSession();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      if (!session) {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const [
          totalUsers,
          activeSubscriptions,
          activeFollows,
          recordingsTotal,
          recordingsReady,
          recordingsFailed,
        ] = await Promise.all([
          supabase.rpc('admin_list_users', {
            limit_count: 1,
            offset_count: 0,
            filter_user_id: null,
          }),
          supabase
            .from('subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active'),
          supabase
            .from('follows')
            .select('user_id', { count: 'exact', head: true })
            .eq('status', 'active'),
          supabase
            .from('recordings')
            .select('id', { count: 'exact', head: true }),
          supabase
            .from('recordings')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ready'),
          supabase
            .from('recordings')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'failed'),
        ]);

        const errors = [
          totalUsers.error,
          activeSubscriptions.error,
          activeFollows.error,
          recordingsTotal.error,
          recordingsReady.error,
          recordingsFailed.error,
        ].filter(Boolean);

        if (errors.length > 0) {
          throw new Error(errors[0]?.message || 'Failed to load stats');
        }

        const totalUsersCount = totalUsers.data?.[0]?.total_count
          ? Number(totalUsers.data[0].total_count)
          : 0;

        setStats({
          total_users: totalUsersCount,
          active_subscriptions: activeSubscriptions.count || 0,
          active_follows: activeFollows.count || 0,
          recordings_total: recordingsTotal.count || 0,
          recordings_ready: recordingsReady.count || 0,
          recordings_failed: recordingsFailed.count || 0,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [session, supabase]);

  return (
    <RequireAdmin>
      <AppShell
        title="Operations overview"
        description="Live snapshot of key metrics and quick access to user and recording data."
      >
        {error && (
          <div className="mb-6">
            <ErrorBanner title="Stats unavailable" message={error} />
          </div>
        )}

        {isLoading && <LoadingSkeleton rows={3} />}

        {!isLoading && stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Total users" value={stats.total_users} />
            <StatCard
              label="Active subscriptions"
              value={stats.active_subscriptions}
            />
            <StatCard label="Active follows" value={stats.active_follows} />
            <StatCard
              label="Recordings total"
              value={stats.recordings_total}
            />
            <StatCard label="Recordings ready" value={stats.recordings_ready} />
            <StatCard
              label="Recordings failed"
              value={stats.recordings_failed}
            />
          </div>
        )}

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Link
            href={ROUTES.users}
            className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400"
          >
            Review users and subscriptions &rarr;
          </Link>
          <Link
            href={ROUTES.liveAccounts}
            className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400"
          >
            Monitor live accounts &rarr;
          </Link>
          <Link
            href={ROUTES.recordings}
            className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400"
          >
            Scan recordings inventory &rarr;
          </Link>
        </div>
      </AppShell>
    </RequireAdmin>
  );
}
