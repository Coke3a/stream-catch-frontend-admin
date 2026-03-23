'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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
import { JobRow } from '@/types/admin';
import { formatDateTime, truncateId } from '@/lib/utils/format';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
  { value: 'dead', label: 'Dead' },
];

const ORDER_OPTIONS = [
  { value: 'created_at', label: 'Created' },
  { value: 'run_at', label: 'Run at' },
];

type OrderBy = 'created_at' | 'run_at';
type OrderDirection = 'asc' | 'desc';

const parsePage = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
};

const parsePageSize = (value: string | null) => {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
};

function JobsPageContent({
  searchParams,
}: {
  searchParams: ReadonlyURLSearchParams;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));
  const initialStatus = searchParams.get('status') ?? 'all';
  const initialType = searchParams.get('type') ?? '';
  const initialOrderBy = (searchParams.get('orderBy') === 'run_at' ? 'run_at' : 'created_at') as OrderBy;
  const initialOrderDirection = (searchParams.get('orderDirection') === 'asc' ? 'asc' : 'desc') as OrderDirection;

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage - 1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [orderBy, setOrderBy] = useState<OrderBy>(initialOrderBy);
  const [orderDirection, setOrderDirection] = useState<OrderDirection>(initialOrderDirection);
  const [query, setQuery] = useState({
    status: initialStatus,
    type: initialType,
    orderBy: initialOrderBy,
    orderDirection: initialOrderDirection,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const loadJobs = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let jobsQuery = supabase
        .from('jobs')
        .select('id,type,status,attempts,run_at,locked_at,locked_by,error,created_at', { count: 'exact' })
        .order(query.orderBy, { ascending: query.orderDirection === 'asc' })
        .range(from, to);

      if (query.status !== 'all') {
        jobsQuery = jobsQuery.eq('status', query.status);
      }

      if (query.type) {
        jobsQuery = jobsQuery.eq('type', query.type);
      }

      const { data, error, count } = await jobsQuery;

      if (error) {
        setError(error.message);
        setJobs([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      setJobs((data || []) as JobRow[]);
      setTotal(count || 0);
      setIsLoading(false);
    };

    loadJobs();
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
      status: statusFilter,
      type: typeFilter.trim(),
      orderBy,
      orderDirection,
    });
    updateQueryParams({
      page: 1,
      pageSize,
      status: statusFilter !== 'all' ? statusFilter : null,
      type: typeFilter.trim() || null,
      orderBy,
      orderDirection,
    });
  };

  const handleClear = () => {
    setStatusFilter('all');
    setTypeFilter('');
    setPage(0);
    setQuery({ status: 'all', type: '', orderBy, orderDirection });
    updateQueryParams({
      page: 1,
      pageSize,
      status: null,
      type: null,
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
        title="Job queue"
        description="Monitor background jobs: uploads, notifications, and other async tasks."
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
            Type
            <input
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              placeholder="upload_recording"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order by
            <select
              value={orderBy}
              onChange={(event) => setOrderBy(event.target.value as OrderBy)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Direction
            <select
              value={orderDirection}
              onChange={(event) => setOrderDirection(event.target.value as OrderDirection)}
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
            {(statusFilter !== 'all' || typeFilter) && (
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
            <ErrorBanner title="Unable to load jobs" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No jobs"
            message="Try adjusting your filters or check back later."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Job</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Run at</th>
                    <th className="px-4 py-3">Locked by</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="cursor-pointer hover:bg-slate-50/60"
                      onClick={() =>
                        setExpandedId(expandedId === job.id ? null : job.id)
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <span className="font-semibold text-slate-900">
                            {truncateId(job.id)}
                          </span>
                          <CopyButton value={job.id} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{job.type}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={job.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{job.attempts}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(job.run_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {job.locked_by || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(job.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expandedId && (() => {
              const job = jobs.find((j) => j.id === expandedId);
              if (!job) return null;
              return (
                <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Locked at
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {formatDateTime(job.locked_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Locked by
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {job.locked_by || '-'}
                      </p>
                    </div>
                  </div>
                  {job.error && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Error
                      </p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                        {job.error}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {!isLoading && jobs.length > 0 && (
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

function JobsPageContainer() {
  const searchParams = useSearchParams();
  return (
    <JobsPageContent
      key={searchParams.toString()}
      searchParams={searchParams}
    />
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <JobsPageContainer />
    </Suspense>
  );
}
