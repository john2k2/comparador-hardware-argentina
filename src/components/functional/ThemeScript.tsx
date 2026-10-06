'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface ThemeScriptProps {
  nonce?: string;
}

const themeInitScript = `
  (function () {
    try {
      var savedTheme = localStorage.getItem('theme');
      var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var shouldUseDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);

      if (shouldUseDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      document.documentElement.classList.remove('dark');
    }
  })();
`;

export function ThemeScript({ nonce }: ThemeScriptProps) {
  const pathname = usePathname();
  useEffect(() => {
    // La respuesta 404 puede no ejecutar el script inicial. Restaurar la
    // preferencia al hidratar también cubre navegación y recargas con CSP.
    let theme: string | null = null;
    try { theme = localStorage.getItem('theme'); } catch { /* Usar preferencia del sistema. */ }
    const dark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, [pathname]);
  return (
    <script
      id="theme-init"
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
