'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, useSupabase, useUser } from '@/components/AuthProvider';
import { isAdminUser } from '@/lib/utils/admin';
import ErrorBanner from '@/components/ErrorBanner';
import { APP_CONFIG } from '@/config/app';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabase();
  const session = useSession();
  const user = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      return;
    }

    if (isAdminUser(user)) {
      router.replace('/');
      return;
    }

    setError('Your account is not authorized for admin access.');
    supabase.auth.signOut();
  }, [router, session, supabase, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      }
    } catch (err) {
      setError('Unable to sign in right now.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/90 p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          {APP_CONFIG.appName}
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Admin sign in
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Use your existing StreamRokuo credentials. Admin access is required.
        </p>

        {error && (
          <div className="mt-6">
            <ErrorBanner title="Sign-in error" message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              placeholder="admin@streamrokuo.com"
              disabled={isLoading}
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              placeholder="********"
              disabled={isLoading}
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
