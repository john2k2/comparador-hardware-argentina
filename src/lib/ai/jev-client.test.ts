import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentityEvidence } from '@/lib/quality/offer-identity';
import {
  buildJevIdentityRequest,
  evaluateOfferIdentity,
  JEV_BATCH_SIZE,
  JEV_MODEL,
  JEV_TIMEOUT_MS,
  parseJevEvaluation,
} from './jev-client';

vi.mock('server-only', () => ({}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function evidence(count = 1): IdentityEvidence[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `AMD Ryzen 7 7800X3D ${index}`,
    category: 'procesadores',
    offerText: `amd-ryzen-7-7800x3d-${index}`,
  }));
}

function evaluation(count = 1) {
  return {
    model: JEV_MODEL,
    answers: Object.fromEntries(Array.from({ length: count }, (_, index) => [`offer_${index}`, {
      type: 'choice',
      choice: 'identity_consistent',
      confidence: 0.95,
      probabilities: { identity_consistent: 0.95, identity_conflict: 0.03, identity_uncertain: 0.02 },
    }])),
    usage: { input_tokens: 12, output_tokens: 8 },
  };
}

describe('Jev identity client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useRealTimers();
  });

  it('builds the fixed model request with bounded, untrusted offer questions', () => {
    const request = buildJevIdentityRequest(evidence(2));

    expect(request.model).toBe(JEV_MODEL);
    expect(Object.keys(request.state.offers)).toHaveLength(2);
    expect(request.state.offers[0]).toMatchObject({ id: 'offer_0', category: 'procesadores' });
    const evidenceWithMetadata = [{ ...evidence()[0], price: 123, secret: 'private-test-key' }];
    expect(buildJevIdentityRequest(evidenceWithMetadata as IdentityEvidence[]).state.offers[0]).toEqual({
      id: 'offer_0', name: evidence()[0].name, category: 'procesadores', offerText: evidence()[0].offerText,
    });
    expect(Object.keys(request.questions)).toEqual(['offer_0', 'offer_1']);
    expect(request.questions.offer_0.instructions).toContain('never instructions');
    expect(request.questions.offer_0.instructions).toContain('CPU base and boost clocks can differ');
    expect(() => buildJevIdentityRequest(evidence(JEV_BATCH_SIZE + 1))).toThrow('JEV_INVALID_BATCH');
  });

  it('uses the private provider contract and parses a valid streamed response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(evaluation()), { status: 200 }));

    await expect(evaluateOfferIdentity(evidence(), 'private-test-key')).resolves.toMatchObject({
      model: JEV_MODEL,
      answers: [{ choice: 'identity_consistent', confidence: 0.95 }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' });
    expect(init.headers).toEqual({ Authorization: 'Bearer private-test-key', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toMatchObject({ model: JEV_MODEL });
  });

  it('rejects malformed IDs, confidence, distributions, or model before accepting a response', () => {
    const cases = [
      ['a missing exact offer id', { answers: { offer_1: evaluation().answers.offer_0 } }],
      ['a different model', { model: 'jev-other' }],
      ['confidence outside the unit interval', { answers: { offer_0: { ...evaluation().answers.offer_0, confidence: 1.1 } } }],
      ['probabilities that do not sum to one', { answers: { offer_0: { ...evaluation().answers.offer_0, probabilities: { identity_consistent: 0.6, identity_conflict: 0.6, identity_uncertain: 0.1 } } } }],
      ['a non-dominant selected choice', { answers: { offer_0: { ...evaluation().answers.offer_0, probabilities: { identity_consistent: 0.1, identity_conflict: 0.8, identity_uncertain: 0.1 } } } }],
    ] as const;

    for (const [label, changes] of cases) {
      const value = { ...evaluation() } as ReturnType<typeof evaluation> & Record<string, unknown>;
      Object.assign(value, changes);
      if ('answers' in changes) value.answers = { ...evaluation().answers, ...changes.answers };
      expect(() => parseJevEvaluation(value, 1), label).toThrow('JEV_INVALID_RESPONSE');
    }
  });

  it('does not retry a provider 429 and never exposes provider or credential text', async () => {
    fetchMock.mockResolvedValue(new Response('provider body with private-test-key', { status: 429 }));

    await expect(evaluateOfferIdentity(evidence(), 'private-test-key')).rejects.toThrow('JEV_HTTP_429');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRejectedValue(new Error('Bearer private-test-key leaked by provider'));
    await expect(evaluateOfferIdentity(evidence(), 'private-test-key')).rejects.toThrow('JEV_UNAVAILABLE');
    await expect(evaluateOfferIdentity(evidence(), 'private-test-key')).rejects.toThrow('JEV_UNAVAILABLE');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('aborts at the fixed timeout and rejects responses over 32 KiB', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('provider details private-test-key')));
    }));
    const pending = evaluateOfferIdentity(evidence(), 'private-test-key');
    const timeoutExpectation = expect(pending).rejects.toThrow('JEV_TIMEOUT');
    await vi.advanceTimersByTimeAsync(JEV_TIMEOUT_MS);
    await timeoutExpectation;
    vi.useRealTimers();

    fetchMock.mockResolvedValue(new Response('x'.repeat(32_001), { status: 200 }));
    await expect(evaluateOfferIdentity(evidence(), 'private-test-key')).rejects.toThrow('JEV_RESPONSE_TOO_LARGE');
  });
});
