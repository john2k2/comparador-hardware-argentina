import { editorialUpdatedLabel } from '@/lib/seo/editorial-freshness';

export function EditorialUpdatedStamp({ isoDate }: { isoDate: string }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      {editorialUpdatedLabel(isoDate)}
    </p>
  );
}
