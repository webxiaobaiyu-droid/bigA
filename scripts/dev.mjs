import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultPort = Number(process.env.BIGA_DEV_PORT || 6173);

const port = await findAvailablePort(defaultPort);
const viteServer = await createServer({
  root,
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true
  }
});

await viteServer.listen();

const devUrl = viteServer.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${port}/`;
viteServer.printUrls();
console.log(`\n  Electron will load: ${devUrl}`);

const electronBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
let electronProcess = startElectron();
let isShuttingDown = false;
let isRestartingElectron = false;
let restartTimer;

const electronWatcher = watch(path.join(root, 'electron'), { recursive: true }, (_eventType, filename) => {
  if (!filename || !/\.(cjs|js|mjs|json)$/.test(filename)) {
    return;
  }

  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartElectron(filename);
  }, 120);
});

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

function startElectron() {
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      BIGA_DEV_SERVER_URL: devUrl
    }
  });

  child.on('exit', async (code, signal) => {
    if (isRestartingElectron || isShuttingDown) {
      return;
    }

    await shutdown(code ?? (signal ? 1 : 0));
  });

  return child;
}

function restartElectron(filename) {
  if (isShuttingDown) {
    return;
  }

  console.log(`\n  Electron reload: ${filename}`);
  isRestartingElectron = true;
  electronProcess.once('exit', () => {
    isRestartingElectron = false;
    electronProcess = startElectron();
  });
  electronProcess.kill('SIGTERM');
}

async function findAvailablePort(startPort) {
  for (let nextPort = startPort; nextPort < startPort + 100; nextPort += 1) {
    if (await isPortAvailable(nextPort)) {
      return nextPort;
    }
  }

  throw new Error(`No available port found from ${startPort} to ${startPort + 99}`);
}

function isPortAvailable(portToCheck) {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => {
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(portToCheck, '127.0.0.1');
  });
}

async function shutdown(exitCode) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  electronWatcher.close();
  clearTimeout(restartTimer);
  electronProcess.kill('SIGTERM');
  await viteServer.close();
  process.exit(exitCode);
}
