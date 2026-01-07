import clsx from 'clsx';

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isFirst = page <= 0;
  const isLast = page + 1 >= totalPages;

  return (
    <div className="mt-6 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <span>
          Page {page + 1} of {totalPages}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Page size
            <select
              value={pageSize}
              onChange={(event) =>
                onPageSizeChange(Number(event.target.value))
              }
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onPageChange(page - 1)}
          className={clsx(
            'flex-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide sm:flex-none',
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
            'flex-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide sm:flex-none',
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
