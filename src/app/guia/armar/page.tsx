import type { Metadata } from 'next';
import { ArmarPcView } from '@/components/seo/ArmarPcView';
import { resolveCustomBudgetSlots } from '@/lib/seo/budget-builder';
import { parseBuilderBudgetPesos } from '@/lib/seo/budget-query';
import { loadGuideCatalogProducts } from '@/lib/seo/guide-catalog';
import { resolveArmarPcMetadata } from '@/lib/seo/landing-metadata';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 300;
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return resolveArmarPcMetadata(params.pesos);
}

export default async function ArmarPcPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawPesos = params.pesos;
  const budget = parseBuilderBudgetPesos(rawPesos);
  const submitted = Array.isArray(rawPesos)
    ? rawPesos.some((value) => value.trim().length > 0)
    : Boolean(rawPesos?.trim());
  const resolved = budget
    ? resolveCustomBudgetSlots(budget, await loadGuideCatalogProducts())
    : null;

  return <ArmarPcView budget={budget} submitted={submitted} resolved={resolved} />;
}
