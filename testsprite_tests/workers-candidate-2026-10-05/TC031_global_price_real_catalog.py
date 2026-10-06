import asyncio
import json
import re
import time
from urllib.parse import urlencode
from playwright.async_api import async_playwright, expect

# Worker candidato con la RPC pública real, sin fixtures ni escrituras.
# El dominio principal desafía al ejecutor remoto de TestSprite con HTTP 403.
BASE = 'https://hardware-ar-price-qa-20261006.ortiz-jonathan.workers.dev'

async def run_test():
    pw = await async_playwright().start()
    browser = None
    context = None
    try:
        browser = await pw.chromium.launch(headless=True, args=['--window-size=1068,1006', '--disable-dev-shm-usage', '--ipc=host', '--single-process'])
        context = await browser.new_context(viewport={'width': 1068, 'height': 1006})
        context.set_default_timeout(20000)
        await context.route('**/*google-analytics.com/**', lambda route: route.abort())
        await context.route('**/*googletagmanager.com/**', lambda route: route.abort())
        await context.add_init_script("localStorage.setItem('cha-analytics-consent:v1',JSON.stringify({allowed:false,savedAt:Date.now()}))")
        page = await context.new_page()
        # Usar la sesión del navegador y sus cabeceras: la petición HTTP del
        # ejecutor remoto recibe 403 en este dominio antes de llegar al recorrido.
        await page.goto(BASE + '/search', wait_until='domcontentloaded')
        # Un piso distinto evita respuestas anteriores del cache de búsqueda.
        minimum = 100137 + (time.time_ns() % 1000000) / 1000000
        params = {'minPrice': str(minimum), 'maxPrice': '300000', 'sortBy': 'price-asc'}
        proof = []
        data = []
        for number in [1, 2]:
            query = urlencode({**params, 'page': number})
            response = await page.evaluate('''async url => {
                const start=performance.now();
                const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
                const text=await r.text();
                return {status:r.status,ms:Math.round(performance.now()-start),
                  cache:r.headers.get('x-search-cache'),body:r.ok?JSON.parse(text):null,
                  errorTitle:r.ok?null:(text.match(/<title>([^<]+)<\\/title>/i)?.[1]??'sin título')};
            }''', BASE + '/api/search?' + query)
            elapsed = response['ms']
            assert response['status'] == 200, f'HTTP {response["status"]} en página {number}: {response["errorTitle"]}'
            assert elapsed < 8000, f'Consulta fría tardó {elapsed} ms'
            assert response['cache'] in ['DB', 'DB-STALE'], f'Respuesta sin lectura DB: {response["cache"]}'
            body = response['body']
            assert len(body['products']) == 12, f'Cantidad: {len(body["products"])}'
            assert body['pagination']['page'] == number and body['pagination']['totalPages'] > 1, f'Paginación: {body["pagination"]}'
            assert all(minimum <= p['lowestPrice'] <= 300000 for p in body['products']), 'Precio fuera del rango'
            assert all(not p['id'].startswith('fixture-') for p in body['products']), 'Catálogo sintético inesperado'
            data.append(body)
            proof.append({'page': number, 'ms': elapsed, 'cache': response['cache'], 'total': body['pagination']['total']})
            await asyncio.sleep(1)
        first_ids = [p['id'] for p in data[0]['products']]
        second_ids = [p['id'] for p in data[1]['products']]
        assert len(set(first_ids + second_ids)) == 24, 'IDs repetidos entre páginas'
        assert data[0]['pagination']['total'] == data[1]['pagination']['total'], 'Total varía entre páginas'
        prices = [p['lowestPrice'] for d in data for p in d['products']]
        assert prices == sorted(prices), 'Precios fuera de orden'
        await page.goto(BASE + '/search?' + urlencode(params), wait_until='domcontentloaded')
        cards = page.locator('#product-grid-start a[href^="/product/"]')
        await expect(cards).to_have_count(12)
        ids = await cards.evaluate_all("els=>els.map(e=>decodeURIComponent(new URL(e.href).pathname.split('/').at(-1)))")
        assert ids == first_ids, f'IDs de tarjetas distintas en página 1: {ids} != {first_ids}'
        await page.get_by_role('link', name='Ir a la página 2', exact=True).click()
        await expect(page).to_have_url(re.compile(r'.*[?&]page=2(?:&|$)'))
        await expect(cards).to_have_count(12)
        await expect(page.locator('#product-grid-start article').first).to_be_visible()
        for _ in range(30):
            ids = await cards.evaluate_all("els=>els.map(e=>decodeURIComponent(new URL(e.href).pathname.split('/').at(-1)))")
            if ids == second_ids: break
            await asyncio.sleep(0.2)
        assert ids == second_ids, f'IDs de tarjetas distintas en página 2: {ids} != {second_ids}'
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Desbordamiento horizontal'
        print(json.dumps({'case':'TC031','passed':True,'syntheticData':False,'source':'Worker candidato QA / catálogo real','coldApiReads':proof}))
    finally:
        if context: await context.close()
        if browser: await browser.close()
        await pw.stop()
