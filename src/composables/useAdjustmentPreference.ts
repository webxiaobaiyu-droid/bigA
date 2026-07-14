import { ref, watch } from 'vue';
import type { AdjustmentMode } from '@/types/market';
import { getBrowserStorage } from '@/utils/browserStorage';

export const ADJUSTMENT_STORAGE_KEY = 'biga.adjustment.v1';

export function useAdjustmentPreference(storage = getBrowserStorage()) {
  const adjustmentMode = ref<AdjustmentMode>(loadAdjustmentMode(storage));

  watch(adjustmentMode, (value) => {
    if (!storage) return;
    try {
      storage.setItem(ADJUSTMENT_STORAGE_KEY, value);
    } catch {
      // Keep the in-memory preference when persistence is unavailable.
    }
  });

  return { adjustmentMode };
}

function loadAdjustmentMode(storage: Storage | null): AdjustmentMode {
  if (!storage) return 'forward';
  try {
    const value = storage.getItem(ADJUSTMENT_STORAGE_KEY);
    if (value === 'none' || value === 'forward' || value === 'backward') return value;
  } catch {
    // Local storage may be unavailable in a restricted renderer.
  }
  return 'forward';
}
