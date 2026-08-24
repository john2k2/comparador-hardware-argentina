import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from './serialize-jsonld';

describe('serializeJsonLd', () => {
  it('escapes script breakers so scraped titles cannot close the JSON-LD tag', () => {
    const html = serializeJsonLd({
      '@type': 'Product',
      name: 'Ryzen</script><script>alert(1)</script>',
    });

    expect(html).not.toContain('</script>');
    expect(html).toContain('\\u003c');
    expect(html).toContain('Ryzen');
  });
});
