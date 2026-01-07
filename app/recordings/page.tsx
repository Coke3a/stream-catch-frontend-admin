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
import { useSession } from '@/components/AuthProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { RecordingRow, LiveAccountRow } from '@/types/admin';
import {
  formatDateTime,
  formatDuration,
  isUuid,
  truncateId,
} from '@/lib/utils/format';
import { fetchAdminWatchUrl } from '@/lib/api/admin';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ORDER_FIELDS = ['created_at', 'updated_at'] as const;
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
  { value: 'uploading', label: 'Uploading' },
  { value: 'waiting_upload', label: 'Waiting upload' },
  { value: 'live_recording', label: 'Live recording' },
  { value: 'live_end', label: 'Live end' },
  { value: 'expired_deleted', label: 'Expired deleted' },
];

type OrderBy = (typeof ORDER_FIELDS)[number];
type OrderDirection = 'asc' | 'desc';

type LiveAccountSummary = Pick<
  LiveAccountRow,
  'id' | 'platform' | 'account_id' | 'canonical_url'
>;

type RecordingListRow = Omit<RecordingRow, 'live_accounts'> & {
  live_accounts?: LiveAccountSummary | LiveAccountSummary[] | null;
};

type RecordingsQuery = {
  status: string;
  platform: string;
  liveAccountId: string;
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

const buildRecordingsQuery = (
  status: string,
  platform: string,
  liveAccountId: string,
  orderBy: OrderBy,
  orderDirection: OrderDirection
): RecordingsQuery => ({
  status,
  platform,
  liveAccountId,
  orderBy,
  orderDirection,
});


function RecordingsPageContent({
  searchParams,
}: {
  searchParams: ReadonlyURLSearchParams;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));
  const initialStatus = parseStatus(searchParams.get('status'));
  const initialPlatform = searchParams.get('platform') ?? '';
  const initialLiveAccountId = searchParams.get('liveAccountId') ?? '';
  const initialOrderBy = parseOrderBy(searchParams.get('orderBy'));
  const initialOrderDirection = parseOrderDirection(
    searchParams.get('orderDirection')
  );
  const [recordings, setRecordings] = useState<RecordingListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage - 1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [platformFilter, setPlatformFilter] = useState(initialPlatform);
  const [liveAccountFilter, setLiveAccountFilter] =
    useState(initialLiveAccountId);
  const [orderBy, setOrderBy] = useState<OrderBy>(initialOrderBy);
  const [orderDirection, setOrderDirection] =
    useState<OrderDirection>(initialOrderDirection);
  const [query, setQuery] = useState<RecordingsQuery>(() =>
    buildRecordingsQuery(
      initialStatus,
      initialPlatform,
      initialLiveAccountId,
      initialOrderBy,
      initialOrderDirection
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [watchingId, setWatchingId] = useState<string | null>(null);

  useEffect(() => {
    const loadRecordings = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      if (query.liveAccountId && !isUuid(query.liveAccountId)) {
        setError('Live account ID must be a valid UUID.');
        setRecordings([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      const select = query.platform
        ? 'id,live_account_id,status,started_at,ended_at,duration_sec,storage_path,live_accounts!inner(id,platform,account_id,canonical_url)'
        : 'id,live_account_id,status,started_at,ended_at,duration_sec,storage_path,live_accounts(id,platform,account_id,canonical_url)';

      let recordingsQuery = supabase
        .from('recordings')
        .select(select, { count: 'exact' })
        .order(query.orderBy, { ascending: query.orderDirection === 'asc' })
        .range(from, to);

      if (query.status !== 'all') {
        recordingsQuery = recordingsQuery.eq('status', query.status);
      }

      if (query.platform) {
        recordingsQuery = recordingsQuery.eq('live_accounts.platform', query.platform);
      }

      if (query.liveAccountId) {
        recordingsQuery = recordingsQuery.eq('live_account_id', query.liveAccountId);
      }

      const { data, error, count } = await recordingsQuery;

      if (error) {
        setError(error.message);
        setRecordings([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      setRecordings((data || []) as RecordingListRow[]);
      setTotal(count || 0);
      setIsLoading(false);
    };

    loadRecordings();
  }, [page, pageSize, query, supabase]);

  const handleWatch = async (recordingId: string) => {
    if (!session?.access_token) {
      setWatchError('No active session for watch URL.');
      return;
    }

    setWatchError(null);
    setWatchingId(recordingId);

    try {
      const response = await fetchAdminWatchUrl(
        recordingId,
        session.access_token
      );
      window.open(response.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setWatchError(
        err instanceof Error ? err.message : 'Failed to open watch URL.'
      );
    } finally {
      setWatchingId(null);
    }
  };

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
    const trimmedLiveAccount = liveAccountFilter.trim();
    setPage(0);
    setQuery({
      status: statusFilter,
      platform: trimmedPlatform,
      liveAccountId: trimmedLiveAccount,
      orderBy,
      orderDirection,
    });
    setPlatformFilter(trimmedPlatform);
    setLiveAccountFilter(trimmedLiveAccount);
    updateQueryParams({
      page: 1,
      pageSize,
      status: statusFilter !== 'all' ? statusFilter : null,
      platform: trimmedPlatform || null,
      liveAccountId: trimmedLiveAccount || null,
      orderBy,
      orderDirection,
    });
  };

  const handleClear = () => {
    setStatusFilter('all');
    setPlatformFilter('');
    setLiveAccountFilter('');
    setPage(0);
    setQuery({
      status: 'all',
      platform: '',
      liveAccountId: '',
      orderBy,
      orderDirection,
    });
    updateQueryParams({
      page: 1,
      pageSize,
      status: null,
      platform: null,
      liveAccountId: null,
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
        title="Recordings"
        description="Filter recordings by status, platform, or live account."
      >
        <form
          onSubmit={handleFilter}
          className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
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
            Live account ID
            <input
              value={liveAccountFilter}
              onChange={(event) => setLiveAccountFilter(event.target.value)}
              placeholder="UUID"
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
            {(statusFilter !== 'all' ||
              platformFilter ||
              liveAccountFilter) && (
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
            <ErrorBanner title="Unable to load recordings" message={error} />
          </div>
        )}

        {watchError && (
          <div className="mb-6">
            <ErrorBanner title="Watch URL error" message={watchError} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : recordings.length === 0 ? (
          <EmptyState
            title="No recordings"
            message="Try adjusting your filters or clear the search."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Recording</th>
                    <th className="px-4 py-3">Live account</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recordings.map((recording) => {
                    const liveAccount = Array.isArray(recording.live_accounts)
                      ? recording.live_accounts[0]
                      : recording.live_accounts;
                    const liveAccountLabel =
                      liveAccount?.account_id?.trim() ||
                      truncateId(recording.live_account_id);
                    const isReady =
                      recording.status === 'ready' &&
                      Boolean(recording.storage_path);
                    return (
                      <tr key={recording.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <span className="font-semibold text-slate-900">
                              {truncateId(recording.id)}
                            </span>
                            <CopyButton value={recording.id} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/live-accounts/${recording.live_account_id}`}
                            className="text-slate-700"
                          >
                            {liveAccountLabel}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {liveAccount?.platform || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={recording.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(recording.started_at)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDuration(recording.duration_sec)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={!isReady || watchingId === recording.id}
                            onClick={() => handleWatch(recording.id)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                              isReady
                                ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                                : 'border-slate-200 text-slate-400'
                            }`}
                          >
                            {watchingId === recording.id ? 'Loading...' : 'Watch'}
                          </button>
                          {!isReady && (
                            <p className="mt-2 text-xs text-slate-400">
                              Not ready
                            </p>
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

        {!isLoading && recordings.length > 0 && (
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

function RecordingsPageContainer() {
  const searchParams = useSearchParams();
  return (
    <RecordingsPageContent
      key={searchParams.toString()}
      searchParams={searchParams}
    />
  );
}

export default function RecordingsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <RecordingsPageContainer />
    </Suspense>
  );
}
