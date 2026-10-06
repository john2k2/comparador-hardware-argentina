import { headers } from 'next/headers';
import { SearchPageClient } from '@/components/search/SearchPageClient';
import { buildApiSearchKey, hasSearchIntent, type SearchPageState } from '@/lib/search/search-state';
import { readInitialSearchPage } from '@/lib/search/read-initial-search-page';
import { getCategorySeoCopy, isIndexableCategoryLanding } from '@/lib/search/search-seo';
import { buildFaqSchema } from '@/lib/seo/faq-schema';
import { serializeJsonLd } from '@/lib/seo/serialize-jsonld';

type SearchExperienceProps = {
  state: SearchPageState;
};

/**
 * Shared body for the catalog: the indexable `/comparar/<slug>` landings and
 * the non-indexable `/search` result sets render the exact same experience,
 * so the editorial copy and FAQ schema never drift between them.
 */
export async function SearchExperience({ state }: SearchExperienceProps) {
  const initialPage = await readInitialSearchPage(state);
  const initialResolvedRequestKey = hasSearchIntent(state)
    // The RPC may clamp page 2 to page 1 after availability filtering. Cache
    // its answer, including an empty result, under the requested page so
    // hydration does not fetch the same result again. Read failures throw.
    ? `${buildApiSearchKey(state) ?? '__empty__'}|page=${state.page}`
    : null;

  const isCategoryLanding = isIndexableCategoryLanding(state);
  const categorySeoCopy = isCategoryLanding ? getCategorySeoCopy(state.category) : null;
  const faqJsonLd = categorySeoCopy?.faqs?.length ? buildFaqSchema(categorySeoCopy.faqs) : null;
  const nonce = faqJsonLd
    ? (await headers()).get('x-content-security-policy-nonce') ?? undefined
    : undefined;

  return (
    <>
      {faqJsonLd && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }}
        />
      )}
      <SearchPageClient
        initialState={state}
        initialBaseProducts={initialPage.products}
        initialPagination={initialPage.pagination}
        initialResolvedRequestKey={initialResolvedRequestKey}
        initialHasSearchIntent={hasSearchIntent(state)}
        initialIsCategoryLanding={isCategoryLanding}
      />
    </>
  );
}
