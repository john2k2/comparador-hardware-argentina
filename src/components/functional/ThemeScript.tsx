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

export function ThemeScript() {
  return (
    <script
      id="theme-init"
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
