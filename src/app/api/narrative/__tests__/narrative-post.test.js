import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../lib/db.js', () => ({
  query: vi.fn()
}));

vi.mock('../../../../engine/narrative.js', () => ({
  updateNarrativeTemperatures: vi.fn().mockResolvedValue({ NAR_01: 55 })
}));

vi.mock('../../../../lib/rate-limiter.js', () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true })
}));

import { POST } from '../route.js';
import { updateNarrativeTemperatures } from '../../../../engine/narrative.js';

const post = (headers = {}) => POST(new Request('http://localhost/api/narrative', { method: 'POST', headers }));

describe('POST /api/narrative', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = 'narrative-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('rejects anonymous callers without recording temperatures', async () => {
    const res = await post();
    expect(res.status).toBe(401);
    expect(updateNarrativeTemperatures).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const res = await post({ 'x-internal-api-secret': 'guess' });
    expect(res.status).toBe(401);
  });

  it('fails closed when INTERNAL_API_SECRET is not configured', async () => {
    delete process.env.INTERNAL_API_SECRET;
    const res = await post({ 'x-internal-api-secret': 'anything' });
    expect(res.status).toBe(500);
    expect(updateNarrativeTemperatures).not.toHaveBeenCalled();
  });

  it('updates temperatures for an authorised caller', async () => {
    const res = await post({ 'x-internal-api-secret': 'narrative-secret' });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.temperatures).toEqual({ NAR_01: 55 });
  });
});
