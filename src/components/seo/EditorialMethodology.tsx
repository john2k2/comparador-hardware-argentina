import { SITE_NAME } from '@/lib/site-config';
import type { EditorialMethodology as Methodology } from '@/lib/seo/editorial-methodology';

export function EditorialMethodology({ content }: { content: Methodology }) {
  return (
    <section aria-labelledby="editorial-methodology" className="bg-card border-4 border-border p-5 md:p-6 pixel-shadow mb-8">
      <h2 id="editorial-methodology" className="text-sm font-bold text-primary mb-6">Cómo decidir y qué comprobar</h2>
      <div className="max-w-3xl space-y-6 font-body text-sm leading-relaxed normal-case tracking-normal">
        {content.sections.map((section) => <div key={section.title}>
          <h3 className="font-bold mb-2">{section.title}</h3>
          <p>{section.text}</p>
        </div>)}
        <div>
          <h3 className="font-bold mb-2">Fuentes técnicas</h3>
          <ul className="space-y-3">
            {content.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{source.name}</a></li>)}
          </ul>
        </div>
        <p className="text-muted-foreground">Equipo {SITE_NAME}. Redacción asistida y análisis del catálogo, sin ensayos propios de hardware. Fuentes técnicas consultadas el {content.updatedAt}; esta fecha no es la fecha de cada oferta. Informanos errores desde Contacto.</p>
      </div>
    </section>
  );
}
