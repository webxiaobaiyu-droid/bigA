const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

const isDev = !app.isPackaged;
const devServerUrl = process.env.BIGA_DEV_SERVER_URL || 'http://127.0.0.1:6173/';
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
const allowedNewsHosts = new Set([
  'np-listapi.eastmoney.com',
  'money.163.com',
  'www.163.com',
  'news.163.com',
  'rss.sina.com.cn',
  'finance.eastmoney.com',
  'stock.eastmoney.com',
  'bond.eastmoney.com',
  'fund.eastmoney.com',
  'wap.eastmoney.com'
]);
const rsshubBaseUrl = resolveRsshubBaseUrl(process.env.BIGA_RSSHUB_BASE_URL || 'https://rsshub.app');

ipcMain.handle('market:fetchText', async (_event, request) => {
  const target = new URL(request.url);

  if (target.protocol !== 'https:' || !allowedMarketHosts.has(target.hostname)) {
    throw new Error(`Blocked market data host: ${target.hostname}`);
  }

  const encoding = request.encoding || 'utf-8';
  try {
    const buffer = await requestTextBuffer(target, {
      timeout: 10_000,
      validateRedirect: isAllowedMarketTarget,
      headers: {
        Accept: '*/*',
        Connection: 'close',
        Referer: marketRefererFor(target.hostname),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 BigA/0.1'
      }
    });
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return '';
  }
});

ipcMain.handle('news:fetchText', async (_event, request) => {
  const targetText = String(request?.target || request?.route || '');
  if (!isSafeNewsTargetText(targetText)) {
    throw new Error('Blocked news route');
  }

  const target = buildNewsUrl(targetText);

  try {
    const buffer = await requestTextBuffer(target, {
      timeout: 8_000,
      validateRedirect: isAllowedNewsTarget,
      headers: {
        Accept: 'text/html, application/json;q=0.9, application/rss+xml;q=0.8, application/xml;q=0.7, */*;q=0.5',
        Connection: 'close',
        Referer: rsshubBaseUrl.origin,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 BigA/0.1'
      }
    });
    return new TextDecoder('utf-8').decode(buffer);
  } catch {
    return '';
  }
});

ipcMain.handle('notification:show', (event, request) => {
  if (!Notification.isSupported()) return false;
  const title = sanitizeNotificationText(request?.title, 80);
  const body = sanitizeNotificationText(request?.body, 240);
  const code = /^\d{6}$/.test(String(request?.code ?? '')) ? String(request.code) : '';
  if (!title || !body) return false;

  const notification = new Notification({ title, body, silent: false });
  const owner = BrowserWindow.fromWebContents(event.sender);
  notification.on('click', () => {
    if (!owner || owner.isDestroyed()) return;
    if (owner.isMinimized()) owner.restore();
    owner.show();
    owner.focus();
    owner.webContents.send('notification:clicked', { code });
  });
  notification.show();
  return true;
});

function sanitizeNotificationText(value, maxLength) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
}

function requestTextBuffer(target, options) {
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'http:' ? http : https;
    const req = client.get(
      target,
      {
        timeout: options.timeout,
        headers: options.headers
      },
      (res) => {
        const chunks = [];

        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextTarget = new URL(res.headers.location, target);
          res.resume();
          if (!options.validateRedirect(nextTarget)) {
            reject(new Error(`Blocked redirect host: ${nextTarget.hostname}`));
            return;
          }

          resolve(requestTextBuffer(nextTarget, options));
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Text request failed: ${res.statusCode}`));
          return;
        }

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Text request timed out'));
    });
    req.on('error', reject);
  });
}

function isAllowedMarketTarget(target) {
  return target.protocol === 'https:' && allowedMarketHosts.has(target.hostname);
}

function marketRefererFor(hostname) {
  if (hostname.endsWith('gtimg.cn')) {
    return 'https://gu.qq.com/';
  }

  if (hostname.endsWith('sina.cn') || hostname.endsWith('sinajs.cn') || hostname.endsWith('sina.com.cn')) {
    return 'https://finance.sina.com.cn/';
  }

  return 'https://quote.eastmoney.com/';
}

function resolveRsshubBaseUrl(value) {
  try {
    const target = new URL(value);
    if (target.protocol === 'https:' || target.protocol === 'http:') {
      return target;
    }
  } catch {
    // Fall through to the public RSSHub base.
  }

  return new URL('https://rsshub.app');
}

function isSafeNewsRoute(route) {
  return route.startsWith('/') && !route.startsWith('//') && !route.includes('\\') && !route.includes('\n') && !route.includes('\r');
}

function isSafeNewsTargetText(value) {
  if (isSafeNewsRoute(value)) {
    return true;
  }

  try {
    const target = new URL(value);
    return isAllowedNewsTarget(target);
  } catch {
    return false;
  }
}

function buildNewsUrl(value) {
  if (isSafeNewsRoute(value)) {
    return buildRsshubUrl(value);
  }

  return new URL(value);
}

function buildRsshubUrl(route) {
  const basePath = rsshubBaseUrl.pathname === '/' ? '' : rsshubBaseUrl.pathname.replace(/\/$/, '');
  return new URL(`${basePath}${route}`, rsshubBaseUrl.origin);
}

function isAllowedNewsTarget(target) {
  const basePath = rsshubBaseUrl.pathname === '/' ? '/' : rsshubBaseUrl.pathname.replace(/\/$/, '/');
  const isRsshubTarget = target.origin === rsshubBaseUrl.origin && target.pathname.startsWith(basePath);
  const isDirectNewsTarget = target.protocol === 'https:' && allowedNewsHosts.has(target.hostname);
  return isRsshubTarget || isDirectNewsTarget;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#101214',
    title: 'BigA Monitor',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL(devServerUrl);
    if (process.env.BIGA_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
