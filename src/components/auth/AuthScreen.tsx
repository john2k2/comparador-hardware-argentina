'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { LogIn, LogOut, Mail, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getUserDisplayName, resolveSafeNextPath } from '@/lib/client/auth';
import { syncServerSession } from '@/lib/client/session-sync';

type AuthMode = 'sign-in' | 'sign-up';

export function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => resolveSafeNextPath(searchParams.get('next'), '/'),
    [searchParams],
  );

  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    if (!supabase) {
      setIsLoadingUser(false);
      return () => {
        mounted = false;
      };
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setIsLoadingUser(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setIsLoadingUser(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase no esta configurado.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 6) {
      setError('Ingresa un email valido y password de al menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'sign-in') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }

        await syncServerSession(data.session ?? null);
        setMessage('Sesion iniciada correctamente.');
        router.replace(nextPath);
        router.refresh();
        return;
      }

      const origin = window.location.origin;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!data.session) {
        setMessage('Cuenta creada. Revisa tu email para confirmar la cuenta.');
        return;
      }

      await syncServerSession(data.session);
      setMessage('Cuenta creada e inicio de sesion completado.');
      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      const messageText = caughtError instanceof Error ? caughtError.message : 'Error inesperado al autenticar.';
      setError(messageText);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setError('Supabase no esta configurado.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const origin = window.location.origin;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
      }
    } catch (caughtError) {
      const messageText = caughtError instanceof Error ? caughtError.message : 'No se pudo iniciar sesion con Google.';
      setError(messageText);
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    setError('');
    setMessage('');

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setIsSubmitting(false);
      return;
    }

    await syncServerSession(null);
    setUser(null);
    setIsSubmitting(false);
    setMessage('Sesion cerrada.');
    router.refresh();
  };

  if (isLoadingUser) {
    return (
      <section className="w-full max-w-xl mx-auto py-12 px-4">
        <div className="border-4 border-border bg-card p-6 pixel-shadow text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Cargando sesion...</p>
        </div>
      </section>
    );
  }

  if (user) {
    return (
      <section className="w-full max-w-xl mx-auto py-12 px-4">
        <div className="border-4 border-border bg-card p-6 pixel-shadow">
          <p className="text-[9px] uppercase text-secondary font-bold mb-2">[ Cuenta activa ]</p>
          <h2 className="text-[13px] uppercase text-foreground mb-4">Bienvenido, {getUserDisplayName(user)}</h2>
          <p className="text-[9px] uppercase text-muted-foreground mb-6">{user.email}</p>

          <div className="flex flex-wrap gap-3">
            <Link href={nextPath} className="pixel-button text-[10px] inline-flex items-center gap-2">
              <UserRound className="w-4 h-4" />
              IR A LA APP
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSubmitting}
              className="pixel-button text-[10px] inline-flex items-center gap-2 disabled:opacity-70"
            >
              <LogOut className="w-4 h-4" />
              CERRAR SESION
            </button>
          </div>

          <p className="text-[9px] uppercase text-muted-foreground mt-6">
            Proximo paso: favoritos y alertas de precio por usuario.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-xl mx-auto py-12 px-4">
      <div className="border-4 border-border bg-card p-6 pixel-shadow">
        <p className="text-[9px] uppercase text-secondary font-bold mb-2">[ Auth ]</p>
        <h2 className="text-[13px] uppercase text-foreground mb-4">Entrar o crear cuenta</h2>
        <p className="text-[9px] uppercase text-muted-foreground mb-6">
          Necesario para favoritos y alertas cuando baje de precio.
        </p>

        <div className="flex gap-3 mb-5">
          <button
            type="button"
            onClick={() => setMode('sign-in')}
            className={`min-h-11 px-3 py-2 border-2 text-[9px] uppercase font-bold ${mode === 'sign-in' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
          >
            INICIAR SESION
          </button>
          <button
            type="button"
            onClick={() => setMode('sign-up')}
            className={`min-h-11 px-3 py-2 border-2 text-[9px] uppercase font-bold ${mode === 'sign-up' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
          >
            CREAR CUENTA
          </button>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <label className="block">
            <span className="text-[9px] uppercase text-muted-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full min-h-11 mt-2 border-2 border-border bg-background px-3 py-2 text-[10px] uppercase"
              placeholder="usuario@email.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-[9px] uppercase text-muted-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full min-h-11 mt-2 border-2 border-border bg-background px-3 py-2 text-[10px]"
              placeholder="******"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="pixel-button text-[10px] w-full min-h-11 !inline-flex !items-center !justify-center gap-2 leading-none disabled:opacity-70"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <LogIn className="w-4 h-4 shrink-0" />
              <span className="leading-none">{mode === 'sign-in' ? 'INGRESAR' : 'CREAR CUENTA'}</span>
            </span>
          </button>
        </form>

        <div className="my-5 border-t-2 border-dashed border-border" />

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full min-h-11 border-2 border-border px-3 py-2 text-[10px] uppercase font-bold inline-flex items-center justify-center gap-2 hover:border-secondary hover:text-secondary transition-colors disabled:opacity-70"
        >
          <Mail className="w-4 h-4" />
          CONTINUAR CON GOOGLE
        </button>

        {message ? (
          <p className="mt-4 text-[9px] uppercase text-secondary">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-4 text-[9px] uppercase text-primary">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
