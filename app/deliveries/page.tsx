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
import { DeliveryRow } from '@/types/admin';
import { formatDateTime, truncateId } from '@/lib/utils/format';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

const VIA_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'web_notify', label: 'Web notify' },
  { value: 'email', label: 'Email' },
  { value: 'telegram', label: 'Telegram' },
];

const parsePage = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
};

const parsePageSize = (value: string | null) => {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
};

function DeliveriesPageContent({
  searchParams,
}: {
  searchParams: ReadonlyURLSearchParams;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));

  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage - 1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'all');
  const [viaFilter, setViaFilter] = useState(searchParams.get('via') ?? 'all');
  const [query, setQuery] = useState({
    status: searchParams.get('status') ?? 'all',
    via: searchParams.get('via') ?? 'all',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDeliveries = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let deliveriesQuery = supabase
        .from('deliveries')
        .select('id,recording_id,user_id,via,delivered_at,status,error', { count: 'exact' })
        .order('delivered_at', { ascending: false, nullsFirst: false })
        .range(from, to);

      if (query.status !== 'all') {
        deliveriesQuery = deliveriesQuery.eq('status', query.status);
      }

      if (query.via !== 'all') {
        deliveriesQuery = deliveriesQuery.eq('via', query.via);
      }

      const { data, error, count } = await deliveriesQuery;

      if (error) {
        setError(error.message);
        setDeliveries([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      setDeliveries((data || []) as DeliveryRow[]);
      setTotal(count || 0);
      setIsLoading(false);
    };

    loadDeliveries();
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
    setQuery({ status: statusFilter, via: viaFilter });
    updateQueryParams({
      page: 1,
      pageSize,
      status: statusFilter !== 'all' ? statusFilter : null,
      via: viaFilter !== 'all' ? viaFilter : null,
    });
  };

  const handleClear = () => {
    setStatusFilter('all');
    setViaFilter('all');
    setPage(0);
    setQuery({ status: 'all', via: 'all' });
    updateQueryParams({ page: 1, pageSize, status: null, via: null });
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
        title="Deliveries"
        description="Track notification delivery to users for recording availability."
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
            Channel
            <select
              value={viaFilter}
              onChange={(event) => setViaFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {VIA_OPTIONS.map((option) => (
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
            {(query.status !== 'all' || query.via !== 'all') && (
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
            <ErrorBanner title="Unable to load deliveries" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : deliveries.length === 0 ? (
          <EmptyState
            title="No deliveries"
            message="Try adjusting your filters or check back later."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Recording</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Delivered at</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <span className="font-semibold text-slate-900">
                            {truncateId(delivery.id)}
                          </span>
                          <CopyButton value={delivery.id} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/recordings?liveAccountId=`}
                          className="text-slate-700"
                          title={delivery.recording_id}
                        >
                          {truncateId(delivery.recording_id)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/users/${delivery.user_id}`}
                          className="text-slate-700"
                        >
                          {truncateId(delivery.user_id)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.via.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={delivery.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(delivery.delivered_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.error ? (
                          <span className="text-xs text-rose-600" title={delivery.error}>
                            {delivery.error.length > 50
                              ? `${delivery.error.slice(0, 50)}...`
                              : delivery.error}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && deliveries.length > 0 && (
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

function DeliveriesPageContainer() {
  const searchParams = useSearchParams();
  return (
    <DeliveriesPageContent
      key={searchParams.toString()}
      searchParams={searchParams}
    />
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <DeliveriesPageContainer />
    </Suspense>
  );
}
