import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });

try {
  const appearance = await server.ssrLoadModule('/src/services/appearance.ts');
  assert.deepEqual(appearance.normalizeAppearance(null), { mode: 'dark', theme: 'amber' }, '无配置时使用深色金融金');
  assert.deepEqual(appearance.normalizeAppearance({ mode: 'light', theme: 'azure' }), { mode: 'light', theme: 'azure' }, '有效配置保持不变');
  assert.deepEqual(appearance.normalizeAppearance({ mode: 'unknown', theme: 'unknown' }), { mode: 'dark', theme: 'amber' }, '无效配置回退默认');
  assert.deepEqual(appearance.APPEARANCE_THEMES.map((item) => item.key), ['amber', 'azure', 'jade', 'crimson'], '内置四套主题');

  const css = await readFile(path.join(root, 'src/styles.css'), 'utf8');
  assert.match(css, /:root\[data-mode='light'\]/, '存在浅色模式变量');
  for (const key of ['azure', 'jade', 'crimson']) assert.match(css, new RegExp(`data-theme='${key}'`), `${key} 主题变量存在`);
  assert.doesNotMatch(css, /--([a-z-]+):\s*var\(--\1\)/, '主题变量不能循环引用自身');
  console.log('Appearance validation passed: defaults, four themes, light mode and CSS variable integrity.');
} finally {
  await server.close();
}
