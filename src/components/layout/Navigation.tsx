'use client';

import Link from 'next/link';
import { LogIn, LogOut, Menu, Moon, Sun, UserRound, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserDisplayName } from '@/lib/client/auth';
import { syncServerSession } from '@/lib/client/session-sync';

function subscribeToThemeChanges(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => { };
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  media.addEventListener('change', callback);
  window.addEventListener('storage', callback);

  return () => {
    observer.disconnect();
    media.removeEventListener('change', callback);
    window.removeEventListener('storage', callback);
  };
}

function getThemeSnapshot() {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.documentElement.classList.contains('dark');
}

function getServerThemeSnapshot() {
  return false;
}

export function Navigation() {
  const isDark = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const [isWiping, setIsWiping] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(supabase));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!supabase) return () => { mounted = false; };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthUser(data.session?.user ?? null);
      setIsAuthLoading(false);
      void syncServerSession(data.session ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthUser(session?.user ?? null);
      setIsAuthLoading(false);
      void syncServerSession(session ?? null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const toggleTheme = () => {
    if (isWiping) return;

    setIsWiping(true);

    setTimeout(() => {
      const newTheme = !isDark;
      localStorage.setItem('theme', newTheme ? 'dark' : 'light');
      if (newTheme) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }, 600);

    setTimeout(() => {
      setIsWiping(false);
    }, 1300);
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await syncServerSession(null);
    setAuthUser(null);
  };

  return (
    <>
      {isWiping && (
        <div
          className="pixel-wipe-overlay"
          style={{
            backgroundColor: isDark ? '#ffffff' : '#ff0055',
          }}
        />
      )}

      <header
        className="sticky top-0 z-50 bg-background border-b-4 border-border"
        role="banner"
      >
        <div className="w-full max-w-[1800px] mx-auto px-4 xl:px-8">
          <div className="flex h-20 items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-3 hover:-translate-y-1 transition-transform group"
            >
              {/* Logo Icon Box */}
              <div className="w-10 h-10 md:w-12 md:h-12 relative flex-shrink-0" style={{ boxShadow: '4px 4px 0px 0px #1a1a1a' }}>
                {/* Laser Line (continuous animation) */}
                <div
                  className="absolute top-1 left-1 w-[calc(100%-8px)] h-[2px] bg-white opacity-0 animate-scan pointer-events-none z-10"
                  style={{ boxShadow: '0 0 6px rgba(255,255,255,0.8), 0 0 12px #88c0d0' }}
                ></div>

                {/* SVG Pixel Art Integrado */}
                <svg viewBox="0 0 24 24" shapeRendering="crispEdges" className="w-full h-full block">
                  {/* Borde Blanco Exterior */}
                  <rect x="0" y="0" width="24" height="24" className="fill-white" />
                  {/* Fondo Rosa Interior */}
                  <rect x="2" y="2" width="20" height="20" style={{ fill: 'var(--primary)' }} />

                  {/* Grupo animable (La Lupa Blanca) */}
                  <g className="animate-buscar-adentro origin-center fill-white">
                    <rect x="8" y="6" width="6" height="2" />
                    <rect x="8" y="12" width="6" height="2" />
                    <rect x="6" y="8" width="2" height="4" />
                    <rect x="14" y="8" width="2" height="4" />
                    <rect x="14" y="12" width="2" height="2" />
                    <rect x="16" y="14" width="2" height="2" />
                    <rect x="18" y="16" width="2" height="2" />
                  </g>
                </svg>
              </div>

              {/* Logo Text */}
              <div className="flex flex-col justify-center">
                <span
                  className="font-bold text-[14px] md:text-[18px] text-foreground uppercase tracking-wider"
                  style={{ textShadow: '4px 4px 0px #88c0d0' }}
                >
                  HARDWARE<span className="text-primary group-hover:animate-blink-pink transition-colors ml-[1px]">AR</span>
                </span>
                <span className="text-[6px] md:text-[8px] text-secondary font-bold uppercase animate-pixel-blink ml-1">
                  V1.0_READY
                </span>
              </div>
            </Link>

            {/* Navegación central */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/comparativa"
                className="px-3 py-2 text-[10px] uppercase font-bold text-secondary hover:text-primary hover:bg-muted border-2 border-transparent hover:border-border transition-colors"
              >
                Comparativas
              </Link>
              <Link
                href="/guia"
                className="px-3 py-2 text-[10px] uppercase font-bold text-secondary hover:text-primary hover:bg-muted border-2 border-transparent hover:border-border transition-colors"
              >
                Guías de Presupuesto
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              {/* Botón menú móvil */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden min-h-11 min-w-11 px-3 py-2 border-2 border-border bg-card text-[8px] uppercase font-bold text-secondary inline-flex items-center justify-center gap-2 hover:bg-muted transition-colors"
                aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? (
                  <X className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Menu className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {isAuthLoading ? (
                <div className="px-3 py-2 border-2 border-border text-[8px] uppercase text-foreground/80">
                  AUTH...
                </div>
              ) : authUser ? (
                <>
                  <Link
                    href="/auth"
                    className="min-h-11 px-3 py-2 border-2 border-border bg-card text-[8px] uppercase font-bold text-secondary hidden sm:inline-flex items-center gap-2"
                  >
                    <UserRound className="w-3 h-3" />
                    {getUserDisplayName(authUser)}
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-11 px-3 py-2 border-2 border-border bg-card text-[8px] uppercase font-bold text-primary inline-flex items-center gap-2 hover:bg-muted transition-colors"
                    aria-label="SALIR - Cerrar sesion"
                  >
                    <LogOut className="w-3 h-3" />
                    <span className="hidden sm:inline">SALIR</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  className="min-h-11 min-w-11 px-3 py-2 border-2 border-border bg-card text-[8px] uppercase font-bold text-secondary inline-flex items-center gap-2 hover:bg-muted transition-colors"
                  aria-label="LOGIN - Iniciar sesion"
                >
                  <LogIn className="w-3 h-3" />
                  <span className="hidden sm:inline">LOGIN</span>
                </Link>
              )}

              <button
                onClick={toggleTheme}
                className="group relative flex items-center justify-center w-12 h-12 bg-card border-4 border-border pixel-shadow-primary hover:bg-muted active:translate-x-1 active:translate-y-1 transition-all"
                aria-label={isDark ? '[ TOGGLE_OS ] MODO CLARO' : '[ TOGGLE_OS ] MODO OSCURO'}
              >
                {isDark ? (
                  <Sun className="w-6 h-6 text-accent" aria-hidden="true" />
                ) : (
                  <Moon className="w-6 h-6 text-primary" aria-hidden="true" />
                )}

                <span aria-hidden="true" className="absolute -bottom-10 right-0 hidden group-hover:block bg-black text-white text-[8px] p-2 whitespace-nowrap border-2 border-white">
                  [ TOGGLE_OS ]
                </span>
              </button>
            </div>
          </div>

          {/* Menú móvil desplegable */}
          {isMobileMenuOpen && (
            <div className="md:hidden border-t-2 border-border bg-background">
              <nav className="flex flex-col py-2">
                <Link
                  href="/comparativa"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 text-[10px] uppercase font-bold text-secondary hover:text-primary hover:bg-muted transition-colors border-b border-border"
                >
                  Comparativas
                </Link>
                <Link
                  href="/guia"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 text-[10px] uppercase font-bold text-secondary hover:text-primary hover:bg-muted transition-colors"
                >
                  Guías de Presupuesto
                </Link>
              </nav>
            </div>
          )}
        </div>
      </header>
    </>
  );
}

export default Navigation;
