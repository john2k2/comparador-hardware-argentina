import type { Metadata } from 'next';
import { NotFoundState } from '@/components/functional/NotFoundState';
import { NOT_FOUND_PAGE_DESCRIPTION, NOT_FOUND_PAGE_TITLE, buildNoIndexMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildNoIndexMetadata({ title: NOT_FOUND_PAGE_TITLE, description: NOT_FOUND_PAGE_DESCRIPTION });

export default function NotFound() {
  return <NotFoundState />;
}
