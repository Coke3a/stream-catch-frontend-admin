'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type SupabaseContextType = {
  supabase: ReturnType<typeof createSupabaseBrowserClient>;
  session: Session | null;
  user: User | null;
  isLoading: boolean;
};

const Context = createContext<SupabaseContextType | undefined>(undefined);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (event === 'SIGNED_OUT') {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  return (
    <Context.Provider value={{ supabase, session, user, isLoading }}>
      {children}
    </Context.Provider>
  );
}

const useSupabaseContext = () => {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('Auth context is missing');
  }
  return context;
};

export const useSupabase = () => useSupabaseContext().supabase;
export const useSession = () => useSupabaseContext().session;
export const useUser = () => useSupabaseContext().user;
export const useAuthLoading = () => useSupabaseContext().isLoading;
