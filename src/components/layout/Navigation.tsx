'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LogIn, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserDisplayName } from '@/lib/client/auth';
import { syncServerSession } from '@/lib/client/session-sync';
import { hasAdminRole } from '@/lib/server/admin-role';
import { getPrimaryNavLinks, isNavLinkActive, SECONDARY_NAV_LINKS } from '@/lib/seo/primary-nav-links';

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

export function Navigation({ showGames = false }: { showGames?: boolean } = {}) {
  const pathname = usePathname();
  const isDark = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(supabase));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const moreNavigation = useRef<HTMLDetailsElement>(null);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const primaryLinks = getPrimaryNavLinks(showGames);
  const isAdmin = hasAdminRole(authUser);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMobileMenuOpen(false);
      mobileMenuButton.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);

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
    const newTheme = !isDark;
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', newTheme);
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await syncServerSession(null);
    setAuthUser(null);
  };

  return (
      <header
        className="sticky top-0 z-50 border-b-4 border-border bg-background"
        role="banner"
      >
        <div className="w-full px-4 xl:px-8">
          <div className="flex min-h-16 items-center justify-between gap-4">
            <Link
              href="/"
              prefetch={false}
              aria-label="Hardware AR · Inicio"
              aria-current={pathname === '/' ? 'page' : undefined}
              className="group flex shrink-0 items-center gap-3 transition-transform motion-safe:hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
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
              <div className="min-w-0 flex flex-col justify-center">
                <span
                  className="font-bold text-[14px] md:text-[18px] text-foreground uppercase tracking-wider truncate md:[text-shadow:4px_4px_0_#88c0d0]"
                >
                  HARDWARE<span className="text-primary group-hover:text-secondary transition-colors ml-[1px]">AR</span>
                </span>
                <span className="text-[10px] font-mono! text-muted-foreground font-bold uppercase ml-1">
                  V1.0_READY
                </span>
              </div>
            </Link>

            <nav aria-label="Navegación principal" className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex">
              {primaryLinks.map((link) => (
                <Link key={link.href} href={link.href} prefetch={false}
                  aria-current={isNavLinkActive(link.href, pathname) ? 'location' : undefined}
                  className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 px-2 py-2 font-mono! text-sm font-bold transition-colors hover:bg-muted hover:text-primary 2xl:px-3 2xl:text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${isNavLinkActive(link.href, pathname) ? 'border-primary text-primary' : 'border-transparent text-secondary'}`}>
                  {link.label}
                </Link>
              ))}
              <details ref={moreNavigation} className="nav-more relative shrink-0" onKeyDown={(event) => {
                if (event.key === 'Escape' && moreNavigation.current) {
                  moreNavigation.current.open = false;
                  moreNavigation.current.querySelector('summary')?.focus();
                }
              }}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-2 py-2 font-mono! text-sm font-bold text-secondary hover:bg-muted hover:text-primary 2xl:px-3 2xl:text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden">
                  Más <ChevronDown className="nav-more-chevron h-4 w-4" aria-hidden="true" />
                </summary>
                <div className="nav-panel absolute right-0 top-full z-10 min-w-64 border-2 border-border bg-card p-2 pixel-shadow">
                  {SECONDARY_NAV_LINKS.map((link) => (
                    <Link key={link.href} href={link.href} prefetch={false}
                      aria-current={isNavLinkActive(link.href, pathname) ? 'location' : undefined}
                      onClick={() => { if (moreNavigation.current) moreNavigation.current.open = false; }}
                      className="flex min-h-11 items-center px-3 py-3 font-mono! text-sm font-bold text-secondary hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-secondary">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </details>
            </nav>

            <div className="flex items-center gap-2">
              {/* Botón menú móvil */}
              <button
                type="button"
                ref={mobileMenuButton}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="nav-toggle xl:hidden min-h-11 min-w-11 px-3 py-2 border-2 border-border bg-card text-secondary inline-flex items-center justify-center gap-2 hover:bg-muted transition-colors"
                data-open={isMobileMenuOpen}
                aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-primary-navigation"
              >
                <span className="nav-toggle-lines" aria-hidden="true">
                  <span className="nav-toggle-line" />
                  <span className="nav-toggle-line" />
                  <span className="nav-toggle-line" />
                </span>
              </button>

              {isAuthLoading ? (
                <div className="hidden sm:block px-3 py-2 border-2 border-border font-mono! text-xs font-bold text-secondary">
                  Cargando…
                </div>
              ) : authUser ? (
                <>
                  <Link
                    href={isAdmin ? '/admin/seguimiento' : '/auth'}
                    prefetch={false}
                    className="min-h-11 max-w-[9rem] px-3 py-2 border-2 border-border bg-card font-mono! text-xs font-bold text-secondary hidden sm:inline-flex items-center gap-2"
                  >
                    <UserRound className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{isAdmin ? 'Panel admin' : getUserDisplayName(authUser)}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-11 px-3 py-2 border-2 border-border bg-card font-mono! text-xs font-bold text-primary inline-flex items-center gap-2 hover:bg-muted transition-colors"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut className="w-3 h-3" aria-hidden="true" />
                    <span className="hidden sm:inline">Salir</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  prefetch={false}
                  className="hidden md:inline-flex min-h-11 min-w-11 px-3 py-2 border-2 border-border bg-card font-mono! text-xs font-bold text-secondary items-center gap-2 hover:bg-muted transition-colors"
                  aria-label="Iniciar sesión"
                >
                  <LogIn className="w-3 h-3" aria-hidden="true" />
                  <span className="hidden sm:inline">Ingresar</span>
                </Link>
              )}

              <button
                onClick={toggleTheme}
                className="group relative flex items-center justify-center w-11 h-11 min-h-11 bg-card border-4 border-border pixel-shadow-primary hover:bg-muted motion-safe:active:translate-x-1 motion-safe:active:translate-y-1 transition-colors focus-visible:outline-2 focus-visible:outline-secondary"
                aria-label={isDark ? 'Usar tema claro' : 'Usar tema oscuro'}
              >
                {isDark ? (
                  <Sun className="w-6 h-6 text-accent" aria-hidden="true" />
                ) : (
                  <Moon className="w-6 h-6 text-primary" aria-hidden="true" />
                )}

              </button>
            </div>
          </div>

          {/* Menú móvil desplegable */}
          <div className={`nav-panel absolute left-0 right-0 top-full xl:hidden border-b-4 border-border bg-card pixel-shadow ${isMobileMenuOpen ? '' : 'hidden'}`}>
              <nav id="mobile-primary-navigation" aria-label="Navegación móvil" className="max-h-[calc(100dvh-4rem)] overflow-y-auto flex flex-col py-2">
                {[...primaryLinks, ...SECONDARY_NAV_LINKS].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    aria-current={isNavLinkActive(link.href, pathname) ? 'location' : undefined}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="min-h-11 px-4 py-3 font-mono! text-base font-bold text-secondary hover:text-primary hover:bg-muted transition-colors border-b border-border"
                  >
                    {link.label}
                  </Link>
                ))}
                {isAdmin ? (
                  <Link
                    href="/admin/seguimiento"
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="min-h-11 px-4 py-3 font-mono! text-base font-bold text-secondary hover:text-primary hover:bg-muted transition-colors border-b border-border"
                  >
                    Panel admin
                  </Link>
                ) : null}
                <Link
                  href="/auth"
                  prefetch={false}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="min-h-11 px-4 py-3 font-mono! text-base font-bold text-secondary hover:text-primary hover:bg-muted transition-colors"
                >
                  {authUser ? 'Mi cuenta' : 'Iniciar sesion'}
                </Link>
              </nav>
          </div>
        </div>
      </header>
  );
}

export default Navigation;
