'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ORDER_FIELDS = ['created_at', 'updated_at'] as const;
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'synced', label: 'Synced' },
  { value: 'unsynced', label: 'Unsynced' },
  { value: 'paused', label: 'Paused' },
  { value: 'error', label: 'Error' },
];

type OrderBy = (typeof ORDER_FIELDS)[number];
type OrderDirection = 'asc' | 'desc';

type LiveAccountsQuery = {
  status: string;
  platform: string;
  orderBy: OrderBy;
  orderDirection: OrderDirection;
};

const parsePage = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.floor(parsed);
};

const parsePageSize = (value: string | null) => {
  const parsed = Number(value);
  if (PAGE_SIZE_OPTIONS.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_PAGE_SIZE;
};

const parseOrderBy = (value: string | null): OrderBy =>
  ORDER_FIELDS.includes(value as OrderBy) ? (value as OrderBy) : 'created_at';

const parseOrderDirection = (value: string | null): OrderDirection =>
  value === 'asc' || value === 'desc' ? value : 'desc';

const parseStatus = (value: string | null) =>
  STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as string)
    : 'all';

const buildLiveAccountsQuery = (
  status: string,
  platform: string,
  orderBy: OrderBy,
  orderDirection: OrderDirection
): LiveAccountsQuery => ({
  status,
  platform,
  orderBy,
  orderDirection,
});


export default function LiveAccountsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));
  const initialStatus = parseStatus(searchParams.get('status'));
  const initialOrderBy = parseOrderBy(searchParams.get('orderBy'));
  const initialOrderDirection = parseOrderDirection(
    searchParams.get('orderDirection')
  );
  const initialPlatform = searchParams.get('platform') ?? '';
  const [liveAccounts, setLiveAccounts] = useState<LiveAccountRow[]>([]);
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>(
    {}
  );
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage - 1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [platformFilter, setPlatformFilter] = useState(initialPlatform);
  const [orderBy, setOrderBy] = useState<OrderBy>(initialOrderBy);
  const [orderDirection, setOrderDirection] =
    useState<OrderDirection>(initialOrderDirection);
  const [query, setQuery] = useState<LiveAccountsQuery>(() =>
    buildLiveAccountsQuery(
      initialStatus,
      initialPlatform,
      initialOrderBy,
      initialOrderDirection
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLiveAccounts = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let liveAccountsQuery = supabase
        .from('live_accounts')
        .select(
          'id,platform,account_id,canonical_url,status,created_at,updated_at',
          { count: 'exact' }
        )
        .order(query.orderBy, { ascending: query.orderDirection === 'asc' })
        .range(from, to);

      if (query.status !== 'all') {
        liveAccountsQuery = liveAccountsQuery.eq('status', query.status);
      }

      if (query.platform) {
        liveAccountsQuery = liveAccountsQuery.eq('platform', query.platform);
      }

      const { data, error, count } = await liveAccountsQuery;

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
  }, [page, pageSize, query, supabase]);

  const updateQueryParams = (updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  };

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedPlatform = platformFilter.trim().toLowerCase();
    const nextQuery = buildLiveAccountsQuery(
      statusFilter,
      trimmedPlatform,
      orderBy,
      orderDirection
    );
    setPlatformFilter(trimmedPlatform);
    setPage(0);
    setQuery(nextQuery);
    updateQueryParams({
      page: 1,
      pageSize,
      status: statusFilter !== 'all' ? statusFilter : null,
      platform: trimmedPlatform || null,
      orderBy,
      orderDirection,
    });
  };

  const handleClear = () => {
    const nextQuery = buildLiveAccountsQuery(
      'all',
      '',
      orderBy,
      orderDirection
    );
    setStatusFilter('all');
    setPlatformFilter('');
    setPage(0);
    setQuery(nextQuery);
    updateQueryParams({
      page: 1,
      pageSize,
      status: null,
      platform: null,
      orderBy,
      orderDirection,
    });
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    updateQueryParams({ page: nextPage + 1 });
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(0);
    updateQueryParams({ page: 1, pageSize: nextPageSize });
  };

  return (
    <RequireAdmin>
      <AppShell
        title="Live accounts"
        description="Monitor live account status and follower counts."
      >
        <form
          onSubmit={handleFilter}
          className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Platform
            <input
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value)}
              placeholder="twitch"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order by
            <select
              value={orderBy}
              onChange={(event) =>
                setOrderBy(parseOrderBy(event.target.value))
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="created_at">Created</option>
              <option value="updated_at">Updated</option>
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Direction
            <select
              value={orderDirection}
              onChange={(event) =>
                setOrderDirection(parseOrderDirection(event.target.value))
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-500"
            >
              Apply filters
            </button>
            {(statusFilter !== 'all' || platformFilter) && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-slate-400"
              >
                Clear
              </button>
            )}
          </div>
        </form>

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
            message="Try adjusting your filters or check back later."
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
            pageSize={pageSize}
            total={total}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        )}
      </AppShell>
    </RequireAdmin>
  );
}
