'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { resolveSafeNextPath } from '@/lib/client/auth';
import { syncServerSession } from '@/lib/client/session-sync';

export function AuthCallbackScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = useMemo(() => searchParams.get('code'), [searchParams]);
  const nextPath = useMemo(
    () => resolveSafeNextPath(searchParams.get('next'), '/'),
    [searchParams],
  );
  const [statusText, setStatusText] = useState(() => (supabase ? 'Validando sesion...' : ''));
  const [errorText, setErrorText] = useState(() => (supabase ? '' : 'Supabase no esta configurado.'));

  useEffect(() => {
    let active = true;
    const supabaseClient = supabase;
    if (!supabaseClient) return () => { active = false; };

    const finishSuccess = () => {
      if (!active) return;
      router.replace(nextPath);
      router.refresh();
    };

    const validateSession = async () => {
      try {
        if (code) {
          const { error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setErrorText(exchangeError.message);
            setStatusText('');
            return;
          }
        }

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
          setErrorText(error.message);
          setStatusText('');
          return;
        }

        if (data.session) {
          await syncServerSession(data.session);
          finishSuccess();
          return;
        }

        setStatusText('Esperando confirmacion de login...');
      } catch (caughtError) {
        const messageText = caughtError instanceof Error ? caughtError.message : 'Error inesperado al procesar login.';
        setErrorText(messageText);
        setStatusText('');
      }
    };

    validateSession();

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await syncServerSession(session);
        finishSuccess();
      }
    });

    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      setErrorText('No se pudo confirmar la sesion. Reintenta el login.');
      setStatusText('');
    }, 6000);

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, [router, nextPath, code]);

  return (
    <section className="w-full max-w-xl mx-auto py-12 px-4">
      <div className="border-4 border-border bg-card p-6 pixel-shadow text-center">
        {statusText ? (
          <p className="text-[10px] uppercase text-muted-foreground">{statusText}</p>
        ) : null}
        {errorText ? (
          <>
            <p className="text-[10px] uppercase text-primary mb-5">{errorText}</p>
            <Link href={`/auth?next=${encodeURIComponent(nextPath)}`} className="pixel-button text-[10px] inline-block">
              VOLVER A AUTH
            </Link>
          </>
        ) : null}
      </div>
    </section>
  );
}
