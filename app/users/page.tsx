'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ReadonlyURLSearchParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
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

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ORDER_FIELDS = ['created_at', 'updated_at', 'last_seen_at'] as const;
const USER_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'inactive', label: 'Inactive' },
];

type OrderBy = (typeof ORDER_FIELDS)[number];
type OrderDirection = 'asc' | 'desc';

type UserQuery = {
  userId: string;
  email: string;
  status: string;
  orderBy: OrderBy;
  orderDirection: OrderDirection;
};

type PlanSummary = Pick<PlanRow, 'id' | 'name'>;

type SubscriptionListRow = Pick<
  SubscriptionRow,
  'id' | 'user_id' | 'status' | 'starts_at' | 'ends_at'
> & {
  plan?: PlanSummary | PlanSummary[] | null;
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
  USER_STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as string)
    : 'all';

const buildUserQuery = (
  searchValue: string,
  status: string,
  orderBy: OrderBy,
  orderDirection: OrderDirection
): UserQuery => {
  const trimmed = searchValue.trim();
  const isSearchUuid = Boolean(trimmed) && isUuid(trimmed);
  return {
    userId: isSearchUuid ? trimmed : '',
    email: !isSearchUuid && trimmed ? trimmed : '',
    status,
    orderBy,
    orderDirection,
  };
};


function UsersPageContent({
  searchParams,
}: {
  searchParams: ReadonlyURLSearchParams;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));
  const initialStatus = parseStatus(searchParams.get('status'));
  const initialOrderBy = parseOrderBy(searchParams.get('orderBy'));
  const initialOrderDirection = parseOrderDirection(
    searchParams.get('orderDirection')
  );
  const initialSearch = searchParams.get('search') ?? '';
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<
    Record<string, SubscriptionListRow | null>
  >({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage - 1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [orderBy, setOrderBy] = useState<OrderBy>(initialOrderBy);
  const [orderDirection, setOrderDirection] =
    useState<OrderDirection>(initialOrderDirection);
  const [query, setQuery] = useState<UserQuery>(() =>
    buildUserQuery(
      initialSearch,
      initialStatus,
      initialOrderBy,
      initialOrderDirection
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * pageSize;
      const { data, error } = await supabase.rpc('admin_list_users', {
        limit_count: pageSize,
        offset_count: from,
        filter_user_id: query.userId || null,
        filter_email: query.email || null,
        filter_status: query.status !== 'all' ? query.status : null,
        order_by: query.orderBy,
        order_direction: query.orderDirection,
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

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedSearch = search.trim();
    const nextQuery = buildUserQuery(
      trimmedSearch,
      statusFilter,
      orderBy,
      orderDirection
    );
    setSearch(trimmedSearch);
    setPage(0);
    setQuery(nextQuery);
    updateQueryParams({
      page: 1,
      pageSize,
      search: trimmedSearch || null,
      status: statusFilter !== 'all' ? statusFilter : null,
      orderBy,
      orderDirection,
    });
  };

  const handleClear = () => {
    const nextQuery = buildUserQuery(
      '',
      'all',
      orderBy,
      orderDirection
    );
    setSearch('');
    setStatusFilter('all');
    setPage(0);
    setQuery(nextQuery);
    updateQueryParams({
      page: 1,
      pageSize,
      search: null,
      status: null,
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
        title="Users"
        description="Search user records, subscription status, and account metadata."
      >
        <form
          onSubmit={handleSearch}
          className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Email or user UUID"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {USER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
              <option value="last_seen_at">Last seen</option>
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
            {(search || statusFilter !== 'all') && (
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
            <ErrorBanner title="Unable to load users" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            message="Try adjusting your filters or clear the search."
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

function UsersPageContainer() {
  const searchParams = useSearchParams();
  return (
    <UsersPageContent
      key={searchParams.toString()}
      searchParams={searchParams}
    />
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <UsersPageContainer />
    </Suspense>
  );
}
