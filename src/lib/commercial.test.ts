import { describe, expect, it } from 'vitest';
import {
  getOutboundStoreLinkType,
  getOutboundStoreRel,
  isSponsoredStore,
  parseSponsoredStoreIds,
} from './commercial';

describe('commercial helpers', () => {
  it('parses sponsored store ids defensively', () => {
    expect(parseSponsoredStoreIds(' mexx, venex , mexx ,, ')).toEqual(['mexx', 'venex']);
  });

  it('detects sponsored stores case-insensitively', () => {
    expect(isSponsoredStore('MeXx', ['mexx'])).toBe(true);
    expect(isSponsoredStore('venex', ['mexx'])).toBe(false);
  });

  it('builds rel values that disclose sponsored links', () => {
    expect(getOutboundStoreLinkType('mexx', ['mexx'])).toBe('sponsored');
    expect(getOutboundStoreRel('sponsored')).toBe('sponsored noopener noreferrer');
    expect(getOutboundStoreRel('organic')).toBe('noopener noreferrer');
  });
});
