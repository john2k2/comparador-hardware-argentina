import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';

vi.mock('@/lib/site-config', () => ({ SITE_NAME: 'Comparador Hardware Argentina', SITE_URL: 'https://catalog.example',
  SUPPORT_EMAIL: 'support@example.test', buildMailtoHref: (subject: string, body?: string) =>
    `mailto:support@example.test?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`,
}));
import ContactoPage from './page';

describe('reporte contextual en contacto', () => {
  it('prepara un correo revisable, sin enviar ni abrir destinos arbitrarios', async () => {
    const $ = load(renderToStaticMarkup(await ContactoPage({ searchParams: Promise.resolve({ report: 'offer',
      productId: 'cpu-7', productName: 'Ryzen 7 <script>', storeName: 'Mexx', offerUrl: 'https://www.mexx.com.ar/producto/7' }) })));
    const report = $('#reportar-oferta');
    const href = report.find('a').attr('href')!;
    const params = new URL(href).searchParams;
    expect(href.startsWith('mailto:support@example.test?')).toBe(true);
    expect(params.get('body')).toContain('Ficha: https://catalog.example/product/cpu-7');
    expect(params.get('body')).toContain('Tienda: Mexx');
    expect(report.find('script')).toHaveLength(0);
    expect(report.text()).toContain('Revisá el mensaje y envialo');
  });

  it('un acceso normal conserva los contactos y no inventa un reporte', async () => {
    const $ = load(renderToStaticMarkup(await ContactoPage({ searchParams: Promise.resolve({}) })));
    expect($('#reportar-oferta').text()).toContain('junto a una oferta');
    expect($('#reportar-oferta a')).toHaveLength(0);
    expect($('#asesoria-pc')).toHaveLength(1);
    expect($('a[href^="mailto:"]').length).toBeGreaterThanOrEqual(3);
  });
});
