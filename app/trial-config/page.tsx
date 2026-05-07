'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import CopyButton from '@/components/CopyButton';
import Pagination from '@/components/Pagination';
import { useSession } from '@/components/AuthProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { buildBackendUrl } from '@/lib/api/backend';
import { formatDateTime, truncateId } from '@/lib/utils/format';
import { ROUTES } from '@/config/routes';
import { X } from 'lucide-react';

type TrialMode = 'disabled' | 'by_region' | 'all';

type TrialEnforcementConfig = {
  mode: TrialMode;
  enforced_regions: string[];
  trial_duration_days: number;
  grace_period_days: number;
  region_overrides: Record<string, unknown>;
};

type BackfillResult = {
  matched_users: number;
  updated_users: number;
  dry_run: boolean;
};

type TrialStats = {
  total: number;
  active: number;
  expired: number;
  byCountry: { code: string; active: number; expired: number }[];
};

type TrialUser = {
  id: string;
  trial_ends_at: string;
  last_country_code: string | null;
};

type TrialUserFilter = 'all' | 'active' | 'expired';

const COMMON_COUNTRY_CODES = [
  { code: 'TH', label: 'Thailand (TH)' },
  { code: 'ET', label: 'Ethiopia (ET)' },
  { code: 'VN', label: 'Vietnam (VN)' },
  { code: 'PK', label: 'Pakistan (PK)' },
  { code: 'AR', label: 'Argentina (AR)' },
  { code: 'BD', label: 'Bangladesh (BD)' },
  { code: 'NG', label: 'Nigeria (NG)' },
  { code: 'EG', label: 'Egypt (EG)' },
  { code: 'PH', label: 'Philippines (PH)' },
  { code: 'ID', label: 'Indonesia (ID)' },
];

const DEFAULT_CONFIG: TrialEnforcementConfig = {
  mode: 'disabled',
  enforced_regions: [],
  trial_duration_days: 7,
  grace_period_days: 30,
  region_overrides: {},
};

