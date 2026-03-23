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
  DownloadQuotaRow,
  FollowRow,
  InvoiceRow,
  LiveAccountRow,
  PaymentMethodRow,
  PaymentRow,
  PlanRow,
  RecordingRow,
  SubscriptionRow,
  TelemetryEventRow,
} from '@/types/admin';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  isUuid,
  truncateId,
} from '@/lib/utils/format';

type PlanSummary = Pick<PlanRow, 'id' | 'name' | 'features'>;

type SubscriptionDetailsRow = Omit<SubscriptionRow, 'plan'> & {
  plan?: PlanSummary | PlanSummary[] | null;
  canceled_at?: string | null;
  provider_subscription_id?: string | null;
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

type InvoiceListRow = Omit<InvoiceRow, 'plans'> & {
  plans?: PlanSummary | PlanSummary[] | null;
};

export default function UserDetailPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const params = useParams();
  const userId = `${params.id}`;
  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [appUserInfo, setAppUserInfo] = useState<{
    trial_ends_at: string | null;
    last_country_code: string | null;
  } | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionDetailsRow[]>([]);
  const [follows, setFollows] = useState<FollowListRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingListRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [downloadQuota, setDownloadQuota] = useState<DownloadQuotaRow[]>([]);
  const [telemetryEvents, setTelemetryEvents] = useState<TelemetryEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

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

      // Fetch all data in parallel
      const [
        subsResult,
        followResult,
        invoiceResult,
        paymentResult,
        methodResult,
        quotaResult,
        telemetryResult,
        appUserResult,
      ] = await Promise.all([
        supabase
          .from('subscriptions')
          .select(
            'id,user_id,status,starts_at,ends_at,billing_mode,cancel_at_period_end,canceled_at,provider_subscription_id,plan:plans(id,name,features)'
          )
          .eq('user_id', userId)
          .order('starts_at', { ascending: false }),
        supabase
          .from('follows')
          .select(
            'user_id,live_account_id,status,created_at,live_accounts(id,platform,account_id,canonical_url,status)'
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('id,user_id,plan_id,amount_minor,currency,period_start,period_end,status,created_at,paid_at,plans(id,name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('payments')
          .select('id,invoice_id,user_id,provider,method_type,amount_minor,currency,status,provider_payment_id,error,created_at,updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('payment_methods')
          .select('id,user_id,provider,brand,last4,exp_month,exp_year,is_default,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('download_quota_weekly')
          .select('user_id,week_start,count,updated_at')
          .eq('user_id', userId)
          .order('week_start', { ascending: false })
          .limit(12),
        supabase
          .from('telemetry_events')
          .select('id,received_at,user_id,session_id,name,page,source,plan,platform,props,client_ts')
          .eq('user_id', userId)
          .order('received_at', { ascending: false })
          .limit(50),
        supabase
          .from('app_users')
          .select('id,trial_ends_at,last_country_code')
          .eq('id', userId)
          .maybeSingle(),
      ]);

      if (subsResult.error) setError(subsResult.error.message);
      if (followResult.error) setError(followResult.error.message);

      setSubscriptions((subsResult.data || []) as SubscriptionDetailsRow[]);

      const followRows = (followResult.data || []) as FollowListRow[];
      setFollows(followRows);
      setInvoices((invoiceResult.data || []) as InvoiceListRow[]);
      setPayments((paymentResult.data || []) as PaymentRow[]);
      setPaymentMethods((methodResult.data || []) as PaymentMethodRow[]);
      setDownloadQuota((quotaResult.data || []) as DownloadQuotaRow[]);
      setTelemetryEvents((telemetryResult.data || []) as TelemetryEventRow[]);

      if (appUserResult.error) {
        setError(appUserResult.error.message);
      } else if (appUserResult.data) {
        const appUser = appUserResult.data as { trial_ends_at: string | null; last_country_code: string | null };
        setAppUserInfo({
          trial_ends_at: appUser.trial_ends_at,
          last_country_code: appUser.last_country_code,
        });
      } else {
        setAppUserInfo(null);
      }

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
        description="Review subscription status, billing history, follows, and recent recordings."
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
            {/* User info */}
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

            {/* Trial status */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Trial status
              </h2>
              {appUserInfo ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Trial ends at
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {formatDateTime(appUserInfo.trial_ends_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </p>
                    <div className="mt-2">
                      <StatusBadge
                        value={
                          !appUserInfo.trial_ends_at
                            ? 'none'
                            : new Date(appUserInfo.trial_ends_at) > new Date()
                              ? 'active'
                              : 'expired'
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last country code
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {appUserInfo.last_country_code || '-'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  No app_users record found for this user.
                </p>
              )}
            </section>

            {/* Subscription history */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Subscription history
              </h2>
              {subscriptions.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No subscriptions on file.
                </p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[840px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Billing</th>
                          <th className="px-4 py-3">Starts</th>
                          <th className="px-4 py-3">Ends</th>
                          <th className="px-4 py-3">Canceled</th>
                          <th className="px-4 py-3">Provider ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {subscriptions.map((sub) => {
                          const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan;
                          return (
                            <tr key={sub.id}>
                              <td className="px-4 py-3 text-slate-700">
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
                                {sub.canceled_at
                                  ? formatDateTime(sub.canceled_at)
                                  : sub.cancel_at_period_end
                                    ? 'At period end'
                                    : '-'}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {sub.provider_subscription_id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs">{truncateId(sub.provider_subscription_id, 10)}</span>
                                    <CopyButton value={sub.provider_subscription_id} />
                                  </div>
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
            </section>

            {/* Invoices */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Invoices
              </h2>
              {invoices.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No invoices found.</p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Invoice</th>
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Period</th>
                          <th className="px-4 py-3">Paid at</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoices.map((invoice) => {
                          const plan = Array.isArray(invoice.plans) ? invoice.plans[0] : invoice.plans;
                          return (
                            <tr key={invoice.id}>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-slate-600">{truncateId(invoice.id)}</span>
                                  <CopyButton value={invoice.id} />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{plan?.name || '-'}</td>
                              <td className="px-4 py-3 text-slate-600">
                                {formatCurrency(invoice.amount_minor, invoice.currency)}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge value={invoice.status} />
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                <div className="flex flex-col gap-1 text-xs">
                                  <span>{formatDateTime(invoice.period_start)}</span>
                                  <span>{formatDateTime(invoice.period_end)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {formatDateTime(invoice.paid_at)}
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

            {/* Payments */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Payments
              </h2>
              {payments.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No payments found.</p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Payment</th>
                          <th className="px-4 py-3">Provider</th>
                          <th className="px-4 py-3">Method</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-600">{truncateId(payment.id)}</span>
                                <CopyButton value={payment.id} />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{payment.provider}</td>
                            <td className="px-4 py-3 text-slate-600">{payment.method_type}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatCurrency(payment.amount_minor, payment.currency)}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge value={payment.status} />
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatDateTime(payment.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Payment methods */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Payment methods
              </h2>
              {paymentMethods.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No payment methods on file.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {method.brand || method.provider}{' '}
                          {method.last4 ? `****${method.last4}` : ''}
                        </span>
                        {method.is_default && (
                          <span className="rounded-full border border-emerald-200 bg-emerald-100/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Expires: {method.exp_month && method.exp_year ? `${method.exp_month}/${method.exp_year}` : '-'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Added: {formatDateTime(method.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Download quota */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Download quota (weekly)
              </h2>
              {downloadQuota.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No download quota records.
                </p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Week start</th>
                          <th className="px-4 py-3">Downloads</th>
                          <th className="px-4 py-3">Last updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {downloadQuota.map((quota) => (
                          <tr key={quota.week_start}>
                            <td className="px-4 py-3 text-slate-700">
                              {formatDateTime(quota.week_start)}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {quota.count}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatDateTime(quota.updated_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Follows */}
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

            {/* Recordings */}
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

            {/* Activity timeline */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Activity timeline (recent 50 events)
              </h2>
              {telemetryEvents.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No telemetry events recorded.
                </p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Event</th>
                          <th className="px-4 py-3">Page</th>
                          <th className="px-4 py-3">Platform</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {telemetryEvents.map((event) => (
                          <tr
                            key={event.id}
                            className="cursor-pointer hover:bg-slate-50/60"
                            onClick={() =>
                              setExpandedEventId(
                                expandedEventId === event.id ? null : event.id
                              )
                            }
                          >
                            <td className="px-4 py-3 text-slate-600">
                              {formatDateTime(event.received_at)}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {event.name}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {event.page || '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {event.platform || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {expandedEventId && (() => {
                    const event = telemetryEvents.find((e) => e.id === expandedEventId);
                    if (!event || !event.props || Object.keys(event.props).length === 0) return null;
                    return (
                      <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Props
                        </p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                          {JSON.stringify(event.props, null, 2)}
                        </pre>
                      </div>
                    );
                  })()}
                </div>
              )}
            </section>
          </div>
        )}
      </AppShell>
    </RequireAdmin>
  );
}
