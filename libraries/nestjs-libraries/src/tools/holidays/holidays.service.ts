import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ioRedis } from '../../redis/redis.service';
import { AiProviderResolver } from '../../ai/ai.provider-resolver';
import { Holiday } from './holidays.types';

const enrichSchema = z.object({
  items: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      hashtags: z.array(z.string()),
    })
  ),
});

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días

@Injectable()
export class HolidaysService {
  private _logger = new Logger(HolidaysService.name);

  constructor(private _aiProviderResolver: AiProviderResolver) {}

  async getHolidays(
    orgId: string,
    month: number,
    year: number,
    country = 'MX'
  ): Promise<Holiday[]> {
    const cacheKey = `tools:holidays:${country}:${year}`;
    const cached = await ioRedis.get(cacheKey);
    if (cached) {
      return this._filterMonth(JSON.parse(cached), month);
    }

    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`
    ).catch(() => null);
    if (!res || !res.ok) {
      this._logger.warn(`Nager.Date unavailable for ${country}/${year}`);
      return [];
    }
    const raw: Array<{ date: string; localName: string }> = await res.json();

    let holidays: Holiday[] = raw.map((h) => ({
      date: h.date,
      name: h.localName,
      description: '',
      hashtags: [],
    }));

    holidays = await this._enrich(orgId, holidays);

    await ioRedis.set(cacheKey, JSON.stringify(holidays), 'EX', TTL_SECONDS);
    return this._filterMonth(holidays, month);
  }

  private _filterMonth(holidays: Holiday[], month: number) {
    return holidays.filter((h) => parseInt(h.date.split('-')[1], 10) === month);
  }

  private async _enrich(orgId: string, holidays: Holiday[]): Promise<Holiday[]> {
    try {
      const provider = await this._aiProviderResolver.getTextProviderByOrgId(orgId);
      if (!provider || !holidays.length) return holidays;

      const prompt = `Para cada festividad, genera una descripción corta (1 frase, en español) orientada a redes sociales y 3 hashtags (sin #, CamelCase).
Festividades: ${JSON.stringify(holidays.map((h) => ({ date: h.date, name: h.name })))}`;

      const out = await provider.generateStructured(prompt, enrichSchema);
      return holidays.map((h) => {
        const found = out.items.find((i) => i.date === h.date);
        return found
          ? {
              ...h,
              description: found.description ?? '',
              hashtags: found.hashtags ?? [],
            }
          : h;
      });
    } catch (e) {
      this._logger.warn(`Holiday enrichment failed: ${e}`);
      return holidays;
    }
  }
}
