import type { ComparisonSource } from '@/lib/seo/comparisons-data';

export function ComparisonBenchSources({ sources }: { sources: ComparisonSource[] }) {
  return (
    <section className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
      <h2 className="text-[12px] md:text-[14px] uppercase font-bold text-primary mb-4">
        [ FUENTES DE RENDIMIENTO ]
      </h2>
      <p className="text-[11px] md:text-[12px] leading-relaxed normal-case text-foreground/85 font-mono mb-4">
        Las cifras de FPS y deltas salen de reviews de TechPowerUp. No copiamos tablas ni texto: resumimos
        la conclusión y linkeamos la fuente. El dato propio es precio y stock en Argentina.
      </p>
      <ul className="space-y-2 text-[11px] font-mono">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              rel="noopener noreferrer"
              target="_blank"
              className="text-primary hover:underline break-words"
            >
              {source.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
