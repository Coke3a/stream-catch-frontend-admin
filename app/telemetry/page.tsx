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
import CopyButton from '@/components/CopyButton';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { TelemetryEventRow } from '@/types/admin';
import { formatDateTime, isUuid, truncateId } from '@/lib/utils/format';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const parsePage = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
};

const parsePageSize = (value: string | null) => {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
};

function TelemetryPageContent({
  searchParams,
}: {
  searchParams: ReadonlyURLSearchParams;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));

  const [events, setEvents] = useState<TelemetryEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage - 1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [nameFilter, setNameFilter] = useState(searchParams.get('name') ?? '');
  const [userIdFilter, setUserIdFilter] = useState(searchParams.get('userId') ?? '');
  const [platformFilter, setPlatformFilter] = useState(searchParams.get('platform') ?? '');
  const [query, setQuery] = useState({
    name: searchParams.get('name') ?? '',
    userId: searchParams.get('userId') ?? '',
    platform: searchParams.get('platform') ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      setIsLoading(true);
      setError(null);

      if (query.userId && !isUuid(query.userId)) {
        setError('User ID must be a valid UUID.');
        setEvents([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let eventsQuery = supabase
        .from('telemetry_events')
        .select('id,received_at,user_id,session_id,name,page,source,plan,platform,recording_id,live_account_id,props,client_ts', { count: 'exact' })
        .order('received_at', { ascending: false })
        .range(from, to);

      if (query.name) {
        eventsQuery = eventsQuery.eq('name', query.name);
      }

      if (query.userId) {
        eventsQuery = eventsQuery.eq('user_id', query.userId);
      }

      if (query.platform) {
        eventsQuery = eventsQuery.eq('platform', query.platform);
      }

      const { data, error, count } = await eventsQuery;

      if (error) {
        setError(error.message);
        setEvents([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      setEvents((data || []) as TelemetryEventRow[]);
      setTotal(count || 0);
      setIsLoading(false);
    };

    loadEvents();
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
    setQuery({
      name: nameFilter.trim(),
      userId: userIdFilter.trim(),
      platform: platformFilter.trim(),
    });
    updateQueryParams({
      page: 1,
      pageSize,
      name: nameFilter.trim() || null,
      userId: userIdFilter.trim() || null,
      platform: platformFilter.trim() || null,
    });
  };

  const handleClear = () => {
    setNameFilter('');
    setUserIdFilter('');
    setPlatformFilter('');
    setPage(0);
    setQuery({ name: '', userId: '', platform: '' });
    updateQueryParams({
      page: 1,
      pageSize,
      name: null,
      userId: null,
      platform: null,
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
        title="Telemetry events"
        description="Browse product analytics events to understand user behavior."
      >
        <form
          onSubmit={handleFilter}
          className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Event name
            <input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="page_view"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            User ID
            <input
              value={userIdFilter}
              onChange={(event) => setUserIdFilter(event.target.value)}
              placeholder="UUID"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Platform
            <input
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value)}
              placeholder="web"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-500"
            >
              Apply filters
            </button>
            {(query.name || query.userId || query.platform) && (
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
            <ErrorBanner title="Unable to load events" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : events.length === 0 ? (
          <EmptyState
            title="No events"
            message="Try adjusting your filters or check back later."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Page</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Plan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="cursor-pointer hover:bg-slate-50/60"
                      onClick={() =>
                        setExpandedId(expandedId === event.id ? null : event.id)
                      }
                    >
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(event.received_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/users/${event.user_id}`}
                          className="text-slate-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {truncateId(event.user_id)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {event.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {event.page || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {event.source || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {event.platform || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {event.plan || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expandedId && (() => {
              const event = events.find((e) => e.id === expandedId);
              if (!event) return null;
              return (
                <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Event ID
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm text-slate-700">{truncateId(event.id)}</span>
                        <CopyButton value={event.id} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Session ID
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {event.session_id ? truncateId(event.session_id) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Client timestamp
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {formatDateTime(event.client_ts)}
                      </p>
                    </div>
                  </div>
                  {event.props && Object.keys(event.props).length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Props
                      </p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                        {JSON.stringify(event.props, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {!isLoading && events.length > 0 && (
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

function TelemetryPageContainer() {
  const searchParams = useSearchParams();
  return (
    <TelemetryPageContent
      key={searchParams.toString()}
      searchParams={searchParams}
    />
  );
}

export default function TelemetryPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <TelemetryPageContainer />
    </Suspense>
  );
}
