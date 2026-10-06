export const PRIMARY_NAV_LINKS = [
  { href: '/search', label: 'Comparar precios' },
  { href: '/guia/armar', label: 'Armá tu PC' },
  { href: '/#ultimas-ofertas', label: 'Últimas ofertas' },
  { href: '/guia', label: 'Guías' },
] as const;

export const SECONDARY_NAV_LINKS = [
  { href: '/comparativa/comparar', label: 'Comparar productos' },
  { href: '/comparativa', label: 'Comparativas' },
] as const;

/** El acceso comercial sólo aparece cuando su sección está habilitada. */
export function getPrimaryNavLinks(showGames = false): ReadonlyArray<{ href: string; label: string }> {
  return showGames
    ? [...PRIMARY_NAV_LINKS, { href: '/juegos-digitales', label: 'Juegos' }]
    : PRIMARY_NAV_LINKS;
}

/** Marca el recorrido actual sin activar una sección por compartir el prefijo /guia. */
export function isNavLinkActive(href: string, pathname: string): boolean {
  if (href.includes('#')) return false;
  if (href === '/search') return pathname === '/search' || pathname.startsWith('/comparar/') || pathname.startsWith('/product/');
  if (href === '/guia/armar') return pathname === '/guia/armar';
  if (href === '/guia') return (pathname === '/guia' || pathname.startsWith('/guia/')) && pathname !== '/guia/armar';
  if (href === '/comparativa') return pathname === '/comparativa' || (pathname.startsWith('/comparativa/') && pathname !== '/comparativa/comparar');
  return pathname === href;
}
