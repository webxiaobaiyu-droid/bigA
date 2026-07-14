import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchAshareNews, fetchNewsDetail, NEWS_FILTERS } from '@/services/newsProvider';
import type { NewsItem } from '@/types/news';
import type { NewsFilterKey } from '@/types/workspace';
import { formatNewsTime } from '@/utils/marketFormatters';

const NEWS_REFRESH_INTERVAL_MS = 90_000;

export function useNewsFeed() {
  const newsItems = ref<NewsItem[]>([]);
  const newsFilter = ref<NewsFilterKey>('all');
  const newsLoading = ref(false);
  const newsStatus = ref('待连接');
  const newsLoadedAt = ref<number | null>(null);
  const selectedNews = ref<NewsItem | null>(null);
  const newsDetails = ref<Record<string, string[]>>({});
  const newsDetailLoadingId = ref('');
  let newsTimer: number | undefined;

  const newsFilters = NEWS_FILTERS;
  const visibleNews = computed(() => (
    newsFilter.value === 'all'
      ? newsItems.value
      : newsItems.value.filter((item) => item.source === newsFilter.value)
  ));
  const newsEmptyLabel = computed(() => (
    newsLoading.value
      ? '同步新闻中'
      : newsLoadedAt.value
        ? '新闻源暂无返回'
        : '暂无新闻'
  ));
  const selectedNewsDetailLoading = computed(() => Boolean(
    selectedNews.value && newsDetailLoadingId.value === selectedNews.value.id
  ));
  const selectedNewsParagraphs = computed(() => {
    if (!selectedNews.value) {
      return [];
    }

    const cached = newsDetails.value[selectedNews.value.id];
    if (cached?.length) {
      return cached;
    }

    return (selectedNews.value.summary || selectedNews.value.title)
      .split(/(?<=。|！|？|；)\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
  });

  async function refreshNews() {
    if (newsLoading.value) {
      return;
    }

    newsLoading.value = true;

    try {
      const result = await fetchAshareNews();
      newsItems.value = result.items;
      newsLoadedAt.value = result.fetchedAt;

      if (result.sourceLabels.length) {
        newsStatus.value = `${result.sourceLabels.join(' / ')} · ${formatNewsTime(result.fetchedAt)}`;
      } else if (result.failedLabels.length) {
        newsStatus.value = '新闻源暂不可用';
      } else {
        newsStatus.value = '新闻源暂无返回';
      }
    } catch {
      newsStatus.value = '新闻源暂不可用';
    } finally {
      newsLoading.value = false;
    }
  }

  async function loadNewsDetail(item: NewsItem) {
    if (newsDetails.value[item.id]?.length || newsDetailLoadingId.value === item.id) {
      return;
    }

    newsDetailLoadingId.value = item.id;

    try {
      const paragraphs = await fetchNewsDetail(item);
      newsDetails.value = {
        ...newsDetails.value,
        [item.id]: paragraphs
      };
    } finally {
      if (newsDetailLoadingId.value === item.id) {
        newsDetailLoadingId.value = '';
      }
    }
  }

  function openNews(item: NewsItem) {
    selectedNews.value = item;
    void loadNewsDetail(item);
  }

  onMounted(() => {
    void refreshNews();
    newsTimer = window.setInterval(() => void refreshNews(), NEWS_REFRESH_INTERVAL_MS);
  });

  onBeforeUnmount(() => {
    if (newsTimer) {
      window.clearInterval(newsTimer);
    }
  });

  return {
    newsFilters,
    newsItems,
    newsFilter,
    newsLoading,
    newsStatus,
    selectedNews,
    visibleNews,
    newsEmptyLabel,
    selectedNewsParagraphs,
    selectedNewsDetailLoading,
    refreshNews,
    openNews
  };
}
