'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { useSession } from '@/components/AuthProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/config/app';

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

export default function TrialConfigPage() {
  const session = useSession();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [config, setConfig] = useState<TrialEnforcementConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Backfill state
  const [backfillCountries, setBackfillCountries] = useState<string[]>([]);
  const [backfillTrialDays, setBackfillTrialDays] = useState(7);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      if (!session) return;
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${APP_CONFIG.backendBaseUrl}/api/v1/admin/trial-config`,
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
  }, [session, supabase]);

  const handleSave = async () => {
    if (!session) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const response = await fetch(
        `${APP_CONFIG.backendBaseUrl}/api/v1/admin/trial-config`,
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
        `${APP_CONFIG.backendBaseUrl}/api/v1/admin/trial-backfill`,
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

  return (
    <RequireAdmin>
      <AppShell
        title="Trial configuration"
        description="Manage trial enforcement mode, regions, and durations. Backfill existing users."
      >
        {error && (
          <div className="mb-6">
            <ErrorBanner title="Error" message={error} />
          </div>
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

            {/* Region checkboxes */}
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