/* ------------------------------------------------------------------ */
/*  Free-form country code input                                       */
/* ------------------------------------------------------------------ */
function CountryCodeInput({
  selected,
  onAdd,
  onRemove,
}: {
  selected: string[];
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const code = input.trim().toUpperCase();
    if (code.length === 2 && /^[A-Z]{2}$/.test(code) && !selected.includes(code)) {
      onAdd(code);
    }
    setInput('');
  };

  const customCodes = selected.filter(
    (c) => !COMMON_COUNTRY_CODES.some((cc) => cc.code === c)
  );

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase().slice(0, 2))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. JP"
          maxLength={2}
          className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 uppercase placeholder:normal-case"
        />
        <button
          type="button"
          onClick={add}
          disabled={input.trim().length !== 2}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {customCodes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {customCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              {code}
              <button
                type="button"
                onClick={() => onRemove(code)}
                className="text-slate-400 transition hover:text-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function TrialConfigPage() {
  const session = useSession();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [config, setConfig] = useState<TrialEnforcementConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Stats state
  const [stats, setStats] = useState<TrialStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // User list state
  const [trialUsers, setTrialUsers] = useState<TrialUser[]>([]);
  const [trialUsersTotal, setTrialUsersTotal] = useState(0);
  const [trialUsersPage, setTrialUsersPage] = useState(0);
  const [trialUsersPageSize, setTrialUsersPageSize] = useState(10);
  const [trialUsersFilter, setTrialUsersFilter] = useState<TrialUserFilter>('all');
  const [trialUsersCountry, setTrialUsersCountry] = useState('');
  const [trialUsersLoading, setTrialUsersLoading] = useState(false);

  // Backfill state
  const [backfillCountries, setBackfillCountries] = useState<string[]>([]);
  const [backfillTrialDays, setBackfillTrialDays] = useState(7);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  /* ---- Load config ---- */
  useEffect(() => {
    const loadConfig = async () => {
      if (!session) return;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          buildBackendUrl('/api/v1/admin/trial-config'),
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.status === 404) {
          setConfig(DEFAULT_CONFIG);
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Failed to load trial config');
        }

        const data = await response.json();
        const loaded = data.config as TrialEnforcementConfig;
        setConfig({
          mode: loaded.mode || 'disabled',
          enforced_regions: loaded.enforced_regions || [],
          trial_duration_days: loaded.trial_duration_days ?? 7,
          grace_period_days: loaded.grace_period_days ?? 30,
          region_overrides: loaded.region_overrides || {},
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trial config');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [session]);

  /* ---- Load stats ---- */
  useEffect(() => {
    const loadStats = async () => {
      setStatsLoading(true);
      try {
        const now = new Date().toISOString();

        const [totalRes, activeRes, expiredRes, byCountryRes] = await Promise.all([
          supabase
            .from('app_users')
            .select('id', { count: 'exact', head: true })
            .not('trial_ends_at', 'is', null),
          supabase
            .from('app_users')
            .select('id', { count: 'exact', head: true })
            .gt('trial_ends_at', now),
          supabase
            .from('app_users')
            .select('id', { count: 'exact', head: true })
            .not('trial_ends_at', 'is', null)
            .lte('trial_ends_at', now),
          supabase
            .from('app_users')
            .select('last_country_code,trial_ends_at')
            .not('trial_ends_at', 'is', null),
        ]);

        const countryMap = new Map<string, { active: number; expired: number }>();
        const nowTs = Date.now();
        for (const row of byCountryRes.data || []) {
          const cc = (row.last_country_code as string) || 'unknown';
          const entry = countryMap.get(cc) || { active: 0, expired: 0 };
          if (new Date(row.trial_ends_at as string).getTime() > nowTs) {
            entry.active++;
          } else {
            entry.expired++;
          }
          countryMap.set(cc, entry);
        }

        const byCountry = Array.from(countryMap.entries())
          .map(([code, counts]) => ({ code, ...counts }))
          .sort((a, b) => b.active + b.expired - (a.active + a.expired));

        setStats({
          total: totalRes.count ?? 0,
          active: activeRes.count ?? 0,
          expired: expiredRes.count ?? 0,
          byCountry,
        });
      } catch {
        // stats are non-critical, silently fail
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, [supabase]);

  /* ---- Load trial users ---- */
  const loadTrialUsers = useCallback(async () => {
    setTrialUsersLoading(true);
    try {
      const now = new Date().toISOString();
      const from = trialUsersPage * trialUsersPageSize;
      const to = from + trialUsersPageSize - 1;

      let query = supabase
        .from('app_users')
        .select('id,trial_ends_at,last_country_code', { count: 'exact' })
        .not('trial_ends_at', 'is', null);

      if (trialUsersFilter === 'active') {
        query = query.gt('trial_ends_at', now);
      } else if (trialUsersFilter === 'expired') {
        query = query.lte('trial_ends_at', now);
      }

      const countryFilter = trialUsersCountry.trim().toUpperCase();
      if (countryFilter.length === 2) {
        query = query.eq('last_country_code', countryFilter);
      }

      query = query.order('trial_ends_at', { ascending: false }).range(from, to);

      const { data, count } = await query;
      setTrialUsers((data as TrialUser[]) || []);
      setTrialUsersTotal(count ?? 0);
    } catch {
      setTrialUsers([]);
      setTrialUsersTotal(0);
    } finally {
      setTrialUsersLoading(false);
    }
  }, [supabase, trialUsersPage, trialUsersPageSize, trialUsersFilter, trialUsersCountry]);

  useEffect(() => {
    loadTrialUsers();
  }, [loadTrialUsers]);

  /* ---- Handlers ---- */
  const handleSave = async () => {
    if (!session) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const response = await fetch(
        buildBackendUrl('/api/v1/admin/trial-config'),
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ config }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to save trial config');
      }

      const data = await response.json();
      const updated = data.config as TrialEnforcementConfig;
      setConfig({
        mode: updated.mode || 'disabled',
        enforced_regions: updated.enforced_regions || [],
        trial_duration_days: updated.trial_duration_days ?? 7,
        grace_period_days: updated.grace_period_days ?? 30,
        region_overrides: updated.region_overrides || {},
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save trial config');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegionToggle = (code: string) => {
    setConfig((prev) => {
      const regions = prev.enforced_regions.includes(code)
        ? prev.enforced_regions.filter((r) => r !== code)
        : [...prev.enforced_regions, code];
      return { ...prev, enforced_regions: regions };
    });
  };

  const handleBackfillCountryToggle = (code: string) => {
    setBackfillCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleBackfill = async (dryRun: boolean) => {
    if (!session || backfillCountries.length === 0) return;
    setIsBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);

    try {
      const response = await fetch(
        buildBackendUrl('/api/v1/admin/trial-backfill'),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            country_codes: backfillCountries,
            trial_duration_days: backfillTrialDays,
            dry_run: dryRun,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to run backfill');
      }

      const data = (await response.json()) as BackfillResult;
      setBackfillResult(data);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      setIsBackfilling(false);
    }
  };

  const getTrialStatus = (endsAt: string) =>
    new Date(endsAt).getTime() > Date.now() ? 'active' : 'expired';

  return (
    <RequireAdmin>
      <AppShell
        title="Trial configuration"
        description="Manage trial enforcement mode, regions, and durations. Monitor trial users and backfill existing users."
      >
        {error && (
          <div className="mb-6">
            <ErrorBanner title="Error" message={error} />
          </div>
        )}

        {/* ---- Stats ---- */}
        {statsLoading ? (
          <LoadingSkeleton rows={1} />
        ) : (
          stats && (
            <div className="mb-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Total with trial" value={stats.total} />
                <StatCard label="Active trials" value={stats.active} hint="trial_ends_at > now" />
                <StatCard label="Expired trials" value={stats.expired} hint="trial_ends_at <= now" />
              </div>
              {stats.byCountry.length > 0 && (
                <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Breakdown by country
                  </h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2">Country</th>
                          <th className="px-3 py-2">Active</th>
                          <th className="px-3 py-2">Expired</th>
                          <th className="px-3 py-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.byCountry.map(({ code, active, expired }) => (
                          <tr key={code} className="border-b border-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700">{code}</td>
                            <td className="px-3 py-2 text-emerald-700">{active}</td>
                            <td className="px-3 py-2 text-rose-700">{expired}</td>
                            <td className="px-3 py-2 text-slate-600">{active + expired}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )
        )}

        {isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <div className="space-y-8">
            {/* Mode toggle */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Enforcement mode
              </h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {(['disabled', 'by_region', 'all'] as TrialMode[]).map((mode) => (
                  <label
                    key={mode}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="radio"
                      name="trial_mode"
                      value={mode}
                      checked={config.mode === mode}
                      onChange={() => setConfig((prev) => ({ ...prev, mode }))}
                      className="accent-slate-900"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      {mode === 'disabled'
                        ? 'Disabled'
                        : mode === 'by_region'
                          ? 'By region'
                          : 'All users'}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {config.mode === 'disabled' &&
                  'Trial enforcement is off. No users will be assigned trials.'}
                {config.mode === 'by_region' &&
                  'Only users in selected regions will be assigned trials on signup.'}
                {config.mode === 'all' &&
                  'All new users will be assigned a trial on signup.'}
              </p>
            </section>

            {/* Region checkboxes + free-form input */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Enforced regions
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Select country codes where trial enforcement applies (used when
                mode is &quot;by_region&quot;).
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {COMMON_COUNTRY_CODES.map(({ code, label }) => (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={config.enforced_regions.includes(code)}
                      onChange={() => handleRegionToggle(code)}
                      className="accent-slate-900"
                    />
                    <span className="text-sm text-slate-700">{label}</span>
                  </label>
                ))}
              </div>
              <CountryCodeInput
                selected={config.enforced_regions}
                onAdd={(code) =>
                  setConfig((prev) => ({
                    ...prev,
                    enforced_regions: [...prev.enforced_regions, code],
                  }))
                }
                onRemove={(code) =>
                  setConfig((prev) => ({
                    ...prev,
                    enforced_regions: prev.enforced_regions.filter((r) => r !== code),
                  }))
                }
              />
              {config.enforced_regions.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Selected: {config.enforced_regions.join(', ')}
                </p>
              )}
            </section>

            {/* Duration inputs */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Duration settings
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Trial duration (days)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={config.trial_duration_days}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        trial_duration_days: Number(e.target.value) || 7,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Grace period (days)
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={config.grace_period_days}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        grace_period_days: Number(e.target.value) || 30,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                </label>
              </div>
            </section>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-full border border-slate-900 bg-slate-900 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save configuration'}
              </button>
              {saveSuccess && (
                <span className="text-sm font-semibold text-emerald-600">
                  Saved successfully
                </span>
              )}
            </div>

            {/* ---- Trial users list ---- */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Trial users
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Users who have been assigned a trial period.
              </p>

              {/* Filters */}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                  <select
                    value={trialUsersFilter}
                    onChange={(e) => {
                      setTrialUsersFilter(e.target.value as TrialUserFilter);
                      setTrialUsersPage(0);
                    }}
                    className="mt-1 block rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Country
                  <input
                    type="text"
                    value={trialUsersCountry}
                    onChange={(e) => {
                      setTrialUsersCountry(e.target.value.toUpperCase().slice(0, 2));
                      setTrialUsersPage(0);
                    }}
                    placeholder="e.g. TH"
                    maxLength={2}
                    className="mt-1 block w-20 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 uppercase placeholder:normal-case"
                  />
                </label>
              </div>

              {/* Table */}
              {trialUsersLoading ? (
                <div className="mt-4">
                  <LoadingSkeleton rows={3} />
                </div>
              ) : trialUsers.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No trial users found.</p>
              ) : (
                <>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3">User ID</th>
                          <th className="px-4 py-3">Country</th>
                          <th className="px-4 py-3">Trial ends at</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialUsers.map((user) => {
                          const status = getTrialStatus(user.trial_ends_at);
                          return (
                            <tr key={user.id} className="border-b border-slate-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`${ROUTES.users}/${user.id}`}
                                    className="font-mono text-xs text-slate-700 hover:underline"
                                  >
                                    {truncateId(user.id)}
                                  </Link>
                                  <CopyButton value={user.id} />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {user.last_country_code || '-'}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {formatDateTime(user.trial_ends_at)}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge value={status} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={trialUsersPage}
                    pageSize={trialUsersPageSize}
                    total={trialUsersTotal}
                    onPageChange={setTrialUsersPage}
                    onPageSizeChange={(size) => {
                      setTrialUsersPageSize(size);
                      setTrialUsersPage(0);
                    }}
                    pageSizeOptions={[10, 20, 50]}
                  />
                </>
              )}
            </section>

            {/* Backfill section */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Backfill trials
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Assign trial periods to existing free users in selected countries
                who do not yet have a trial. Preview with dry run first.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {COMMON_COUNTRY_CODES.map(({ code, label }) => (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={backfillCountries.includes(code)}
                      onChange={() => handleBackfillCountryToggle(code)}
                      className="accent-slate-900"
                    />
                    <span className="text-sm text-slate-700">{label}</span>
                  </label>
                ))}
              </div>

              <CountryCodeInput
                selected={backfillCountries}
                onAdd={(code) =>
                  setBackfillCountries((prev) =>
                    prev.includes(code) ? prev : [...prev, code]
                  )
                }
                onRemove={(code) =>
                  setBackfillCountries((prev) => prev.filter((c) => c !== code))
                }
              />

              <div className="mt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Trial duration for backfill (days)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={backfillTrialDays}
                    onChange={(e) =>
                      setBackfillTrialDays(Number(e.target.value) || 7)
                    }
                    className="mt-2 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                </label>
              </div>

              {backfillCountries.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Selected: {backfillCountries.join(', ')}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleBackfill(true)}
                  disabled={isBackfilling || backfillCountries.length === 0}
                  className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-500 disabled:opacity-50"
                >
                  {isBackfilling ? 'Running...' : 'Dry run preview'}
                </button>
                <button
                  type="button"
                  onClick={() => handleBackfill(false)}
                  disabled={isBackfilling || backfillCountries.length === 0}
                  className="rounded-full border border-rose-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-700 transition hover:border-rose-500 disabled:opacity-50"
                >
                  {isBackfilling ? 'Running...' : 'Apply backfill'}
                </button>
                {backfillCountries.length === 0 && (
                  <span className="text-xs text-slate-500">
                    Select at least one country
                  </span>
                )}
              </div>

              {backfillError && (
                <div className="mt-4">
                  <ErrorBanner title="Backfill error" message={backfillError} />
                </div>
              )}

              {backfillResult && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    {backfillResult.dry_run
                      ? 'Dry run result'
                      : 'Backfill completed'}
                  </p>
                  <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold">Matched users:</span>{' '}
                      {backfillResult.matched_users}
                    </div>
                    <div>
                      <span className="font-semibold">
                        {backfillResult.dry_run
                          ? 'Would update:'
                          : 'Updated:'}
                      </span>{' '}
                      {backfillResult.updated_users}
                    </div>
                  </div>
                  {backfillResult.dry_run && backfillResult.matched_users > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Click &quot;Apply backfill&quot; to apply changes to{' '}
                      {backfillResult.matched_users} user(s).
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </AppShell>
    </RequireAdmin>
  );
}
