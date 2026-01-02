import clsx from 'clsx';

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-100/70 text-emerald-800',
  ready: 'border-emerald-200 bg-emerald-100/70 text-emerald-800',
  paid: 'border-emerald-200 bg-emerald-100/70 text-emerald-800',
  failed: 'border-rose-200 bg-rose-100/70 text-rose-700',
  canceled: 'border-amber-200 bg-amber-100/70 text-amber-800',
  pending: 'border-amber-200 bg-amber-100/70 text-amber-800',
  past_due: 'border-amber-200 bg-amber-100/70 text-amber-800',
  inactive: 'border-slate-200 bg-slate-100/70 text-slate-700',
  temporary_inactive: 'border-slate-200 bg-slate-100/70 text-slate-700',
  live_recording: 'border-sky-200 bg-sky-100/70 text-sky-700',
  live_end: 'border-slate-200 bg-slate-100/70 text-slate-700',
  waiting_upload: 'border-slate-200 bg-slate-100/70 text-slate-700',
  uploading: 'border-slate-200 bg-slate-100/70 text-slate-700',
  expired_deleted: 'border-rose-200 bg-rose-100/70 text-rose-700',
  admin: 'border-indigo-200 bg-indigo-100/70 text-indigo-700',
  open: 'border-amber-200 bg-amber-100/70 text-amber-800',
  in_progress: 'border-sky-200 bg-sky-100/70 text-sky-700',
  resolved: 'border-emerald-200 bg-emerald-100/70 text-emerald-800',
  closed: 'border-slate-200 bg-slate-100/70 text-slate-700',
};

export default function StatusBadge({ value }: { value?: string | null }) {
  const normalized = (value || 'unknown').toLowerCase();
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
        STATUS_STYLES[normalized] || 'border-slate-200 bg-slate-100/70 text-slate-700'
      )}
    >
      {normalized.replace(/_/g, ' ')}
    </span>
  );
}
