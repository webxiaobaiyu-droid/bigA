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

  const css = await readCssBundle(path.join(root, 'src/styles.css'));
  assert.match(css, /:root\[data-mode='light'\]/, '存在浅色模式变量');
  for (const key of ['azure', 'jade', 'crimson']) assert.match(css, new RegExp(`data-theme='${key}'`), `${key} 主题变量存在`);
  assert.doesNotMatch(css, /--([a-z-]+):\s*var\(--\1\)/, '主题变量不能循环引用自身');
  console.log('Appearance validation passed: defaults, four themes, light mode and CSS variable integrity.');
} finally {
  await server.close();
}

async function readCssBundle(file, seen = new Set()) {
  const resolved = path.resolve(file);
  if (seen.has(resolved)) return '';
  seen.add(resolved);

  const source = await readFile(resolved, 'utf8');
  const imports = [...source.matchAll(/@import\s+['"]([^'"]+\.css)['"]\s*;/g)];
  const dependencies = await Promise.all(imports.map((match) => readCssBundle(path.resolve(path.dirname(resolved), match[1]), seen)));
  return `${source}\n${dependencies.join('\n')}`;
}
