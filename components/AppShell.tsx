'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_CONFIG } from '@/config/app';
import { ROUTES } from '@/config/routes';
import { useSupabase, useUser } from '@/components/AuthProvider';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: ROUTES.dashboard, label: 'Dashboard' },
  { href: ROUTES.users, label: 'Users' },
  { href: ROUTES.liveAccounts, label: 'Live Accounts' },
  { href: ROUTES.recordings, label: 'Recordings' },
  { href: ROUTES.supportTickets, label: 'Support Tickets' },
];

export default function AppShell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const pathname = usePathname();
  const supabase = useSupabase();
  const user = useUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              {APP_CONFIG.appName}
            </p>
            <nav className="mt-3 flex flex-wrap gap-2">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition',
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-400'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-500">{user?.email}</p>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="mt-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {(title || description) && (
          <div className="mb-8">
            {title && (
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
            )}
            {description && (
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
