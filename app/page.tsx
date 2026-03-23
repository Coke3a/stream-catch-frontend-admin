'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import StatCard from '@/components/StatCard';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import StatusBadge from '@/components/StatusBadge';
import { useSession } from '@/components/AuthProvider';
import { ROUTES } from '@/config/routes';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDateTime, formatCurrency, truncateId } from '@/lib/utils/format';

type AdminStats = {
  total_users: number;
  active_subscriptions: number;
  active_follows: number;
  live_accounts_total: number;
  live_accounts_synced: number;
  recordings_total: number;
  recordings_ready: number;
  recordings_failed: number;
  recordings_recording: number;
  jobs_queued: number;
  jobs_running: number;
  jobs_failed: number;
  revenue_this_month: number;
  failed_payments_30d: number;
};

type ProblemItem = {
  id: string;
  type: 'recording' | 'job' | 'payment';
  label: string;
  status: string;
  timestamp: string;
  href: string;
};

export default function DashboardPage() {
  const session = useSession();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [problems, setProblems] = useState<ProblemItem[]>([]);
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
        const nowIso = new Date().toISOString();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const [
          totalUsers,
          activeSubscriptions,
          activeFollows,
          liveAccountsTotal,
          liveAccountsSynced,
          recordingsTotal,
          recordingsReady,
          recordingsFailed,
          recordingsRecording,
          jobsQueued,
          jobsRunning,
          jobsFailed,
          revenueThisMonth,
          failedPayments30d,
          failedRecordings,
          failedJobs,
          failedPayments,
        ] = await Promise.all([
          supabase.rpc('admin_list_users', {
            limit_count: 1,
            offset_count: 0,
            filter_user_id: null,
          }),
          supabase
            .from('subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .lte('starts_at', nowIso)
            .gt('ends_at', nowIso),
          supabase
            .from('follows')
            .select('user_id', { count: 'exact', head: true })
            .eq('status', 'active'),
          supabase
            .from('live_accounts')
            .select('id', { count: 'exact', head: true }),
          supabase
            .from('live_accounts')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'synced'),
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
          supabase
            .from('recordings')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'live_recording'),
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'queued'),
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'running'),
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .in('status', ['failed', 'dead']),
          supabase
            .from('payments')
            .select('amount_minor')
            .eq('status', 'succeeded')
            .gte('created_at', monthStart),
          supabase
            .from('payments')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'failed')
            .gte('created_at', thirtyDaysAgo),
          // Recent problems
          supabase
            .from('recordings')
            .select('id,status,updated_at')
            .eq('status', 'failed')
            .order('updated_at', { ascending: false })
            .limit(5),
          supabase
            .from('jobs')
            .select('id,type,status,created_at')
            .in('status', ['failed', 'dead'])
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('payments')
            .select('id,user_id,status,amount_minor,currency,created_at')
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

        const errors = [
          totalUsers.error,
          activeSubscriptions.error,
          activeFollows.error,
          liveAccountsTotal.error,
          liveAccountsSynced.error,
          recordingsTotal.error,
          recordingsReady.error,
          recordingsFailed.error,
          recordingsRecording.error,
          jobsQueued.error,
          jobsRunning.error,
          jobsFailed.error,
        ].filter(Boolean);

        if (errors.length > 0) {
          throw new Error(errors[0]?.message || 'Failed to load stats');
        }

        const totalUsersCount = totalUsers.data?.[0]?.total_count
          ? Number(totalUsers.data[0].total_count)
          : 0;

        const revenueTotal = (revenueThisMonth.data || []).reduce(
          (sum: number, row: { amount_minor: number }) => sum + (row.amount_minor || 0),
          0
        );

        setStats({
          total_users: totalUsersCount,
          active_subscriptions: activeSubscriptions.count || 0,
          active_follows: activeFollows.count || 0,
          live_accounts_total: liveAccountsTotal.count || 0,
          live_accounts_synced: liveAccountsSynced.count || 0,
          recordings_total: recordingsTotal.count || 0,
          recordings_ready: recordingsReady.count || 0,
          recordings_failed: recordingsFailed.count || 0,
          recordings_recording: recordingsRecording.count || 0,
          jobs_queued: jobsQueued.count || 0,
          jobs_running: jobsRunning.count || 0,
          jobs_failed: jobsFailed.count || 0,
          revenue_this_month: revenueTotal,
          failed_payments_30d: failedPayments30d.count || 0,
        });

        // Build problems feed
        const items: ProblemItem[] = [];

        for (const rec of failedRecordings.data || []) {
          items.push({
            id: rec.id,
            type: 'recording',
            label: `Recording ${truncateId(rec.id)} failed`,
            status: rec.status,
            timestamp: rec.updated_at,
            href: `${ROUTES.recordings}?status=failed`,
          });
        }

        for (const job of failedJobs.data || []) {
          items.push({
            id: job.id,
            type: 'job',
            label: `Job ${job.type} ${job.status}`,
            status: job.status,
            timestamp: job.created_at,
            href: `${ROUTES.jobs}?status=${job.status}`,
          });
        }

        for (const pay of failedPayments.data || []) {
          items.push({
            id: pay.id,
            type: 'payment',
            label: `Payment ${formatCurrency(pay.amount_minor, pay.currency)} failed`,
            status: pay.status,
            timestamp: pay.created_at,
            href: `${ROUTES.billing}?tab=payments&paymentStatus=failed`,
          });
        }

        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setProblems(items.slice(0, 10));
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
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Total users" value={stats.total_users} />
              <StatCard
                label="Active subscriptions"
                value={stats.active_subscriptions}
              />
              <StatCard label="Active follows" value={stats.active_follows} />
              <StatCard
                label="Total live accounts"
                value={stats.live_accounts_total}
              />
              <StatCard
                label="Total live accounts synced"
                value={stats.live_accounts_synced}
              />
              <StatCard
                label="Recordings total"
                value={stats.recordings_total}
              />
              <StatCard
                label="Currently recording"
                value={stats.recordings_recording}
              />
              <StatCard label="Recordings ready" value={stats.recordings_ready} />
              <StatCard
                label="Recordings failed"
                value={stats.recordings_failed}
              />
              <StatCard
                label="Jobs queued"
                value={stats.jobs_queued}
              />
              <StatCard
                label="Jobs running"
                value={stats.jobs_running}
              />
              <StatCard
                label="Jobs failed"
                value={stats.jobs_failed}
              />
              <StatCard
                label="Revenue this month"
                value={formatCurrency(stats.revenue_this_month)}
              />
              <StatCard
                label="Failed payments (30d)"
                value={stats.failed_payments_30d}
              />
            </div>

            {problems.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Recent problems
                </h2>
                <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
                  <div className="divide-y divide-slate-100">
                    {problems.map((item) => (
                      <Link
                        key={`${item.type}-${item.id}`}
                        href={item.href}
                        className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50/60"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusBadge value={item.status} />
                          <span className="truncate text-sm text-slate-700">
                            {item.label}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500">
                          {formatDateTime(item.timestamp)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
