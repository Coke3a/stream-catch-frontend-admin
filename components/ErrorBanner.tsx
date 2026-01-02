import { AlertCircle } from 'lucide-react';

export default function ErrorBanner({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-700 shadow-sm">
      <AlertCircle className="mt-0.5 h-5 w-5" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-rose-600">{message}</p>
      </div>
    </div>
  );
}
