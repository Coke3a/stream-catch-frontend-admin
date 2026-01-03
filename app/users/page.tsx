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
import { AdminUserRow, PlanRow, SubscriptionRow } from '@/types/admin';
import { formatDateTime, isUuid, truncateId } from '@/lib/utils/format';

const PAGE_SIZE = 20;

type PlanSummary = Pick<PlanRow, 'id' | 'name'>;

type SubscriptionListRow = Pick<
  SubscriptionRow,
  'id' | 'user_id' | 'status' | 'starts_at' | 'ends_at'
> & {
  plan?: PlanSummary | PlanSummary[] | null;
};

export default function UsersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<
    Record<string, SubscriptionListRow | null>
  >({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * PAGE_SIZE;

      if (query && !isUuid(query)) {
        setUsers([]);
        setTotal(0);
        setSubscriptions({});
        setError('Enter a valid user UUID to search.');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('admin_list_users', {
        limit_count: PAGE_SIZE,
        offset_count: from,
        filter_user_id: query || null,
      });

      if (error) {
        setError(error.message);
        setUsers([]);
        setSubscriptions({});
        setIsLoading(false);
        return;
      }

      const rows = (data || []) as AdminUserRow[];
      setUsers(rows);
      setTotal(rows[0]?.total_count ? Number(rows[0].total_count) : 0);

      if (rows.length === 0) {
        setSubscriptions({});
        setIsLoading(false);
        return;
      }

      const ids = rows.map((row) => row.id);
      const { data: subs, error: subsError } = await supabase
        .from('subscriptions')
        .select('id,user_id,status,starts_at,ends_at,plan:plans(id,name)')
        .in('user_id', ids)
        .order('starts_at', { ascending: false });

      if (subsError) {
        setError(subsError.message);
      }

      const subscriptionRows = (subs || []) as SubscriptionListRow[];
      const mapped: Record<string, SubscriptionListRow | null> = {};
      subscriptionRows.forEach((subscription) => {
        if (!mapped[subscription.user_id]) {
          mapped[subscription.user_id] = subscription;
        }
      });

      setSubscriptions(mapped);
      setIsLoading(false);
    };

    loadUsers();
  }, [page, query, supabase]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(0);
    setQuery(search.trim());
  };

  return (
    <RequireAdmin>
      <AppShell
        title="Users"
        description="Search user records, subscription status, and account metadata."
      >
        <form
          onSubmit={handleSearch}
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by user UUID"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
          <button
            type="submit"
            className="w-full rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-500 sm:w-auto"
          >
            Search
          </button>
          {query && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setQuery('');
                setPage(0);
              }}
              className="w-full rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-slate-400 sm:w-auto"
            >
              Clear
            </button>
          )}
        </form>

        {error && (
          <div className="mb-6">
            <ErrorBanner title="Unable to load users" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            message="Try a different user ID or clear the search filter."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Last sign-in</th>
                    <th className="px-4 py-3">Last seen</th>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Ends</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => {
                    const subscription = subscriptions[user.id];
                    const plan = Array.isArray(subscription?.plan)
                      ? subscription.plan[0]
                      : subscription?.plan;
                    const isAdmin = Boolean(user.is_admin);
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <Link
                              href={`/users/${user.id}`}
                              className="font-semibold text-slate-900"
                            >
                              {truncateId(user.id)}
                            </Link>
                            <CopyButton value={user.id} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {user.email || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {user.role || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={isAdmin ? 'admin' : 'standard'} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(user.created_at)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(user.last_sign_in_at)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(user.last_seen_at)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={subscription?.status || 'none'} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {plan?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(subscription?.ends_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && users.length > 0 && (
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
