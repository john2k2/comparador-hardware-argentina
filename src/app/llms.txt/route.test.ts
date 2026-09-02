import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('llms.txt route', () => {
  it('devuelve markdown con 200', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/markdown/);
    expect(body).toContain('Comparador Hardware Argentina');
    expect(body).toContain('/acerca');
  });
});
