'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import RequireAdmin from '@/components/RequireAdmin';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import StatCard from '@/components/StatCard';
import { useSession } from '@/components/AuthProvider';
import { buildBackendUrl } from '@/lib/api/backend';
import { ShieldAlert, X } from 'lucide-react';

type CountryBlockConfig = {
  blocked_countries: string[];
};

type CountryBlockResponse = {
  config: CountryBlockConfig;
};

type CountryBlockApplyResponse = {
  config: CountryBlockConfig;
  dry_run: boolean;
  matched_users: number;
  updated_users: number;
  follows_deactivated: number;
};

const COMMON_COUNTRY_CODES = [
  { code: 'PK', label: 'Pakistan (PK)' },
  { code: 'TH', label: 'Thailand (TH)' },
  { code: 'ET', label: 'Ethiopia (ET)' },
  { code: 'VN', label: 'Vietnam (VN)' },
  { code: 'BD', label: 'Bangladesh (BD)' },
  { code: 'NG', label: 'Nigeria (NG)' },
  { code: 'EG', label: 'Egypt (EG)' },
  { code: 'PH', label: 'Philippines (PH)' },
  { code: 'ID', label: 'Indonesia (ID)' },
  { code: 'AR', label: 'Argentina (AR)' },
];

const normalizeCodes = (codes: string[]) =>
  [...new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))]
    .sort();

function CountryCodeInput({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const customCodes = selected.filter(
    (code) => !COMMON_COUNTRY_CODES.some((item) => item.code === code)
  );

  const addCode = () => {
    const code = input.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return;
    onChange(normalizeCodes([...selected, code]));
    setInput('');
  };

  const removeCode = (code: string) => {
    onChange(selected.filter((item) => item !== code));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {COMMON_COUNTRY_CODES.map(({ code, label }) => (
          <label key={code} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(code)}
              onChange={() => {
                const next = selected.includes(code)
                  ? selected.filter((item) => item !== code)
                  : [...selected, code];
                onChange(normalizeCodes(next));
              }}
              className="accent-slate-900"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value.toUpperCase().slice(0, 2))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCode();
            }
          }}
          maxLength={2}
          placeholder="e.g. JP"
          className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm uppercase text-slate-700 placeholder:normal-case"
        />
        <button
          type="button"
          onClick={addCode}
          disabled={!/^[A-Z]{2}$/.test(input)}
          className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {customCodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customCodes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {code}
              <button type="button" onClick={() => removeCode(code)} className="text-slate-400 hover:text-slate-700">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CountryBlockPage() {
  const session = useSession();
  const [blockedCountries, setBlockedCountries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CountryBlockApplyResponse | null>(null);
  const [lastApply, setLastApply] = useState<CountryBlockApplyResponse | null>(null);

  const selectedLabel = useMemo(
    () => (blockedCountries.length > 0 ? blockedCountries.join(', ') : 'None'),
    [blockedCountries]
  );

  useEffect(() => {
    const loadConfig = async () => {
      if (!session) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(buildBackendUrl('/api/v1/admin/country-block'), {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Failed to load country block config');
        }
        const data = (await response.json()) as CountryBlockResponse;
        setBlockedCountries(normalizeCodes(data.config.blocked_countries ?? []));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load country block config');
      } finally {
        setIsLoading(false);
      }
    };

    void loadConfig();
  }, [session]);

  const submit = async (dryRun: boolean) => {
    if (!session) return;
    setIsSaving(true);
    setError(null);
    if (dryRun) setPreview(null);
    try {
      const response = await fetch(buildBackendUrl('/api/v1/admin/country-block'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blocked_countries: blockedCountries,
          dry_run: dryRun,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to update country block config');
      }
      const data = (await response.json()) as CountryBlockApplyResponse;
      setBlockedCountries(normalizeCodes(data.config.blocked_countries));
      if (dryRun) {
        setPreview(data);
      } else {
        setLastApply(data);
        setPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update country block config');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <RequireAdmin>
      <AppShell
        title="Country block"
        description="Manage country-level hard blocking for authenticated app usage."
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
            <section className="rounded-2xl border border-red-200/70 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-red-50 p-2 text-red-600">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Blocked countries
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Matching users are set to idle and receive a hard backend country-block response.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <CountryCodeInput selected={blockedCountries} onChange={setBlockedCountries} />
              </div>

              <p className="mt-4 text-xs text-slate-500">Selected: {selectedLabel}</p>
            </section>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={isSaving}
                className="rounded-full border border-slate-300 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-500 disabled:opacity-50"
              >
                {isSaving ? 'Working...' : 'Preview impact'}
              </button>
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={isSaving}
                className="rounded-full border border-red-700 bg-red-700 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-red-800 disabled:opacity-50"
              >
                {isSaving ? 'Applying...' : 'Apply block'}
              </button>
            </div>

            {(preview || lastApply) && (
              <section className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard
                    label={preview ? 'Matched users' : 'Updated users'}
                    value={preview ? preview.matched_users : lastApply?.updated_users ?? 0}
                  />
                  <StatCard
                    label="Follows deactivated"
                    value={(preview || lastApply)?.follows_deactivated ?? 0}
                  />
                  <StatCard
                    label="Dry run"
                    value={(preview || lastApply)?.dry_run ? 'Yes' : 'No'}
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </AppShell>
    </RequireAdmin>
  );
}
