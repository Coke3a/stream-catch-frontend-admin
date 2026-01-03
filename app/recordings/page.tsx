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
import { useSession } from '@/components/AuthProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { RecordingRow, LiveAccountRow } from '@/types/admin';
import { formatDateTime, formatDuration, isUuid, truncateId } from '@/lib/utils/format';
import { fetchAdminWatchUrl } from '@/lib/api/admin';

const PAGE_SIZE = 20;

type LiveAccountSummary = Pick<
  LiveAccountRow,
  'id' | 'platform' | 'account_id' | 'canonical_url'
>;

type RecordingListRow = Omit<RecordingRow, 'live_accounts'> & {
  live_accounts?: LiveAccountSummary | LiveAccountSummary[] | null;
};

export default function RecordingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const session = useSession();
  const [recordings, setRecordings] = useState<RecordingListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('');
  const [liveAccountFilter, setLiveAccountFilter] = useState('');
  const [query, setQuery] = useState({
    status: 'all',
    platform: '',
    liveAccountId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [watchingId, setWatchingId] = useState<string | null>(null);

  useEffect(() => {
    const loadRecordings = async () => {
      setIsLoading(true);
      setError(null);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

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
        .order('started_at', { ascending: false })
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
  }, [page, query, supabase]);

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

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(0);
    setQuery({
      status: statusFilter,
      platform: platformFilter.trim().toLowerCase(),
      liveAccountId: liveAccountFilter.trim(),
    });
  };

  return (
    <RequireAdmin>
      <AppShell
        title="Recordings"
        description="Filter recordings by status, platform, or live account."
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
              <option value="all">All</option>
              <option value="ready">Ready</option>
              <option value="failed">Failed</option>
              <option value="uploading">Uploading</option>
              <option value="waiting_upload">Waiting upload</option>
              <option value="live_recording">Live recording</option>
              <option value="live_end">Live end</option>
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

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-500"
            >
              Apply filters
            </button>
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
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        )}
      </AppShell>
    </RequireAdmin>
  );
}
