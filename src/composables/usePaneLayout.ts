import { ref } from 'vue';
import { getBrowserStorage } from '@/utils/browserStorage';

export const PANE_LAYOUT_STORAGE_KEY = 'biga.pane-layout.v1';

interface PaneLayoutState {
  left: boolean;
  right: boolean;
}

export function usePaneLayout(storage = getBrowserStorage()) {
  const initial = loadPaneLayout(storage);
  const leftPaneCollapsed = ref(initial.left);
  const rightPaneCollapsed = ref(initial.right);

  function persistPaneLayout() {
    if (!storage) return;
    try {
      storage.setItem(PANE_LAYOUT_STORAGE_KEY, JSON.stringify({
        left: leftPaneCollapsed.value,
        right: rightPaneCollapsed.value
      }));
    } catch {
      // Keep the current session layout when renderer storage is unavailable.
    }
  }

  function toggleLeftPane() {
    leftPaneCollapsed.value = !leftPaneCollapsed.value;
    persistPaneLayout();
  }

  function toggleRightPane() {
    rightPaneCollapsed.value = !rightPaneCollapsed.value;
    persistPaneLayout();
  }

  return {
    leftPaneCollapsed,
    rightPaneCollapsed,
    toggleLeftPane,
    toggleRightPane,
    persistPaneLayout
  };
}

function loadPaneLayout(storage: Storage | null): PaneLayoutState {
  if (!storage) return { left: false, right: false };
  try {
    const raw = storage.getItem(PANE_LAYOUT_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) as { left?: unknown; right?: unknown } : null;
    return {
      left: value?.left === true,
      right: value?.right === true
    };
  } catch {
    return { left: false, right: false };
  }
}
