import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from './supabase';

export type UserRole = 'admin' | 'manager' | 'staff' | 'hospital';

export interface Profile {
  id: string; email: string; role: UserRole; hospital_id: string | null;
  full_name: string | null; is_active: boolean; avatar_url: string | null;
  username?: string | null; phone?: string | null; last_login_at?: string | null;
  notification_sound_enabled?: boolean;
}

interface AuthContextValue {
  profile: Profile | null; loading: boolean; recovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (userId: string) => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!mounted) return;
      if (error || !data || !data.is_active) {
        setProfile(null);
        setLoading(false);
        if (data && !data.is_active) await supabase.auth.signOut();
        return;
      }
      if (data.hospital_id) {
        const { data: h } = await supabase.from('hospitals').select('status').eq('id', data.hospital_id).maybeSingle();
        if (h?.status !== 'active') {
          setProfile(null); setLoading(false); await supabase.auth.signOut(); return;
        }
      }
      setProfile(data as Profile); setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) loadProfile(session.user.id); else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') { setProfile(null); setLoading(false); }
      else if (session) setTimeout(() => loadProfile(session.user.id), 0);
      else { setProfile(null); setLoading(false); }
    });

    const guard = setInterval(async () => {
      if (!profile) return;
      const { data } = await supabase.from('profiles').select('is_active,hospital_id').eq('id', profile.id).maybeSingle();
      if (!data?.is_active) { await supabase.auth.signOut(); return; }
      if (data.hospital_id) {
        const { data: h } = await supabase.from('hospitals').select('status').eq('id', data.hospital_id).maybeSingle();
        if (h?.status !== 'active') await supabase.auth.signOut();
      }
    }, 30000);

    return () => { mounted = false; subscription.unsubscribe(); clearInterval(guard); };
  }, [profile?.id]);

  const signIn = async (identifier: string, password: string) => {
    const value = identifier.trim();
    const { data: resolved } = await supabase.rpc('resolve_login_identifier', { p_identifier: value });
    const loginEmail = resolved || value;
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (error) return { error: error.message };
    if (data.user) await supabase.rpc('record_my_login');
    return { error: null };
  };

  const signOut = async () => { await supabase.auth.signOut(); setProfile(null); };

  const requestPasswordReset = async (identifier: string) => {
    const { data: resolved } = await supabase.rpc('resolve_login_identifier', { p_identifier: identifier.trim() });
    const email = resolved || (identifier.includes('@') ? identifier.trim() : null);
    if (!email) return { error: 'لم يتم العثور على حساب بهذا البريد أو اسم المستخدم أو رقم الهاتف' };
    const redirectTo = `${window.location.origin}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error?.message || null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecovery(false);
    return { error: error?.message || null };
  };

  return <AuthContext.Provider value={{ profile, loading, recovery, signIn, signOut, requestPasswordReset, updatePassword }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
