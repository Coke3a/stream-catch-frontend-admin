'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import StatusBadge from '@/components/StatusBadge';
import CopyButton from '@/components/CopyButton';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  AdminUserRow,
  FollowRow,
  LiveAccountRow,
  PlanRow,
  RecordingRow,
  SubscriptionRow,
} from '@/types/admin';
import {
  formatDateTime,
  formatDuration,
  isUuid,
  truncateId,
} from '@/lib/utils/format';

type PlanSummary = Pick<PlanRow, 'id' | 'name' | 'features'>;

type SubscriptionDetailsRow = Omit<SubscriptionRow, 'plan'> & {
  plan?: PlanSummary | PlanSummary[] | null;
};

type LiveAccountSummary = Pick<
  LiveAccountRow,
  'id' | 'platform' | 'account_id' | 'canonical_url' | 'status'
>;

type FollowListRow = Omit<FollowRow, 'live_accounts'> & {
  live_accounts?: LiveAccountSummary | LiveAccountSummary[] | null;
};

type RecordingAccountSummary = Pick<LiveAccountRow, 'account_id'>;

type RecordingListRow = Omit<RecordingRow, 'live_accounts'> & {
  live_accounts?: RecordingAccountSummary | RecordingAccountSummary[] | null;
};

export default function UserDetailPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const params = useParams();
  const userId = `${params.id}`;
  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [subscription, setSubscription] =
    useState<SubscriptionDetailsRow | null>(null);
  const [follows, setFollows] = useState<FollowListRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const subscriptionPlan = Array.isArray(subscription?.plan)
    ? subscription?.plan[0]
    : subscription?.plan;

  useEffect(() => {
    const load = async () => {
      if (!isUuid(userId)) {
        setError('Invalid user ID.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data: userData, error: userError } = await supabase.rpc(
        'admin_list_users',
        {
          limit_count: 1,
          offset_count: 0,
          filter_user_id: userId,
        }
      );

      if (userError) {
        setError(userError.message);
        setIsLoading(false);
        return;
      }

      const row = (userData || [])[0] as AdminUserRow | undefined;
      if (!row) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      setUser(row);

      const { data: subscriptionData } = await supabase
        .from('subscriptions')
        .select(
          'id,user_id,status,starts_at,ends_at,billing_mode,cancel_at_period_end,plan:plans(id,name,features)'
        )
        .eq('user_id', userId)
        .order('starts_at', { ascending: false })
        .limit(1);

      setSubscription(
        subscriptionData?.[0]
          ? (subscriptionData[0] as SubscriptionDetailsRow)
          : null
      );

      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select(
          'user_id,live_account_id,status,created_at,live_accounts(id,platform,account_id,canonical_url,status)'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (followError) {
        setError(followError.message);
      }

      const followRows = (followData || []) as FollowListRow[];
      setFollows(followRows);

      const liveAccountIds = followRows.map((follow) => follow.live_account_id);
      if (liveAccountIds.length > 0) {
        const { data: recordingData, error: recordingError } = await supabase
          .from('recordings')
          .select(
            'id,live_account_id,status,started_at,ended_at,duration_sec,live_accounts(account_id)'
          )
          .in('live_account_id', liveAccountIds)
          .order('started_at', { ascending: false })
          .limit(20);

        if (recordingError) {
          setError(recordingError.message);
        }

        setRecordings((recordingData || []) as RecordingListRow[]);
      } else {
        setRecordings([]);
      }

      setIsLoading(false);
    };

    load();
  }, [supabase, userId]);

  return (
    <RequireAdmin>
      <AppShell
        title="User profile"
        description="Review subscription status, follows, and recent recordings."
      >
        {error && (
          <div className="mb-6">
            <ErrorBanner title="Unable to load user" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : !user ? (
          <EmptyState title="User not found" message="No record exists." />
        ) : (
          <div className="space-y-8">
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    User ID
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {user.id}
                  </p>
                </div>
                <CopyButton value={user.id} />
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {user.email || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Role
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {user.role || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Admin
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {user.is_admin ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Created
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {formatDateTime(user.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Last sign-in
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {formatDateTime(user.last_sign_in_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email confirmed
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {formatDateTime(user.email_confirmed_at)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Subscription
              </h2>
              {subscription ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </p>
                    <div className="mt-2">
                      <StatusBadge value={subscription.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Plan
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {subscriptionPlan?.name || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ends
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {formatDateTime(subscription.ends_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Billing mode
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {subscription.billing_mode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Cancel at period end
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {subscription.cancel_at_period_end ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  No subscription on file.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Follows
              </h2>
              {follows.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No follows found for this user.
                </p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Live account</th>
                          <th className="px-4 py-3">Platform</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Followed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {follows.map((follow) => {
                          const liveAccount = Array.isArray(follow.live_accounts)
                            ? follow.live_accounts[0]
                            : follow.live_accounts;
                          const liveAccountLabel =
                            liveAccount?.account_id?.trim() ||
                            truncateId(follow.live_account_id);
                          return (
                            <tr key={`${follow.user_id}-${follow.live_account_id}`}>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/live-accounts/${follow.live_account_id}`}
                                  className="font-semibold text-slate-900"
                                >
                                  {liveAccountLabel}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {liveAccount?.platform || '-'}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge value={follow.status} />
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {formatDateTime(follow.created_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Recent recordings from followed accounts
              </h2>
              {recordings.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No recordings available for followed accounts.
                </p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Recording</th>
                          <th className="px-4 py-3">Live account</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Started</th>
                          <th className="px-4 py-3">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recordings.map((recording) => {
                          const liveAccount = Array.isArray(
                            recording.live_accounts
                          )
                            ? recording.live_accounts[0]
                            : recording.live_accounts;
                          return (
                            <tr key={recording.id}>
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {truncateId(recording.id)}
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/live-accounts/${recording.live_account_id}`}
                                  className="text-slate-700"
                                >
                                  {liveAccount?.account_id?.trim() ||
                                    truncateId(recording.live_account_id)}
                                </Link>
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </AppShell>
    </RequireAdmin>
  );
}
