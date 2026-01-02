export default function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="h-10 w-full animate-pulse rounded-xl bg-slate-100"
        />
      ))}
    </div>
  );
}
