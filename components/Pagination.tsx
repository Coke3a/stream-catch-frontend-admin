import clsx from 'clsx';

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isFirst = page <= 0;
  const isLast = page + 1 >= totalPages;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        Page {page + 1} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onPageChange(page - 1)}
          className={clsx(
            'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
            isFirst
              ? 'border-slate-200 text-slate-400'
              : 'border-slate-300 text-slate-700 hover:border-slate-500'
          )}
        >
          Prev
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => onPageChange(page + 1)}
          className={clsx(
            'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
            isLast
              ? 'border-slate-200 text-slate-400'
              : 'border-slate-300 text-slate-700 hover:border-slate-500'
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}
