import { ADSENSE_EDITORIAL_PILOT, canPreviewEditorialAd } from '@/lib/adsense/editorial-pilot';

type Props = {
  pathname: string;
  contentReady: boolean;
};

/** Solo desarrollo: comprueba ubicación y espacio sin contactar a Google. */
export function EditorialAdPreview({ pathname, contentReady }: Props) {
  if (!canPreviewEditorialAd(pathname, {
    nodeEnv: process.env.NODE_ENV,
    previewRequested: process.env.ADSENSE_PREVIEW,
    contentReady,
  })) return null;

  return (
    <div className="@container" data-ad-preview="editorial">
      <aside aria-label="Publicidad" className="my-10 hidden flex-col items-center gap-2 @[300px]:flex">
        <p className="font-body text-xs text-foreground">Publicidad</p>
        <div
          className="flex items-center justify-center border border-dashed border-border bg-muted px-6 text-center font-body text-sm text-foreground"
          style={{ width: ADSENSE_EDITORIAL_PILOT.width, height: ADSENSE_EDITORIAL_PILOT.height }}
        >
          Vista previa del espacio de anuncios. No se cargan anuncios reales.
        </div>
      </aside>
    </div>
  );
}
