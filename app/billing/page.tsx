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
import { InvoiceRow, PaymentRow } from '@/types/admin';
import {
  formatDateTime,
  formatCurrency,
  truncateId,
} from '@/lib/utils/format';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const INVOICE_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'void', label: 'Void' },
  { value: 'past_due', label: 'Past due' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'requires_action', label: 'Requires action' },
  { value: 'failed', label: 'Failed' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'card', label: 'Card' },
  { value: 'promptpay', label: 'PromptPay' },
];

type TabKey = 'invoices' | 'payments';

const parsePage = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
};

const parsePageSize = (value: string | null) => {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
};

function BillingPageContent({
  searchParams,
}: {
  searchParams: ReadonlyURLSearchParams;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const initialTab = (searchParams.get('tab') === 'payments' ? 'payments' : 'invoices') as TabKey;
  const initialPage = parsePage(searchParams.get('page'));
  const initialPageSize = parsePageSize(searchParams.get('pageSize'));

  const [tab, setTab] = useState<TabKey>(initialTab);

  // Invoice state
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoicePage, setInvoicePage] = useState(initialTab === 'invoices' ? initialPage - 1 : 0);
  const [invoicePageSize, setInvoicePageSize] = useState(initialTab === 'invoices' ? initialPageSize : DEFAULT_PAGE_SIZE);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState(searchParams.get('status') ?? 'all');
  const [invoiceQuery, setInvoiceQuery] = useState({ status: searchParams.get('status') ?? 'all' });

  // Payment state
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentPage, setPaymentPage] = useState(initialTab === 'payments' ? initialPage - 1 : 0);
  const [paymentPageSize, setPaymentPageSize] = useState(initialTab === 'payments' ? initialPageSize : DEFAULT_PAGE_SIZE);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(searchParams.get('paymentStatus') ?? 'all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(searchParams.get('methodType') ?? 'all');
  const [paymentQuery, setPaymentQuery] = useState({
    status: searchParams.get('paymentStatus') ?? 'all',
    methodType: searchParams.get('methodType') ?? 'all',
  });

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (tab !== 'invoices') return;

    const loadInvoices = async () => {
      setIsLoading(true);
      setError(null);

      const from = invoicePage * invoicePageSize;
      const to = from + invoicePageSize - 1;

      let query = supabase
        .from('invoices')
        .select('id,user_id,plan_id,amount_minor,currency,period_start,period_end,status,created_at,paid_at,plans(id,name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (invoiceQuery.status !== 'all') {
        query = query.eq('status', invoiceQuery.status);
      }

      const { data, error, count } = await query;

      if (error) {
        setError(error.message);
        setInvoices([]);
        setInvoiceTotal(0);
        setIsLoading(false);
        return;
      }

      setInvoices((data || []) as InvoiceRow[]);
      setInvoiceTotal(count || 0);
      setIsLoading(false);
    };

    loadInvoices();
  }, [invoicePage, invoicePageSize, invoiceQuery, tab, supabase]);

  useEffect(() => {
    if (tab !== 'payments') return;

    const loadPayments = async () => {
      setIsLoading(true);
      setError(null);

      const from = paymentPage * paymentPageSize;
      const to = from + paymentPageSize - 1;

      let query = supabase
        .from('payments')
        .select('id,invoice_id,user_id,provider,method_type,amount_minor,currency,status,provider_payment_id,error,created_at,updated_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (paymentQuery.status !== 'all') {
        query = query.eq('status', paymentQuery.status);
      }

      if (paymentQuery.methodType !== 'all') {
        query = query.eq('method_type', paymentQuery.methodType);
      }

      const { data, error, count } = await query;

      if (error) {
        setError(error.message);
        setPayments([]);
        setPaymentTotal(0);
        setIsLoading(false);
        return;
      }

      setPayments((data || []) as PaymentRow[]);
      setPaymentTotal(count || 0);
      setIsLoading(false);
    };

    loadPayments();
  }, [paymentPage, paymentPageSize, paymentQuery, tab, supabase]);

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

  const handleTabChange = (nextTab: TabKey) => {
    setTab(nextTab);
    updateQueryParams({ tab: nextTab, page: 1 });
  };

  const handleInvoiceFilter = (event: React.FormEvent) => {
    event.preventDefault();
    setInvoicePage(0);
    setInvoiceQuery({ status: invoiceStatusFilter });
    updateQueryParams({
      page: 1,
      status: invoiceStatusFilter !== 'all' ? invoiceStatusFilter : null,
    });
  };

  const handlePaymentFilter = (event: React.FormEvent) => {
    event.preventDefault();
    setPaymentPage(0);
    setPaymentQuery({ status: paymentStatusFilter, methodType: paymentMethodFilter });
    updateQueryParams({
      page: 1,
      paymentStatus: paymentStatusFilter !== 'all' ? paymentStatusFilter : null,
      methodType: paymentMethodFilter !== 'all' ? paymentMethodFilter : null,
    });
  };

  return (
    <RequireAdmin>
      <AppShell
        title="Billing"
        description="Review invoices and payment transactions."
      >
        <div className="mb-6 flex gap-2">
          {(['invoices', 'payments'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleTabChange(key)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                tab === key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-400'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6">
            <ErrorBanner title="Unable to load data" message={error} />
          </div>
        )}

        {tab === 'invoices' && (
          <>
            <form
              onSubmit={handleInvoiceFilter}
              className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
            >
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
                <select
                  value={invoiceStatusFilter}
                  onChange={(event) => setInvoiceStatusFilter(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {INVOICE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-2 lg:col-start-3">
                <button
                  type="submit"
                  className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:border-slate-500"
                >
                  Apply filters
                </button>
                {invoiceQuery.status !== 'all' && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceStatusFilter('all');
                      setInvoicePage(0);
                      setInvoiceQuery({ status: 'all' });
                      updateQueryParams({ page: 1, status: null });
                    }}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-slate-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>

            {isLoading ? (
              <LoadingSkeleton rows={6} />
            ) : invoices.length === 0 ? (
              <EmptyState title="No invoices" message="Try adjusting your filters." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] text-left text-sm">
                    <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Invoice</th>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Plan</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Period</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Paid at</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.map((invoice) => {
                        const plan = Array.isArray(invoice.plans) ? invoice.plans[0] : invoice.plans;
                        return (
                          <tr key={invoice.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-2">
                                <span className="font-semibold text-slate-900">
                                  {truncateId(invoice.id)}
                                </span>
                                <CopyButton value={invoice.id} />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/users/${invoice.user_id}`}
                                className="text-slate-700"
                              >
                                {truncateId(invoice.user_id)}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {plan?.name || '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatCurrency(invoice.amount_minor, invoice.currency)}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <div className="flex flex-col gap-1 text-xs">
                                <span>{formatDateTime(invoice.period_start)}</span>
                                <span>{formatDateTime(invoice.period_end)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge value={invoice.status} />
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

            {!isLoading && invoices.length > 0 && (
              <Pagination
                page={invoicePage}
                pageSize={invoicePageSize}
                total={invoiceTotal}
                onPageChange={(p) => {
                  setInvoicePage(p);
                  updateQueryParams({ page: p + 1 });
                }}
                onPageSizeChange={(s) => {
                  setInvoicePageSize(s);
                  setInvoicePage(0);
                  updateQueryParams({ page: 1, pageSize: s });
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            )}
          </>
        )}

        {tab === 'payments' && (
          <>
            <form
              onSubmit={handlePaymentFilter}
              className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
            >
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
                <select
                  value={paymentStatusFilter}
                  onChange={(event) => setPaymentStatusFilter(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {PAYMENT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Method type
                <select
                  value={paymentMethodFilter}
                  onChange={(event) => setPaymentMethodFilter(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
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
                {(paymentQuery.status !== 'all' || paymentQuery.methodType !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentStatusFilter('all');
                      setPaymentMethodFilter('all');
                      setPaymentPage(0);
                      setPaymentQuery({ status: 'all', methodType: 'all' });
                      updateQueryParams({ page: 1, paymentStatus: null, methodType: null });
                    }}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-slate-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>

            {isLoading ? (
              <LoadingSkeleton rows={6} />
            ) : payments.length === 0 ? (
              <EmptyState title="No payments" message="Try adjusting your filters." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1060px] text-left text-sm">
                    <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Payment</th>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Provider</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Provider ID</th>
                        <th className="px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <span className="font-semibold text-slate-900">
                                {truncateId(payment.id)}
                              </span>
                              <CopyButton value={payment.id} />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/users/${payment.user_id}`}
                              className="text-slate-700"
                            >
                              {truncateId(payment.user_id)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {payment.provider}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {payment.method_type}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatCurrency(payment.amount_minor, payment.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge value={payment.status} />
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {payment.provider_payment_id ? (
                              <div className="flex flex-col gap-2">
                                <span className="text-xs">
                                  {truncateId(payment.provider_payment_id, 10)}
                                </span>
                                <CopyButton value={payment.provider_payment_id} />
                              </div>
                            ) : (
                              '-'
                            )}
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

            {!isLoading && payments.length > 0 && (
              <Pagination
                page={paymentPage}
                pageSize={paymentPageSize}
                total={paymentTotal}
                onPageChange={(p) => {
                  setPaymentPage(p);
                  updateQueryParams({ page: p + 1 });
                }}
                onPageSizeChange={(s) => {
                  setPaymentPageSize(s);
                  setPaymentPage(0);
                  updateQueryParams({ page: 1, pageSize: s });
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            )}
          </>
        )}
      </AppShell>
    </RequireAdmin>
  );
}

function BillingPageContainer() {
  const searchParams = useSearchParams();
  return (
    <BillingPageContent
      key={searchParams.toString()}
      searchParams={searchParams}
    />
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={6} />}>
      <BillingPageContainer />
    </Suspense>
  );
}
