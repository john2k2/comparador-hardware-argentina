import type { Metadata } from 'next';
import { SearchExperience } from '@/components/search/SearchExperience';
import { parseSearchState } from '@/lib/search/search-state';
import { resolveSearchMetadata } from '@/lib/search/search-page-metadata';

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 120;

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  return resolveSearchMetadata(parseSearchState(await searchParams));
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  return <SearchExperience state={parseSearchState(await searchParams)} />;
}
