import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SearchExperience } from '@/components/search/SearchExperience';
import { buildCategoryLandingState } from '@/lib/search/category-landing-state';
import {
  listCategoryLandingSlugs,
  resolveCategoryFromLandingSlug,
} from '@/lib/seo/category-landing-routes';
import { resolveCategoryLandingPageMetadata } from '@/lib/seo/landing-metadata';

type CategoryLandingProps = {
  params: Promise<{ categoria: string }>;
};

export const revalidate = 120;

export function generateStaticParams() {
  return listCategoryLandingSlugs().map((categoria) => ({ categoria }));
}

export async function generateMetadata({ params }: CategoryLandingProps): Promise<Metadata> {
  return resolveCategoryLandingPageMetadata((await params).categoria);
}

export default async function CategoryLandingPage({ params }: CategoryLandingProps) {
  const category = resolveCategoryFromLandingSlug((await params).categoria);

  if (!category) {
    notFound();
  }

  return <SearchExperience state={buildCategoryLandingState(category)} />;
}
