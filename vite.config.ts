import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';

const allowedMarketHosts = new Set([
  'push2.eastmoney.com',
  'push2his.eastmoney.com',
  'push2ex.eastmoney.com',
  'hq.sinajs.cn',
  'quotes.sina.cn',
  'quotes.sina.com.cn',
  'vip.stock.finance.sina.com.cn',
  'money.finance.sina.com.cn',
  'finance.sina.com.cn',
  'stock.gtimg.cn',
  'searchapi.eastmoney.com',
  'search-api-web.eastmoney.com',
  'datacenter.eastmoney.com',
  'datacenter-web.eastmoney.com',
  'np-anotice-stock.eastmoney.com'
]);

export default defineConfig({
  base: './',
  plugins: [vue(), bigaMarketProxy()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 6173,
    strictPort: false
  }
});

function bigaMarketProxy(): Plugin {
  return {
    name: 'biga-market-proxy',
    configureServer(server) {
      server.middlewares.use('/__biga_market', (req, res) => {
        void handleMarketProxy(req, res);
      });
    }
  };
}

async function handleMarketProxy(req: IncomingMessage, res: ServerResponse) {
  try {
    const requestUrl = new URL(req.url ?? '', 'http://127.0.0.1');
    const targetText = requestUrl.searchParams.get('url') ?? '';
    const encoding = requestUrl.searchParams.get('encoding') ?? 'utf-8';
    const target = new URL(targetText);

    if (target.protocol !== 'https:' || !allowedMarketHosts.has(target.hostname)) {
      sendText(res, 403, 'Blocked market data host');
      return;
    }

    const buffer = await requestTextBuffer(target, {
      timeout: 10_000,
      headers: {
        Accept: '*/*',
        Connection: 'close',
        Referer: marketRefererFor(target.hostname),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 BigA/0.1'
      }
    });

    sendText(res, 200, new TextDecoder(encoding).decode(buffer));
  } catch {
    sendText(res, 502, '');
  }
}

function requestTextBuffer(target: URL, options: { headers: Record<string, string>; timeout: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    const req = https.get(
      target,
      {
        timeout: options.timeout,
        headers: options.headers
      },
      (response) => {
        const chunks: Buffer[] = [];

        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const nextTarget = new URL(response.headers.location, target);
          response.resume();

          if (nextTarget.protocol !== 'https:' || !allowedMarketHosts.has(nextTarget.hostname)) {
            reject(new Error(`Blocked redirect host: ${nextTarget.hostname}`));
            return;
          }

          resolve(requestTextBuffer(nextTarget, options));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Market proxy failed: ${response.statusCode}`));
          return;
        }

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Market proxy timed out'));
    });
    req.on('error', reject);
  });
}

function marketRefererFor(hostname: string) {
  if (hostname.endsWith('gtimg.cn')) {
    return 'https://gu.qq.com/';
  }

  if (hostname.endsWith('sina.cn') || hostname.endsWith('sinajs.cn') || hostname.endsWith('sina.com.cn')) {
    return 'https://finance.sina.com.cn/';
  }

  return 'https://quote.eastmoney.com/';
}

function sendText(res: ServerResponse, statusCode: number, text: string) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}
