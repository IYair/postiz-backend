import { describe, it, expect, vi } from 'vitest';
import { ToolsService } from '../tools.service';

const makeService = (overrides: { provider?: any; brandKit?: any } = {}) => {
  const provider =
    overrides.provider === undefined
      ? { generateStructured: vi.fn().mockResolvedValue({ results: ['a', 'b'] }) }
      : overrides.provider;
  const resolver = { getTextProviderByOrgId: vi.fn().mockResolvedValue(provider) };
  const orgService = {
    getBrandKit: vi
      .fn()
      .mockResolvedValue(
        overrides.brandKit ?? { brandKitEnabled: true, brandVoice: 'tono mexicano relajado' }
      ),
  };
  return { service: new ToolsService(resolver as any, orgService as any), provider, resolver, orgService };
};

describe('ToolsService.generate', () => {
  it('returns results from provider', async () => {
    const { service } = makeService();
    const out = await service.generate('org1', 'hashtags', { input: 'café' });
    expect(out).toEqual({ results: ['a', 'b'] });
  });

  it('injects brand voice into prompt when enabled', async () => {
    const { service, provider } = makeService();
    await service.generate('org1', 'captions', { input: 'café' });
    expect(provider.generateStructured.mock.calls[0][0]).toContain('tono mexicano relajado');
  });

  it('skips brand voice when brandKitEnabled is false', async () => {
    const { service, provider } = makeService({
      brandKit: { brandKitEnabled: false, brandVoice: 'tono mexicano relajado' },
    });
    await service.generate('org1', 'captions', { input: 'café' });
    expect(provider.generateStructured.mock.calls[0][0]).not.toContain('tono mexicano relajado');
  });

  it('throws 412 when no provider configured', async () => {
    const { service } = makeService({ provider: null });
    await expect(service.generate('org1', 'hashtags', { input: 'x' })).rejects.toThrow(
      'No AI provider configured'
    );
  });

  it('throws on unknown tool', async () => {
    const { service } = makeService();
    await expect(service.generate('org1', 'nope' as any, { input: 'x' })).rejects.toThrow(
      'Unknown tool'
    );
  });
});
