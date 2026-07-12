import { fetchMarketText } from '@/services/marketTransport';
import type { StockMeta } from '@/types/market';

interface EastmoneySuggestion {
  Code?: string;
  Name?: string;
  QuoteID?: string;
  Classify?: string;
  SecurityTypeName?: string;
}

const SUGGEST_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8';

export async function searchAshareStocks(keyword: string): Promise<StockMeta[]> {
  const input = keyword.trim();
  if (!input) {
    return [];
  }

  const url = new URL('https://searchapi.eastmoney.com/api/suggest/get');
  url.searchParams.set('input', input);
  url.searchParams.set('type', '14');
  url.searchParams.set('token', SUGGEST_TOKEN);
  url.searchParams.set('count', '12');

  const text = await fetchMarketText(url.toString());
  if (!text) {
    return [];
  }

  const payload = JSON.parse(text) as { QuotationCodeTable?: { Data?: EastmoneySuggestion[] } };
  const seen = new Set<string>();

  return (payload.QuotationCodeTable?.Data ?? [])
    .map(normalizeSuggestion)
    .filter((item): item is StockMeta => {
      if (!item || seen.has(item.code)) {
        return false;
      }
      seen.add(item.code);
      return true;
    });
}

function normalizeSuggestion(item: EastmoneySuggestion): StockMeta | null {
  const code = String(item.Code ?? '').trim();
  const name = String(item.Name ?? '').trim();
  if (item.Classify !== 'AStock' || !/^\d{6}$/.test(code) || !name) {
    return null;
  }

  const market = marketFor(code, item.QuoteID);
  const marketLabel = market === 'SH' ? '沪市A股' : market === 'SZ' ? '深市A股' : '北交所';

  return {
    code,
    name,
    market,
    sector: item.SecurityTypeName?.trim() || marketLabel,
    basePrice: 0,
    floatMarketCap: 0,
    pe: 0,
    beta: 1,
    style: 'core'
  };
}

function marketFor(code: string, quoteId = ''): StockMeta['market'] {
  if (/^(4|8|92)/.test(code)) {
    return 'BJ';
  }
  if (quoteId.startsWith('1.') || code.startsWith('6')) {
    return 'SH';
  }
  return 'SZ';
}
