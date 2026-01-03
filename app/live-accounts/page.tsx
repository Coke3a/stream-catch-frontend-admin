'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import StatusBadge from '@/components/StatusBadge';
import CopyButton from '@/components/CopyButton';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LiveAccountRow } from '@/types/admin';
import { formatDateTime, truncateId } from '@/lib/utils/format';

const PAGE_SIZE = 20;

export default function LiveAccountsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [liveAccounts, setLiveAccounts] = useState<LiveAccountRow[]>([]);
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>(
    {}
  );
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLiveAccounts = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from('live_accounts')
        .select('id,platform,account_id,canonical_url,status,created_at,updated_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        setError(error.message);
        setLiveAccounts([]);
        setFollowerCounts({});
        setIsLoading(false);
        return;
      }

      const rows = (data || []) as LiveAccountRow[];
      setLiveAccounts(rows);
      setTotal(count || 0);

      if (rows.length === 0) {
        setFollowerCounts({});
        setIsLoading(false);
        return;
      }

      const ids = rows.map((row) => row.id);
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('live_account_id')
        .in('live_account_id', ids)
        .eq('status', 'active');

      if (followError) {
        setError(followError.message);
      }

      const counts: Record<string, number> = {};
      (followData || []).forEach((follow) => {
        const id = follow.live_account_id as string;
        counts[id] = (counts[id] || 0) + 1;
      });

      setFollowerCounts(counts);
      setIsLoading(false);
    };

    loadLiveAccounts();
  }, [page, supabase]);

  return (
    <RequireAdmin>
      <AppShell
        title="Live accounts"
        description="Monitor live account status and follower counts."
      >
        {error && (
          <div className="mb-6">
            <ErrorBanner title="Unable to load accounts" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : liveAccounts.length === 0 ? (
          <EmptyState
            title="No live accounts"
            message="There are no live accounts to display yet."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Followers</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveAccounts.map((account) => (
                    <tr key={account.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <Link
                            href={`/live-accounts/${account.id}`}
                            className="font-semibold text-slate-900"
                          >
                            {account.account_id?.trim() || truncateId(account.id)}
                          </Link>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <CopyButton
                              value={account.account_id?.trim() || account.id}
                            />
                            <a
                              href={account.canonical_url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-dotted"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {account.platform}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={account.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {followerCounts[account.id] || 0}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(account.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && liveAccounts.length > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        )}
      </AppShell>
    </RequireAdmin>
  );
}
