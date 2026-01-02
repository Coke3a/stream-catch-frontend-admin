'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import StatusBadge from '@/components/StatusBadge';
import CopyButton from '@/components/CopyButton';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { SupportTicketRow } from '@/types/admin';
import { formatDateTime, isUuid, truncateId } from '@/lib/utils/format';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
] as const;

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'question', label: 'Question' },
] as const;

export default function SupportTicketsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({
    status: 'all',
    category: 'all',
    search: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  useEffect(() => {
    const loadTickets = async () => {
      setIsLoading(true);
      setError(null);
      setUpdateError(null);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let ticketsQuery = supabase
        .from('support_tickets')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (query.status !== 'all') {
        ticketsQuery = ticketsQuery.eq('status', query.status);
      }

      if (query.category !== 'all') {
        ticketsQuery = ticketsQuery.eq('category', query.category);
      }

      if (query.search) {
        const trimmed = query.search.trim();
        if (isUuid(trimmed)) {
          ticketsQuery = ticketsQuery.or(`user_id.eq.${trimmed},id.eq.${trimmed}`);
        } else {
          const escaped = trimmed.replace(/[%_]/g, '\\$&');
          ticketsQuery = ticketsQuery.or(
            `subject.ilike.%${escaped}%,email.ilike.%${escaped}%`
          );
        }
      }

      const { data, error, count } = await ticketsQuery;

      if (error) {
        setError(error.message);
        setTickets([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      const rows = (data || []) as SupportTicketRow[];
      setTickets(rows);
      setTotal(count || 0);
      setSelectedTicketId((current) =>
        current && rows.some((ticket) => ticket.id === current) ? current : null
      );
      setIsLoading(false);
    };

    loadTickets();
  }, [page, query, supabase]);

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(0);
    setQuery({
      status: statusFilter,
      category: categoryFilter,
      search: search.trim(),
    });
  };

  const handleClear = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setSearch('');
    setQuery({
      status: 'all',
      category: 'all',
      search: '',
    });
    setPage(0);
  };

  const handleStatusUpdate = async (ticket: SupportTicketRow, nextStatus: string) => {
    if (ticket.status === nextStatus) {
      return;
    }

    setUpdatingId(ticket.id);
    setUpdateError(null);

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status: nextStatus })
      .eq('id', ticket.id)
      .select('status, updated_at')
      .single();

    if (error) {
      setUpdateError(error.message);
      setUpdatingId(null);
      return;
    }

    setTickets((prev) =>
      prev.map((item) =>
        item.id === ticket.id
          ? {
              ...item,
              status: data?.status ?? item.status,
              updated_at: data?.updated_at ?? item.updated_at,
            }
          : item
      )
    );
    setUpdatingId(null);
  };

  const contextPreview = useMemo(() => {
    if (!selectedTicket?.context) {
      return null;
    }
    try {
      return JSON.stringify(selectedTicket.context, null, 2);
    } catch {
      return String(selectedTicket.context);
    }
  }, [selectedTicket]);

  return (
    <RequireAdmin>
      <AppShell
        title="Support tickets"
        description="Review incoming support requests and update their status."
      >
        <form
          onSubmit={handleFilter}
          className="mb-6 grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm md:grid-cols-4"
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
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Subject, email, or user ID"
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
            {(query.status !== 'all'
              || query.category !== 'all'
              || query.search) && (
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
            <ErrorBanner title="Unable to load tickets" message={error} />
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : tickets.length === 0 ? (
          <EmptyState
            title="No tickets"
            message="Try adjusting your filters or check back later."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className={clsx(
                      'cursor-pointer hover:bg-slate-50/60',
                      selectedTicketId === ticket.id && 'bg-slate-50'
                    )}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-slate-900">
                          {ticket.subject}
                        </span>
                        <span className="text-xs text-slate-500">
                          {truncateId(ticket.id)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">
                      {ticket.category}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">
                      {ticket.severity || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={ticket.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex flex-col gap-1">
                        <span>{ticket.email || '-'}</span>
                        <span className="text-xs text-slate-500">
                          {truncateId(ticket.user_id)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDateTime(ticket.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && tickets.length > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        )}

        {selectedTicket ? (
          <section className="mt-8 rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ticket ID
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {selectedTicket.id}
                </p>
              </div>
              <CopyButton value={selectedTicket.id} />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Category
                </p>
                <p className="mt-2 text-sm text-slate-700 capitalize">
                  {selectedTicket.category}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Severity
                </p>
                <p className="mt-2 text-sm text-slate-700 capitalize">
                  {selectedTicket.severity || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </p>
                <select
                  value={selectedTicket.status}
                  onChange={(event) =>
                    handleStatusUpdate(selectedTicket, event.target.value)
                  }
                  disabled={updatingId === selectedTicket.id}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {STATUS_OPTIONS.filter((option) => option.value !== 'all').map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  User
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {selectedTicket.email || '-'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{selectedTicket.user_id}</span>
                  <CopyButton value={selectedTicket.user_id} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Timeline
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  Created: {formatDateTime(selectedTicket.created_at)}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Updated: {formatDateTime(selectedTicket.updated_at)}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subject
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {selectedTicket.subject}
              </p>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Message
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {selectedTicket.message}
              </p>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Context
              </p>
              {contextPreview ? (
                <pre className="mt-2 max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  {contextPreview}
                </pre>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No context attached.</p>
              )}
            </div>

            {updateError && (
              <div className="mt-4">
                <ErrorBanner
                  title="Unable to update ticket"
                  message={updateError}
                />
              </div>
            )}
          </section>
        ) : (
          !isLoading
          && tickets.length > 0 && (
            <div className="mt-8">
              <EmptyState
                title="Select a ticket"
                message="Choose a row to review the full ticket details."
              />
            </div>
          )
        )}
      </AppShell>
    </RequireAdmin>
  );
}
