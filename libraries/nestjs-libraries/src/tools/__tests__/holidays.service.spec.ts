import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HolidaysService } from '../holidays/holidays.service';
import { ioRedis } from '../../redis/redis.service';

const NAGER = [
  { date: '2026-09-16', localName: 'Día de la Independencia', name: 'Independence Day' },
  { date: '2026-11-02', localName: 'Día de Muertos', name: 'Day of the Dead' },
];

describe('HolidaysService', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => NAGER,
    } as any);
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await ioRedis.del('tools:holidays:MX:2026');
  });

  const makeService = (provider: any = null) => {
    const resolver = { getTextProviderByOrgId: vi.fn().mockResolvedValue(provider) };
    return new HolidaysService(resolver as any);
  };

  it('fetches year, filters by month', async () => {
    const service = makeService();
    const out = await service.getHolidays('org1', 9, 2026, 'MX');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Día de la Independencia');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://date.nager.at/api/v3/PublicHolidays/2026/MX'
    );
  });

  it('uses cache on second call', async () => {
    const service = makeService();
    await service.getHolidays('org1', 9, 2026, 'MX');
    await service.getHolidays('org1', 11, 2026, 'MX');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('enriches with AI when provider available', async () => {
    const provider = {
      generateStructured: vi.fn().mockResolvedValue({
        items: [
          { date: '2026-09-16', description: 'desc', hashtags: ['VivaMexico'] },
          { date: '2026-11-02', description: 'desc2', hashtags: ['DiaDeMuertos'] },
        ],
      }),
    };
    const service = makeService(provider);
    const out = await service.getHolidays('org1', 9, 2026, 'MX');
    expect(out[0].hashtags).toEqual(['VivaMexico']);
  });

  it('returns empty array when Nager fails', async () => {
    fetchSpy.mockResolvedValue({ ok: false } as any);
    const service = makeService();
    const out = await service.getHolidays('org1', 9, 2026, 'MX');
    expect(out).toEqual([]);
  });
});
