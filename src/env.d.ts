/// <reference types="vite/client" />

interface Window {
  bigA?: {
    platform: NodeJS.Platform;
    versions: {
      chrome: string;
      electron: string;
      node: string;
    };
    fetchMarketText?: (url: string, encoding?: string) => Promise<string>;
    fetchNewsText?: (route: string) => Promise<string>;
    showNotification?: (request: { title: string; body: string; code: string }) => Promise<boolean>;
    onNotificationClick?: (callback: (payload: { code: string }) => void) => () => void;
  };
}
