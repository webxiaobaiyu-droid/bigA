<template>
  <div class="workspace-modal-backdrop" @click.self="emit('close')">
    <section class="workspace-modal appearance-settings" role="dialog" aria-modal="true" aria-label="界面外观">
      <header class="workspace-modal-header">
        <div><strong>界面外观</strong><span>颜色模式与终端主题</span></div>
        <button class="icon-button" type="button" title="关闭" @click="emit('close')"><X :size="16" /></button>
      </header>

      <div class="appearance-body">
        <section class="appearance-section">
          <div class="appearance-section-title"><strong>颜色模式</strong><span>独立于涨跌颜色</span></div>
          <div class="appearance-mode-switch">
            <button type="button" :class="{ active: modelValue.mode === 'dark' }" @click="updateMode('dark')"><Moon :size="17" /><span><strong>深色</strong><em>低光环境与长时间监盘</em></span><Check v-if="modelValue.mode === 'dark'" :size="15" /></button>
            <button type="button" :class="{ active: modelValue.mode === 'light' }" @click="updateMode('light')"><Sun :size="17" /><span><strong>浅色</strong><em>日间环境与高亮屏幕</em></span><Check v-if="modelValue.mode === 'light'" :size="15" /></button>
          </div>
        </section>

        <section class="appearance-section">
          <div class="appearance-section-title"><strong>终端主题</strong><span>强调色与信息层级</span></div>
          <div class="appearance-theme-grid">
            <button v-for="item in themes" :key="item.key" type="button" class="appearance-theme-option" :class="{ active: modelValue.theme === item.key }" @click="updateTheme(item.key)">
              <span class="theme-swatches"><i :style="{ background: item.color }" /><i :style="{ background: item.bright }" /><i :style="{ background: item.companion }" /></span>
              <span class="theme-copy"><strong>{{ item.name }}</strong><em>{{ item.description }}</em></span>
              <Check v-if="modelValue.theme === item.key" :size="15" />
            </button>
          </div>
        </section>

        <section class="appearance-preview">
          <div class="preview-header"><span>BigA</span><strong>{{ currentTheme.name }} · {{ modelValue.mode === 'dark' ? '深色' : '浅色' }}</strong></div>
          <div class="preview-market"><div><span>上证指数</span><strong class="up">+1.26%</strong></div><div><span>创业板指</span><strong class="down">-0.84%</strong></div><div><span>市场温度</span><strong class="appearance-accent">68</strong></div></div>
          <div class="preview-bars"><i /><i /><i /><i /><i /></div>
        </section>
      </div>

      <footer class="workspace-modal-footer"><span>A 股涨红跌绿保持固定，主题只改变界面强调色</span><button class="command-button" type="button" @click="reset"><RotateCcw :size="13" />恢复默认</button></footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check, Moon, RotateCcw, Sun, X } from '@lucide/vue';
import { APPEARANCE_THEMES, DEFAULT_APPEARANCE, type AppearanceMode, type AppearanceSettings, type AppearanceTheme } from '@/services/appearance';

const props = defineProps<{ modelValue: AppearanceSettings }>();
const emit = defineEmits<{ 'update:modelValue': [value: AppearanceSettings]; close: [] }>();
const themes = APPEARANCE_THEMES;
const currentTheme = computed(() => themes.find((item) => item.key === props.modelValue.theme) ?? themes[0]);
function updateMode(mode: AppearanceMode) { emit('update:modelValue', { ...props.modelValue, mode }); }
function updateTheme(theme: AppearanceTheme) { emit('update:modelValue', { ...props.modelValue, theme }); }
function reset() { emit('update:modelValue', { ...DEFAULT_APPEARANCE }); }
</script>

<style scoped>
.appearance-settings { width: min(760px, calc(100vw - 72px)); height: min(650px, calc(100vh - 72px)); grid-template-rows: 52px minmax(0, 1fr) 48px; }
.appearance-body { min-width: 0; min-height: 0; overflow-y: auto; padding: 18px; }
.appearance-section + .appearance-section { margin-top: 22px; }
.appearance-section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.appearance-section-title strong { color: var(--text-primary); font-size: 12px; }.appearance-section-title span { color: var(--text-muted); font-size: 9px; }
.appearance-mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.appearance-mode-switch button, .appearance-theme-option { min-width: 0; display: grid; align-items: center; border: 1px solid var(--border-subtle); border-radius: 7px; background: var(--bg-elevated); color: var(--text-muted); text-align: left; cursor: pointer; }
.appearance-mode-switch button { min-height: 64px; grid-template-columns: 22px minmax(0, 1fr) 18px; gap: 10px; padding: 0 13px; }
.appearance-mode-switch button:hover, .appearance-theme-option:hover { border-color: var(--accent-border); background: var(--bg-hover); }
.appearance-mode-switch button.active, .appearance-theme-option.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent-soft); color: var(--accent-bright); }
.appearance-mode-switch span, .theme-copy { min-width: 0; display: grid; gap: 5px; }
.appearance-mode-switch strong, .theme-copy strong { color: var(--text-primary); font-size: 11px; }.appearance-mode-switch em, .theme-copy em { overflow: hidden; color: var(--text-muted); font-size: 9px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.appearance-theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.appearance-theme-option { min-height: 68px; grid-template-columns: 48px minmax(0, 1fr) 18px; gap: 11px; padding: 0 12px; }
.theme-swatches { width: 46px; height: 30px; display: flex; align-items: center; gap: 3px; padding: 4px; border: 1px solid var(--border-subtle); border-radius: 5px; background: var(--bg-panel); }
.theme-swatches i { width: 11px; height: 20px; border-radius: 2px; }.theme-swatches i:first-child { width: 15px; }
.appearance-preview { margin-top: 22px; border: 1px solid var(--border-subtle); border-radius: 7px; overflow: hidden; background: var(--bg-panel); }
.preview-header { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; border-bottom: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 9px; }.preview-header strong { color: var(--accent-bright); }
.preview-market { display: grid; grid-template-columns: repeat(3, 1fr); }.preview-market div { min-height: 54px; display: grid; align-content: center; gap: 5px; padding: 0 12px; border-right: 1px solid var(--border-subtle); }.preview-market div:last-child { border-right: 0; }.preview-market span { color: var(--text-muted); font-size: 9px; }.preview-market strong { font-size: 14px; }
.preview-bars { height: 44px; display: flex; align-items: end; gap: 5px; padding: 8px 12px; border-top: 1px solid var(--border-subtle); }.preview-bars i { width: 18%; height: 45%; border-radius: 2px 2px 0 0; background: var(--accent-soft); }.preview-bars i:nth-child(2) { height: 80%; background: var(--accent); }.preview-bars i:nth-child(3) { height: 60%; }.preview-bars i:nth-child(4) { height: 95%; background: var(--accent-bright); }.preview-bars i:nth-child(5) { height: 70%; }
.appearance-accent { color: var(--accent-bright); }
.workspace-modal-footer { justify-content: space-between; }
</style>
