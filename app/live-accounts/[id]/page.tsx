'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import CopyButton from '@/components/CopyButton';
import Pagination from '@/components/Pagination';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LiveAccountRow, RecordingRow } from '@/types/admin';
import { formatDateTime, formatDuration, isUuid, truncateId } from '@/lib/utils/format';
import { fetchAdminWatchUrl } from '@/lib/api/admin';
import { useSession } from '@/components/AuthProvider';

const PAGE_SIZE = 20;

export default function LiveAccountDetailPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const session = useSession();
  const params = useParams();
  const liveAccountId = `${params.id}`;
  const [account, setAccount] = useState<LiveAccountRow | null>(null);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [recordingsTotal, setRecordingsTotal] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const accountId = account?.account_id?.trim();
  const displayAccountId = accountId || account?.id || '';

  useEffect(() => {
    const load = async () => {
      if (!isUuid(liveAccountId)) {
        setError('Invalid live account ID.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data: accountData, error: accountError } = await supabase
        .from('live_accounts')
        .select('id,platform,account_id,canonical_url,status,created_at,updated_at')
        .eq('id', liveAccountId)
        .single();

      if (accountError) {
        setError(accountError.message);
        setIsLoading(false);
        return;
      }

      setAccount(accountData as LiveAccountRow);

      const { count: followerCount } = await supabase
        .from('follows')
        .select('live_account_id', { count: 'exact', head: true })
        .eq('live_account_id', liveAccountId)
        .eq('status', 'active');

      setFollowerCount(followerCount || 0);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let recordingsQuery = supabase
        .from('recordings')
        .select(
          'id,live_account_id,status,started_at,ended_at,duration_sec,storage_path',
          { count: 'exact' }
        )
        .eq('live_account_id', liveAccountId)
        .order('started_at', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'all') {
        recordingsQuery = recordingsQuery.eq('status', statusFilter);
      }

      const { data: recordingData, error: recordingError, count } =
        await recordingsQuery;

      if (recordingError) {
        setError(recordingError.message);
      }

      setRecordings((recordingData || []) as RecordingRow[]);
      setRecordingsTotal(count || 0);
      setIsLoading(false);
    };

    load();
  }, [liveAccountId, page, statusFilter, supabase]);

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

  return (
    <RequireAdmin>
      <AppShell
        title="Live account"
        description="Inspect account details and manage recording playback."
      >
        {error && (
          <div className="mb-6">
            <ErrorBanner title="Unable to load live account" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : !account ? (
          <EmptyState
            title="Live account not found"
            message="No record exists for this account."
          />
        ) : (
          <div className="space-y-8">
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Account ID
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {displayAccountId}
                  </p>
                </div>
                <CopyButton value={displayAccountId} />
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Platform
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {account.platform}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </p>
                  <div className="mt-2">
                    <StatusBadge value={account.status} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Followers
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{followerCount}</p>
                </div>
                {accountId ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Internal ID
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                      <span className="font-mono text-xs text-slate-600">
                        {truncateId(account.id)}
                      </span>
                      <CopyButton value={account.id} />
                    </div>
                  </div>
                ) : null}
                <div className="md:col-span-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Canonical URL
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                    <a
                      href={account.canonical_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted"
                    >
                      {account.canonical_url}
                    </a>
                    <CopyButton value={account.canonical_url} />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Recordings
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">Filter:</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setPage(0);
                      setStatusFilter(event.target.value);
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    <option value="all">All</option>
                    <option value="ready">Ready</option>
                    <option value="failed">Failed</option>
                    <option value="uploading">Uploading</option>
                    <option value="waiting_upload">Waiting upload</option>
                    <option value="live_recording">Live recording</option>
                  </select>
                </div>
              </div>

              {watchError && (
                <div className="mt-4">
                  <ErrorBanner title="Watch URL error" message={watchError} />
                </div>
              )}

              {recordings.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  No recordings for this account.
                </p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Recording</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Started</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recordings.map((recording) => {
                        const isReady =
                          recording.status === 'ready' &&
                          Boolean(recording.storage_path);
                        return (
                          <tr key={recording.id}>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-2">
                                <span className="font-semibold text-slate-900">
                                  {truncateId(recording.id)}
                                </span>
                                <CopyButton value={recording.id} />
                              </div>
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
                                {watchingId === recording.id
                                  ? 'Loading...'
                                  : 'Watch'}
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
              )}

              {recordings.length > 0 && (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={recordingsTotal}
                  onPageChange={setPage}
                />
              )}
            </section>

            <Link
              href="/live-accounts"
              className="text-sm font-semibold text-slate-600 underline decoration-dotted"
            >
              &larr; Back to live accounts
            </Link>
          </div>
        )}
      </AppShell>
    </RequireAdmin>
  );
}
