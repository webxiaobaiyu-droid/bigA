<template>
  <section class="stock-info-panel">
    <div class="stock-info-header">
      <div class="stock-info-title">
        <Database :size="14" />
        <strong>个股资料</strong>
        <span>{{ meta.name }}</span>
      </div>
      <div class="mini-tabs stock-info-tabs">
        <button v-for="item in STOCK_INFO_TABS" :key="item.key" type="button" :class="{ active: tab === item.key }" @click="emit('update:tab', item.key)">
          {{ item.label }}
        </button>
      </div>
      <button class="icon-button mini" :class="{ active: loading }" type="button" :title="`刷新${tabLabel}`" @click="emit('refresh')">
        <RefreshCw :size="13" />
      </button>
    </div>

    <div class="stock-info-body">
      <div v-if="loading && !hasData" class="stock-info-state">
        <RefreshCw :size="16" class="spin" />
        <span>同步{{ tabLabel }}中</span>
      </div>
      <div v-else-if="error" class="stock-info-state error">
        <span>{{ error }}</span>
      </div>

      <div v-else-if="tab === 'news'" class="stock-news-list">
        <button v-for="item in news" :key="item.id" type="button" @click="emit('open-news', item)">
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.summary }}</p>
          </div>
          <span>{{ item.sourceLabel }} · {{ formatNewsTime(item.publishedAt) }}</span>
        </button>
        <div v-if="!news.length" class="stock-info-state">暂无相关资讯</div>
      </div>

      <div v-else-if="tab === 'finance'" class="finance-view">
        <FinanceTrendChart v-if="financialReports.length" :reports="financialReports" />
        <div v-if="financialReports.length" class="finance-table-wrap">
          <div class="finance-table">
            <div class="finance-table-row head"><span>报告期</span><span>营收</span><span>营收同比</span><span>归母净利</span><span>净利同比</span><span>ROE</span><span>负债率</span></div>
            <div v-for="report in financialReports" :key="report.reportDate" class="finance-table-row">
              <strong>{{ report.reportName }}</strong>
              <span>{{ formatFinancialAmount(report.revenue) }}</span>
              <span :class="priceClass(report.revenueGrowth)">{{ formatFinancialPct(report.revenueGrowth) }}</span>
              <span>{{ formatFinancialAmount(report.netProfit) }}</span>
              <span :class="priceClass(report.netProfitGrowth)">{{ formatFinancialPct(report.netProfitGrowth) }}</span>
              <span>{{ formatFinancialPct(report.roe, false) }}</span>
              <span>{{ formatFinancialPct(report.debtRatio, false) }}</span>
            </div>
          </div>
        </div>
        <div v-if="!financialReports.length" class="stock-info-state">暂无财务数据</div>
      </div>

      <div v-else-if="tab === 'company' && companyProfile" class="company-view">
        <div class="company-facts">
          <div><span>公司全称</span><strong>{{ companyProfile.fullName || '--' }}</strong></div>
          <div><span>所属行业</span><strong>{{ companyProfile.industry || meta.sector }}</strong></div>
          <div><span>上市日期</span><strong>{{ companyProfile.listingDate || '--' }}</strong></div>
          <div><span>董事长</span><strong>{{ companyProfile.chairman || '--' }}</strong></div>
          <div><span>实际控制人</span><strong>{{ companyProfile.actualController || '--' }}</strong></div>
          <div><span>员工人数</span><strong>{{ formatInteger(companyProfile.employees) }}</strong></div>
          <div><span>注册资本</span><strong>{{ formatRegisteredCapital(companyProfile.registeredCapital) }}</strong></div>
          <div><span>公司网站</span><strong>{{ companyProfile.website || '--' }}</strong></div>
        </div>
        <div class="company-narrative">
          <div><span>主营业务</span><strong>{{ companyProfile.mainBusiness || '--' }}</strong></div>
          <p>{{ companyProfile.profile || companyProfile.businessScope || '暂无公司简介' }}</p>
        </div>
      </div>
      <div v-else-if="tab === 'company'" class="stock-info-state">暂无公司资料</div>

      <div v-else class="announcement-list">
        <div v-for="item in announcements" :key="item.id">
          <span>{{ formatInfoDate(item.publishedAt) }}</span>
          <strong>{{ item.title }}</strong>
          <em>{{ item.category }}</em>
        </div>
        <div v-if="!announcements.length" class="stock-info-state">暂无公司公告</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { Database, RefreshCw } from '@lucide/vue';
import { STOCK_INFO_TABS } from '@/constants/marketOptions';
import type { StockMeta } from '@/types/market';
import type { NewsItem } from '@/types/news';
import type { StockAnnouncement, StockCompanyProfile, StockFinancialReport } from '@/types/stockInfo';
import type { StockInfoTab } from '@/types/workspace';
import {
  formatFinancialAmount,
  formatFinancialPct,
  formatInfoDate,
  formatInteger,
  formatNewsTime,
  formatRegisteredCapital,
  priceClass
} from '@/utils/marketFormatters';

const FinanceTrendChart = defineAsyncComponent(() => import('@/components/FinanceTrendChart.vue'));

const props = defineProps<{
  meta: StockMeta;
  tab: StockInfoTab;
  loading: boolean;
  hasData: boolean;
  error: string;
  news: NewsItem[];
  financialReports: StockFinancialReport[];
  companyProfile: StockCompanyProfile | null;
  announcements: StockAnnouncement[];
}>();

const emit = defineEmits<{
  'update:tab': [value: StockInfoTab];
  refresh: [];
  'open-news': [item: NewsItem];
}>();

const tabLabel = computed(() => STOCK_INFO_TABS.find((item) => item.key === props.tab)?.label ?? '个股资料');
</script>
