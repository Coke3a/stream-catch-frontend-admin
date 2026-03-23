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
import { PlanRow, SubscriptionFullRow } from '@/types/admin';
import { formatDateTime, truncateId } from '@/lib/utils/format';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'past_due', label: 'Past due' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
];

const BILLING_MODE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'one_time', label: 'One time' },
];

type SubscriptionListRow = SubscriptionFullRow & {
  plan?: PlanRow | PlanRow[] | null;
};

const parsePage = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
};

const parsePageSize = (value: string | null) => {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
};

function SubscriptionsPageContent({
  searchParams,
}: {
  searchParams: ReadonlyURLSearchParams;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));

  const [subscriptions, setSubscriptions] = useState<SubscriptionListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage - 1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'all');
  const [billingModeFilter, setBillingModeFilter] = useState(searchParams.get('billingMode') ?? 'all');
  const [query, setQuery] = useState({
    status: searchParams.get('status') ?? 'all',
    billingMode: searchParams.get('billingMode') ?? 'all',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSubscriptions = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let subsQuery = supabase
        .from('subscriptions')
        .select(
          'id,user_id,status,starts_at,ends_at,billing_mode,cancel_at_period_end,canceled_at,provider_subscription_id,plan:plans(id,name)',
          { count: 'exact' }
        )
        .order('starts_at', { ascending: false })
        .range(from, to);

      if (query.status !== 'all') {
        subsQuery = subsQuery.eq('status', query.status);
      }

      if (query.billingMode !== 'all') {
        subsQuery = subsQuery.eq('billing_mode', query.billingMode);
      }

      const { data, error, count } = await subsQuery;

      if (error) {
        setError(error.message);
        setSubscriptions([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      setSubscriptions((data || []) as SubscriptionListRow[]);
      setTotal(count || 0);
      setIsLoading(false);
    };

    loadSubscriptions();
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
    setPage(0);
    setQuery({ status: statusFilter, billingMode: billingModeFilter });
    updateQueryParams({
      page: 1,
      pageSize,
      status: statusFilter !== 'all' ? statusFilter : null,
      billingMode: billingModeFilter !== 'all' ? billingModeFilter : null,
    });
  };

  const handleClear = () => {
    setStatusFilter('all');
    setBillingModeFilter('all');
    setPage(0);
    setQuery({ status: 'all', billingMode: 'all' });
    updateQueryParams({ page: 1, pageSize, status: null, billingMode: null });
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
        title="Subscriptions"
        description="View all subscriptions across the system."
      >
        <form
          onSubmit={handleFilter}
          className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
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
            Billing mode
            <select
              value={billingModeFilter}
              onChange={(event) => setBillingModeFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {BILLING_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2 lg:col-start-4">
            <button
              type="submit"
              className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-500"
            >
              Apply filters
            </button>
            {(query.status !== 'all' || query.billingMode !== 'all') && (
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
            <ErrorBanner title="Unable to load subscriptions" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions"
            message="Try adjusting your filters."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Billing</th>
                    <th className="px-4 py-3">Starts</th>
                    <th className="px-4 py-3">Ends</th>
                    <th className="px-4 py-3">Cancel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscriptions.map((sub) => {
                    const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan;
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <span className="font-semibold text-slate-900">
                              {truncateId(sub.id)}
                            </span>
                            <CopyButton value={sub.id} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/users/${sub.user_id}`}
                            className="text-slate-700"
                          >
                            {truncateId(sub.user_id)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {plan?.name || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={sub.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {sub.billing_mode}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(sub.starts_at)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(sub.ends_at)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {sub.cancel_at_period_end ? (
                            <span className="text-amber-700">At period end</span>
                          ) : sub.canceled_at ? (
                            formatDateTime(sub.canceled_at)
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && subscriptions.length > 0 && (
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

function SubscriptionsPageContainer() {
  const searchParams = useSearchParams();
  return (
    <SubscriptionsPageContent
      key={searchParams.toString()}
      searchParams={searchParams}
    />
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <SubscriptionsPageContainer />
    </Suspense>
  );
}
