<template>
  <div class="app-shell" :class="{ 'is-mac': isMac }">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">A</span>
        <div>
          <strong>BigA</strong>
          <span>监盘终端</span>
        </div>
      </div>

      <div class="market-chip" :class="[marketPhase.type, marketDataHealth.state]" :title="marketDataHealth.detail">
        <Radio :size="15" />
        <i class="data-health-dot" />
        <span>{{ marketDataHealth.label }}</span>
        <strong>{{ marketPhase.label }}</strong>
      </div>

      <nav class="top-tabs" aria-label="工作区">
        <button v-for="item in workspaceTabs" :key="item.key" type="button" :class="{ active: activeTab === item.key }" @click="activeTab = item.key">
          <component :is="item.icon" :size="15" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div v-if="hasMarketData" class="top-stat">
        <span>上涨</span>
        <strong class="up">{{ breadth.up }}</strong>
      </div>
      <div v-if="hasMarketData" class="top-stat">
        <span>下跌</span>
        <strong class="down">{{ breadth.down }}</strong>
      </div>
      <div class="top-spacer" />

      <button class="icon-button" type="button" title="数据源" @click="dataSourceHealthOpen = true">
        <Database :size="17" />
      </button>
      <button class="icon-button" type="button" title="终端设置" @click="appearanceSettingsOpen = true">
        <Settings2 :size="17" />
      </button>
    </header>

    <main v-if="activeTab === 'news'" class="tab-page news-page">
      <section class="tab-hero news-shell">
        <div class="tab-heading news-heading">
          <div class="heading-title">
            <Newspaper :size="22" />
            <strong>新闻</strong>
            <span>{{ newsStatus }}</span>
          </div>
          <div class="news-actions">
            <div v-if="!selectedNews" class="mini-tabs news-source-tabs">
              <button v-for="item in newsFilters" :key="item.key" type="button" :class="{ active: newsFilter === item.key }" @click="newsFilter = item.key">
                {{ item.label }}
              </button>
            </div>
            <button class="icon-button mini" :class="{ active: newsLoading }" type="button" title="刷新新闻" @click="refreshNews">
              <RefreshCw :size="14" />
            </button>
          </div>
        </div>
        <div v-if="selectedNews" class="news-detail-page">
          <div class="news-detail-bar">
            <button class="icon-button mini" type="button" title="返回新闻列表" @click="selectedNews = null">
              <ArrowLeft :size="14" />
            </button>
            <div>
              <span>{{ selectedNews.sourceLabel }}</span>
              <strong>{{ selectedNews.channel }}</strong>
            </div>
            <time>{{ formatNewsTime(selectedNews.publishedAt) }}</time>
          </div>
          <article class="news-detail">
            <div class="news-article-column">
              <header class="news-article-header">
                <div class="news-detail-meta">
                  <span class="news-source">{{ selectedNews.sourceLabel }}</span>
                  <span>{{ selectedNews.channel }}</span>
                  <time>{{ formatNewsTime(selectedNews.publishedAt) }}</time>
                  <em v-for="tag in selectedNews.tags" :key="tag">{{ tag }}</em>
                </div>
                <h1>{{ selectedNews.title }}</h1>
              </header>
              <div v-if="selectedNewsDetailLoading" class="news-detail-state">
                <RefreshCw :size="14" class="spin" />
                <span>正文同步中</span>
              </div>
              <div class="news-detail-body">
                <p v-for="(paragraph, index) in selectedNewsParagraphs" :key="`${selectedNews.id}-${index}`">{{ paragraph }}</p>
              </div>
            </div>
          </article>
        </div>
        <div v-else-if="newsLoading && !newsItems.length" class="tab-empty">
          <RefreshCw :size="26" class="spin" />
          <strong>同步新闻中</strong>
        </div>
        <div v-else-if="!visibleNews.length" class="tab-empty">
          <Newspaper :size="26" />
          <strong>{{ newsEmptyLabel }}</strong>
        </div>
        <div v-else class="news-list">
          <article
            v-for="item in visibleNews"
            :key="item.id"
            class="news-item"
            role="button"
            tabindex="0"
            @click="showNewsDetail(item)"
            @keydown.enter="showNewsDetail(item)"
            @keydown.space.prevent="showNewsDetail(item)"
          >
            <div class="news-meta">
              <span class="news-source">{{ item.sourceLabel }}</span>
              <span>{{ item.channel }}</span>
              <time>{{ formatNewsTime(item.publishedAt) }}</time>
              <em v-for="tag in item.tags" :key="tag">{{ tag }}</em>
            </div>
            <button class="news-title" type="button" @click.stop="showNewsDetail(item)">
              {{ item.title }}
            </button>
            <p v-if="item.summary">{{ item.summary }}</p>
          </article>
        </div>
      </section>
    </main>

    <main v-else-if="activeTab === 'sectors'" class="tab-page sector-page">
      <MarketMonitor :watch-codes="watchCodes" @select-stock="openMonitorStock" @toggle-watchlist="toggleMonitorWatchlist" />
    </main>

    <main v-else-if="activeTab === 'hotSectors'" class="tab-page sector-page">
      <section class="tab-hero sector-shell market-workbench-shell">
        <div class="tab-heading sector-heading">
          <div class="heading-title"><TrendingUp :size="20" /><strong>热门板块</strong><span>{{ sectorStatus }}</span></div>
          <div class="sector-actions">
            <div class="mini-tabs sector-tabs"><button v-for="item in sectorModeOptions" :key="item.key" type="button" :class="{ active: sectorMode === item.key }" @click="sectorMode = item.key">{{ item.label }}</button></div>
            <div class="mini-tabs sector-tabs hot-sector-tabs"><button v-for="item in hotSectorSortOptions" :key="item.key" type="button" :class="{ active: hotSectorSort === item.key }" @click="hotSectorSort = item.key">{{ item.label }}</button></div>
            <button class="icon-button mini" :class="{ active: sectorLoading }" type="button" title="刷新热门板块" @click="refreshSectors"><RefreshCw :size="14" /></button>
          </div>
        </div>

        <div v-if="sectorLoading && !sectorRows.length" class="tab-empty"><RefreshCw :size="26" class="spin" /><strong>计算板块热度中</strong></div>
        <div v-else-if="!sectorRows.length" class="tab-empty"><Layers3 :size="26" /><strong>暂无热门板块</strong></div>
        <div v-else class="market-workbench hot-sector-workbench">
          <div class="market-pulse-strip hot-pulse-strip">
            <div><span>当前主线</span><strong>{{ hotSectorStats.leader?.name || '--' }}</strong><em :class="priceClass(hotSectorStats.leader?.changePct)">{{ hotSectorStats.leader ? formatPct(hotSectorStats.leader.changePct) : '--' }}</em></div>
            <div><span>主线强度</span><strong>{{ hotSectorStats.leader ? sectorHeatScore(hotSectorStats.leader) : 0 }}</strong><em>综合热度</em></div>
            <div><span>强势板块</span><strong>{{ hotSectorStats.strongCount }}</strong><em>热度 ≥ 60</em></div>
            <div><span>涨幅活跃</span><strong>{{ hotSectorStats.activeCount }}</strong><em>涨幅 ≥ 1%</em></div>
            <div><span>前20成交</span><strong>{{ formatAmount(hotSectorStats.totalAmount) }}</strong><em>活跃方向</em></div>
          </div>

          <div class="sector-workbench-grid">
            <div class="sector-scan-table hot-sector-table">
              <div class="sector-scan-row head"><span>#</span><span>热门板块</span><span>热度</span><span>涨幅</span><span>覆盖度</span><span>龙头确认</span></div>
              <button v-for="(row, index) in hotSectorRows" :key="row.code" type="button" class="sector-scan-row" :class="{ selected: selectedSector?.code === row.code }" @click="selectSector(row)">
                <span class="rank-index hot-rank">{{ index + 1 }}</span>
                <span class="rank-name"><strong>{{ row.name }}</strong><em>{{ sectorHeatLabel(row) }} · {{ sectorPulseLabel(row) }}</em></span>
                <span class="sector-heat"><strong>{{ sectorHeatScore(row) }}</strong><i><b :style="{ width: `${sectorHeatScore(row)}%` }" /></i></span>
                <strong :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</strong>
                <span class="sector-breadth-cell"><strong>{{ sectorBreadthText(row) }}</strong><i v-if="sectorBreadthRatio(row) !== null"><b class="up-bg" :style="{ width: `${(sectorBreadthRatio(row) ?? 0) * 100}%` }" /></i></span>
                <span class="rank-leader"><strong>{{ row.leaderName }}</strong><em :class="priceClass(row.leaderChangePct)">{{ formatPct(row.leaderChangePct) }}</em></span>
              </button>
            </div>
            <SectorDetailPanel :sector="selectedSector" :stocks="selectedSectorConstituents" :loading="selectedSectorConstituentsLoading" @select-stock="openConstituentStock" />
          </div>
        </div>
      </section>
    </main>

    <main v-else-if="activeTab === 'hotStocks'" class="tab-page sector-page">
      <section class="tab-hero sector-shell">
        <div class="tab-heading sector-heading">
          <div class="heading-title">
            <TrendingUp :size="22" />
            <strong>热门股票</strong>
            <span>{{ sectorStatus }}</span>
          </div>
          <div class="sector-actions">
            <div class="mini-tabs sector-tabs">
              <button v-for="item in hotStockSortOptions" :key="item.key" type="button" :class="{ active: hotStockSort === item.key }" @click="hotStockSort = item.key">
                {{ item.label }}
              </button>
            </div>
            <button class="icon-button mini" :class="{ active: sectorLoading }" type="button" title="刷新股票" @click="refreshHotStocks">
              <RefreshCw :size="14" />
            </button>
          </div>
        </div>

        <div v-if="selectedHotStock" class="hot-stock-detail">
          <div class="hot-stock-detail-bar" :class="{ 'is-intraday': hotStockTimeframe === 'fs' }">
            <button class="icon-button mini" type="button" title="返回热门股票" @click="selectedHotStockCode = ''">
              <ArrowLeft :size="14" />
            </button>
            <div class="hot-stock-title">
              <strong>{{ selectedHotStock.name }}</strong>
              <span>{{ selectedHotStock.code }} · {{ timeframeLabel(hotStockTimeframe) }} · {{ selectedHotStockUpdatedLabel }}</span>
            </div>
            <button
              class="watchlist-toggle-button"
              :class="{ active: isWatchlisted(selectedHotStock.code) }"
              type="button"
              :title="isWatchlisted(selectedHotStock.code) ? '从自选股移除' : '加入自选股'"
              @click="toggleHotStockWatchlist(selectedHotStock)"
            >
              <Star :size="13" :fill="isWatchlisted(selectedHotStock.code) ? 'currentColor' : 'none'" />
              <span>{{ isWatchlisted(selectedHotStock.code) ? '删自选' : '加自选' }}</span>
            </button>
            <div class="segmented hot-stock-timeframes">
              <button v-for="item in timeframeOptions" :key="item.key" type="button" :class="{ active: hotStockTimeframe === item.key }" @click="hotStockTimeframe = item.key">
                {{ item.label }}
              </button>
            </div>
            <div v-if="hotStockTimeframe !== 'fs'" class="mini-tabs adjustment-tabs" aria-label="复权方式">
              <button v-for="item in adjustmentOptions" :key="item.key" type="button" :class="{ active: adjustmentMode === item.key }" @click="adjustmentMode = item.key">{{ item.label }}</button>
            </div>
            <button class="icon-button mini" type="button" :title="`刷新${timeframeLabel(hotStockTimeframe)}`" @click="reloadHotStockCandles(selectedHotStock.code)">
              <RefreshCw :size="14" />
            </button>
            <div class="hot-stock-price">
              <strong :class="priceClass(selectedHotStock.changePct)">{{ formatPrice(selectedHotStock.price) }}</strong>
              <span :class="priceClass(selectedHotStock.changePct)">{{ formatPct(selectedHotStock.changePct) }}</span>
            </div>
          </div>

          <div class="hot-stock-metrics">
            <div>
              <span>今开</span>
              <strong>{{ formatPrice(selectedHotStock.open) }}</strong>
            </div>
            <div>
              <span>最高</span>
              <strong class="up">{{ formatPrice(selectedHotStock.high) }}</strong>
            </div>
            <div>
              <span>最低</span>
              <strong class="down">{{ formatPrice(selectedHotStock.low) }}</strong>
            </div>
            <div>
              <span>均价</span>
              <strong>{{ formatPrice(selectedHotStockAverage) }}</strong>
            </div>
            <div>
              <span>换手</span>
              <strong>{{ selectedHotStock.turnoverRate.toFixed(2) }}%</strong>
            </div>
            <div>
              <span>量比</span>
              <strong>{{ selectedHotStock.volumeRatio.toFixed(2) }}</strong>
            </div>
            <div>
              <span>振幅</span>
              <strong>{{ selectedHotStock.amplitude.toFixed(2) }}%</strong>
            </div>
            <div>
              <span>主力净比</span>
              <strong :class="priceClass(selectedHotStock.mainNetInflowPct)">{{ formatPct(selectedHotStock.mainNetInflowPct) }}</strong>
            </div>
            <div>
              <span>成交额</span>
              <strong>{{ formatAmount(selectedHotStock.amount) }}</strong>
            </div>
            <div>
              <span>流通值</span>
              <strong>{{ formatAmount(selectedHotStock.floatMarketCap) }}</strong>
            </div>
            <div>
              <span>总市值</span>
              <strong>{{ formatAmount(selectedHotStock.marketCap) }}</strong>
            </div>
            <div>
              <span>PE</span>
              <strong>{{ formatNullable(selectedHotStock.pe, 1) }}</strong>
            </div>
          </div>

          <section class="hot-stock-chart">
            <div v-if="hotStockCandlesLoading && !selectedHotStockCandles.length" class="tab-empty compact">
              <RefreshCw :size="22" class="spin" />
              <strong>同步{{ timeframeLabel(hotStockTimeframe) }}中</strong>
            </div>
            <div v-else-if="!selectedHotStockCandles.length" class="tab-empty compact">
              <TrendingDown :size="22" />
              <strong>暂无{{ timeframeLabel(hotStockTimeframe) }}数据</strong>
            </div>
            <KLineChart
              v-else
              :key="`${selectedHotStock.code}-${candleVariantKey(hotStockTimeframe, adjustmentMode)}`"
              :candles="selectedHotStockCandles"
              :mode="hotStockChartMode"
              :show-ma="hotStockTimeframe !== 'fs'"
              :show-volume="true"
              :reference-price="selectedHotStock.prevClose"
              :price-limit-pct="stockLimitPct(selectedHotStock.code, selectedHotStock.name)"
            />
          </section>
        </div>
        <div v-else-if="sectorLoading && !hotStockRows.length" class="tab-empty">
          <RefreshCw :size="26" class="spin" />
          <strong>同步股票中</strong>
        </div>
        <div v-else-if="!hotStockRows.length" class="tab-empty">
          <TrendingUp :size="26" />
          <strong>暂无热门股票</strong>
        </div>
        <div v-else class="hot-stock-board">
          <div class="market-pulse-strip hot-stock-pulse">
            <div><span>热度领跑</span><strong>{{ hotStockStats.leader?.name || '--' }}</strong><em :class="priceClass(hotStockStats.leader?.changePct)">{{ hotStockStats.leader ? formatPct(hotStockStats.leader.changePct) : '--' }}</em></div>
            <div><span>高活跃股票</span><strong>{{ hotStockStats.strongCount }}</strong><em>综合热度 ≥ 60</em></div>
            <div><span>高换手股票</span><strong>{{ hotStockStats.highTurnoverCount }}</strong><em>换手率 ≥ 10%</em></div>
            <div><span>平均换手</span><strong>{{ hotStockStats.averageTurnover.toFixed(2) }}%</strong><em>{{ hotStockRows.length }} 只样本</em></div>
            <div><span>样本成交</span><strong>{{ formatAmount(hotStockStats.totalAmount) }}</strong><em>当前样本排行</em></div>
          </div>

          <div class="hot-stock-scan-table">
            <div class="hot-stock-scan-row head"><span>#</span><span>股票 / 状态</span><span>热度</span><span>现价</span><span>涨幅</span><span>换手 / 量比</span><span>成交额</span><span>振幅</span></div>
            <button v-for="(row, index) in displayHotStockRows" :key="row.code" type="button" class="hot-stock-scan-row" :class="{ selected: selectedHotStockCode === row.code }" @click="showHotStockDetail(row)">
              <span class="rank-index hot-rank">{{ index + 1 }}</span>
              <span class="rank-name"><strong>{{ row.name }}</strong><em>{{ row.code }} · {{ hotStockHeatLabel(row) }}</em></span>
              <span class="stock-heat"><strong>{{ hotStockHeatScore(row) }}</strong><i><b :style="{ width: `${hotStockHeatScore(row)}%` }" /></i></span>
              <strong>{{ formatPrice(row.price) }}</strong>
              <strong :class="priceClass(row.changePct)">{{ formatPct(row.changePct) }}</strong>
              <span class="stock-activity"><strong>{{ row.turnoverRate.toFixed(1) }}%</strong><em>量比 {{ row.volumeRatio > 0 ? row.volumeRatio.toFixed(2) : '--' }}</em></span>
              <span>{{ formatAmount(row.amount) }}</span>
              <span>{{ row.amplitude.toFixed(2) }}%</span>
            </button>
          </div>
        </div>
      </section>
    </main>

    <main v-else-if="activeTab === 'knowledge'" class="tab-page knowledge-page">
      <TradingKnowledge />
    </main>

    <div v-else class="workspace" :class="{ 'no-detail': !selected, 'left-collapsed': leftPaneCollapsed, 'right-collapsed': rightPaneCollapsed }">
      <aside class="watch-pane" :class="{ collapsed: leftPaneCollapsed }">
        <button v-if="leftPaneCollapsed" class="icon-button pane-restore-button" type="button" title="展开自选池" @click="toggleLeftPane">
          <PanelLeftOpen :size="17" />
        </button>
        <template v-else>
        <div class="pane-title">
          <div>
            <span>自选池</span>
            <strong>{{ watchMetas.length }}</strong>
          </div>
          <div class="pane-title-actions">
            <button class="icon-button alert-center-button" type="button" title="提醒中心" @click="openAlertCenter()">
              <Bell :size="16" />
              <i v-if="unreadAlertCount">{{ unreadAlertCount > 99 ? '99+' : unreadAlertCount }}</i>
            </button>
            <button class="icon-button" type="button" title="管理自选股" @click="watchManagerOpen = true">
              <ListFilter :size="16" />
            </button>
            <button class="icon-button" type="button" title="收起自选池" @click="toggleLeftPane">
              <PanelLeftClose :size="16" />
            </button>
          </div>
        </div>

        <label class="search-box">
          <Search :size="16" />
          <input v-model.trim="query" type="search" placeholder="输入代码、名称或拼音" @keydown.enter.prevent="addFirstCandidate" />
          <RefreshCw v-if="searchLoading" :size="13" class="spin" />
        </label>

        <div v-if="query" class="candidate-panel">
          <div v-if="searchLoading" class="candidate-state">正在查询沪深北 A 股</div>
          <div v-else-if="searchError" class="candidate-state error">{{ searchError }}</div>
          <div v-else-if="!candidateRows.length" class="candidate-state">没有可添加的股票</div>
          <div v-else class="candidate-list">
            <button v-for="item in candidateRows" :key="item.code" type="button" @click="addStock(item)">
              <span>{{ item.code }}</span>
              <strong>{{ item.name }}</strong>
              <em>{{ item.market }}</em>
              <Plus :size="14" />
            </button>
          </div>
        </div>

        <div class="watch-group-tabs" aria-label="自选分组">
          <button type="button" :class="{ active: activeWatchGroupId === 'all' }" @click="selectWatchGroup('all')">全部 <strong>{{ watchMetas.length }}</strong></button>
          <button v-for="group in watchGroups" :key="group.id" type="button" :class="{ active: activeWatchGroupId === group.id }" @click="selectWatchGroup(group.id)">
            <i :style="{ background: group.color }" />{{ group.name }} <strong>{{ watchOrganization.entries.filter((entry) => entry.groupId === group.id).length }}</strong>
          </button>
        </div>

        <div class="segmented">
          <button v-for="item in sortOptions" :key="item.key" type="button" :class="{ active: sortKey === item.key }" @click="sortKey = item.key">
            {{ item.label }}
          </button>
        </div>

        <div class="watch-list">
          <div v-if="!watchRows.length" class="empty-list">
            <Database :size="22" />
            <strong>暂无自选</strong>
            <span>通过上方搜索添加股票</span>
          </div>

          <div
            v-for="row in watchRows"
            :key="row.meta.code"
            class="quote-row"
            :class="{ selected: selected?.meta.code === row.meta.code }"
            :draggable="sortKey === 'custom'"
            role="button"
            tabindex="0"
            @click="selectedCode = row.meta.code"
            @keydown.enter="selectedCode = row.meta.code"
            @keydown.space.prevent="selectedCode = row.meta.code"
            @dragstart="startWatchDrag(row.meta.code)"
            @dragend="draggedWatchCode = ''"
            @dragover.prevent
            @drop="dropWatchRow(row.meta.code)"
          >
            <div class="quote-name">
              <strong>{{ row.meta.name }}</strong>
              <span>{{ row.meta.code }} · {{ row.meta.sector }}</span>
            </div>
            <div class="quote-price">
              <strong :class="priceClass(row.quote.changePct)">{{ formatPrice(row.quote.price) }}</strong>
              <span :class="priceClass(row.quote.changePct)">{{ formatPct(row.quote.changePct) }}</span>
            </div>
            <div class="quote-tags">
              <span v-if="latestAlertByCode.get(row.meta.code)" class="alert-tag">{{ latestAlertByCode.get(row.meta.code)?.ruleName }} · {{ formatAlertAge(latestAlertByCode.get(row.meta.code)?.occurredAt ?? 0) }}</span>
              <span v-for="tag in (watchEntryByCode.get(row.meta.code)?.tags ?? []).slice(0, 2)" :key="`tag-${tag}`" class="local-tag">{{ tag }}</span>
              <span v-for="signal in row.signals.filter((item) => item.active).slice(0, 2)" :key="signal.id" :class="signal.tone">
                {{ signal.label }}
              </span>
            </div>
            <button class="row-close" type="button" title="移出自选" @click.stop="removeStock(row.meta.code)">
              <X :size="13" />
            </button>
          </div>
        </div>
        </template>
      </aside>

      <main v-if="selected" class="chart-pane" :class="{ 'finance-expanded': stockInfoTab === 'finance' }">
        <section class="instrument-bar">
          <div class="instrument-title">
            <div class="market-badge">{{ selected.meta.market }}</div>
            <div>
              <h1>{{ selected.meta.name }}</h1>
              <span>{{ selected.meta.code }} · {{ selected.meta.sector }} · {{ selected.indicators.trendLabel }}</span>
            </div>
            <button class="icon-button instrument-watch-button active" type="button" title="从自选股移除" @click="removeStock(selected.meta.code)">
              <Star :size="15" fill="currentColor" />
            </button>
          </div>

          <div class="instrument-price">
            <strong :class="priceClass(selected.quote.changePct)">{{ formatPrice(selected.quote.price) }}</strong>
            <span :class="priceClass(selected.quote.changePct)">
              {{ formatSigned(selected.quote.change) }} / {{ formatPct(selected.quote.changePct) }}
            </span>
          </div>

          <div class="chart-toolbar">
            <div class="segmented tight">
              <button v-for="item in timeframeOptions" :key="item.key" type="button" :class="{ active: timeframe === item.key }" @click="timeframe = item.key">
                {{ item.label }}
              </button>
            </div>
            <div v-if="timeframe !== 'fs'" class="mini-tabs adjustment-tabs" aria-label="复权方式">
              <button v-for="item in adjustmentOptions" :key="item.key" type="button" :class="{ active: adjustmentMode === item.key }" @click="adjustmentMode = item.key">{{ item.label }}</button>
            </div>
            <button class="tool-toggle" :class="{ active: showMa }" type="button" title="均线" @click="showMa = !showMa">
              <Activity :size="16" />
              <span>MA</span>
            </button>
            <button class="tool-toggle" :class="{ active: showVolume }" type="button" title="成交量" @click="showVolume = !showVolume">
              <Gauge :size="16" />
              <span>VOL</span>
            </button>
          </div>
        </section>

        <section class="chart-surface">
          <div v-if="!selectedCandles.length" class="tab-empty compact">
            <RefreshCw :size="22" class="spin" />
            <strong>同步{{ timeframeLabel(timeframe) }}中</strong>
          </div>
          <KLineChart
            v-else
            :key="`${selected.meta.code}-${candleVariantKey(timeframe, adjustmentMode)}`"
            :candles="selectedCandles"
            :mode="chartMode"
            :show-ma="showMa"
            :show-volume="showVolume"
            :reference-price="selected.quote.prevClose"
            :price-limit-pct="stockLimitPct(selected.meta.code, selected.meta.name)"
          />
        </section>

        <section class="stock-info-panel">
          <div class="stock-info-header">
            <div class="stock-info-title">
              <Database :size="14" />
              <strong>个股资料</strong>
              <span>{{ selected.meta.name }}</span>
            </div>
            <div class="mini-tabs stock-info-tabs">
              <button v-for="item in stockInfoTabs" :key="item.key" type="button" :class="{ active: stockInfoTab === item.key }" @click="stockInfoTab = item.key">
                {{ item.label }}
              </button>
            </div>
            <button class="icon-button mini" :class="{ active: selectedStockInfoLoading }" type="button" :title="`刷新${stockInfoTabLabel}`" @click="loadSelectedStockInfo(true)">
              <RefreshCw :size="13" />
            </button>
          </div>

          <div class="stock-info-body">
            <div v-if="selectedStockInfoLoading && !selectedStockInfoHasData" class="stock-info-state">
              <RefreshCw :size="16" class="spin" />
              <span>同步{{ stockInfoTabLabel }}中</span>
            </div>
            <div v-else-if="selectedStockInfoError" class="stock-info-state error">
              <span>{{ selectedStockInfoError }}</span>
            </div>

            <div v-else-if="stockInfoTab === 'news'" class="stock-news-list">
              <button v-for="item in selectedStockNews" :key="item.id" type="button" @click="openStockNews(item)">
                <div>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.summary }}</p>
                </div>
                <span>{{ item.sourceLabel }} · {{ formatNewsTime(item.publishedAt) }}</span>
              </button>
              <div v-if="!selectedStockNews.length" class="stock-info-state">暂无相关资讯</div>
            </div>

            <div v-else-if="stockInfoTab === 'finance'" class="finance-view">
              <FinanceTrendChart v-if="selectedFinancialReports.length" :reports="selectedFinancialReports" />
              <div v-if="selectedFinancialReports.length" class="finance-table-wrap">
                <div class="finance-table">
                  <div class="finance-table-row head"><span>报告期</span><span>营收</span><span>营收同比</span><span>归母净利</span><span>净利同比</span><span>ROE</span><span>负债率</span></div>
                  <div v-for="report in selectedFinancialReports" :key="report.reportDate" class="finance-table-row">
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
              <div v-if="!selectedFinancialReports.length" class="stock-info-state">暂无财务数据</div>
            </div>

            <div v-else-if="stockInfoTab === 'company' && selectedCompanyProfile" class="company-view">
              <div class="company-facts">
                <div><span>公司全称</span><strong>{{ selectedCompanyProfile.fullName || '--' }}</strong></div>
                <div><span>所属行业</span><strong>{{ selectedCompanyProfile.industry || selected.meta.sector }}</strong></div>
                <div><span>上市日期</span><strong>{{ selectedCompanyProfile.listingDate || '--' }}</strong></div>
                <div><span>董事长</span><strong>{{ selectedCompanyProfile.chairman || '--' }}</strong></div>
                <div><span>实际控制人</span><strong>{{ selectedCompanyProfile.actualController || '--' }}</strong></div>
                <div><span>员工人数</span><strong>{{ formatInteger(selectedCompanyProfile.employees) }}</strong></div>
                <div><span>注册资本</span><strong>{{ formatRegisteredCapital(selectedCompanyProfile.registeredCapital) }}</strong></div>
                <div><span>公司网站</span><strong>{{ selectedCompanyProfile.website || '--' }}</strong></div>
              </div>
              <div class="company-narrative">
                <div><span>主营业务</span><strong>{{ selectedCompanyProfile.mainBusiness || '--' }}</strong></div>
                <p>{{ selectedCompanyProfile.profile || selectedCompanyProfile.businessScope || '暂无公司简介' }}</p>
              </div>
            </div>
            <div v-else-if="stockInfoTab === 'company'" class="stock-info-state">暂无公司资料</div>

            <div v-else class="announcement-list">
              <div v-for="item in selectedAnnouncements" :key="item.id">
                <span>{{ formatInfoDate(item.publishedAt) }}</span>
                <strong>{{ item.title }}</strong>
                <em>{{ item.category }}</em>
              </div>
              <div v-if="!selectedAnnouncements.length" class="stock-info-state">暂无公司公告</div>
            </div>
          </div>
        </section>

      </main>

      <main v-else class="empty-workspace">
        <div class="empty-panel">
          <Star :size="28" />
          <strong>暂无自选</strong>
        </div>
      </main>

      <aside v-if="selected" class="detail-pane" :class="{ collapsed: rightPaneCollapsed }">
        <button v-if="rightPaneCollapsed" class="icon-button pane-restore-button" type="button" title="展开盘口" @click="toggleRightPane">
          <PanelRightOpen :size="17" />
        </button>
        <template v-else>
        <section class="detail-block quote-focus">
          <div class="detail-header">
            <span>盘口</span>
            <button class="icon-button mini" type="button" title="收起盘口" @click="toggleRightPane">
              <PanelRightClose :size="14" />
            </button>
          </div>
          <div class="price-line">
            <strong :class="priceClass(selected.quote.changePct)">{{ formatPrice(selected.quote.price) }}</strong>
            <div :class="priceClass(selected.quote.changePct)">
              <component :is="selected.quote.changePct >= 0 ? TrendingUp : TrendingDown" :size="16" />
              <span>{{ formatPct(selected.quote.changePct) }}</span>
            </div>
          </div>
          <div class="quote-matrix">
            <span>今开</span><strong>{{ formatPrice(selected.quote.open) }}</strong>
            <span>最高</span><strong class="up">{{ formatPrice(selected.quote.high) }}</strong>
            <span>最低</span><strong class="down">{{ formatPrice(selected.quote.low) }}</strong>
            <span>换手</span><strong>{{ selected.quote.turnoverRate.toFixed(2) }}%</strong>
            <span>振幅</span><strong>{{ selected.quote.amplitude.toFixed(2) }}%</strong>
            <span>成交</span><strong>{{ formatAmount(selected.quote.amount) }}</strong>
          </div>
        </section>

        <section class="detail-block">
          <div class="detail-header">
            <span>五档</span>
            <span class="muted">手</span>
          </div>
          <div class="order-book">
            <div v-for="(level, index) in [...selected.quote.ask].reverse()" :key="`ask-${index}`" class="book-row ask">
              <span>卖{{ 5 - index }}</span>
              <strong>{{ formatPrice(level.price) }}</strong>
              <em>{{ formatVolume(level.volume) }}</em>
            </div>
            <div class="spread-line">
              <span>价差</span>
              <strong>{{ formatPrice(selected.quote.ask[0].price - selected.quote.bid[0].price) }}</strong>
            </div>
            <div v-for="(level, index) in selected.quote.bid" :key="`bid-${index}`" class="book-row bid">
              <span>买{{ index + 1 }}</span>
              <strong>{{ formatPrice(level.price) }}</strong>
              <em>{{ formatVolume(level.volume) }}</em>
            </div>
          </div>
        </section>

        <section class="detail-block">
          <div class="detail-header">
            <span>指标</span>
            <div class="mini-tabs">
              <button v-for="item in indicatorTabs" :key="item.key" type="button" :class="{ active: indicatorTab === item.key }" @click="indicatorTab = item.key">
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="indicator-stack">
            <div v-for="item in visibleIndicators" :key="item.label">
              <span>{{ item.label }}</span>
              <strong :class="item.tone">{{ item.value }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-block">
          <div class="detail-header">
            <span>提醒</span>
            <button class="icon-button mini" type="button" title="管理提醒" :class="{ active: selectedAlertRuleCount > 0 }" @click="openAlertCenter(selected.meta.code)">
              <Bell :size="14" />
            </button>
          </div>
          <div class="selected-alert-summary">
            <div><strong>{{ selectedAlertRuleCount }}</strong><span>启用规则</span></div>
            <div><strong>{{ selectedLatestAlert ? formatAlertAge(selectedLatestAlert.occurredAt) : '--' }}</strong><span>最近触发</span></div>
            <button class="command-button" type="button" @click="openAlertCenter(selected.meta.code)"><Plus :size="13" />新增</button>
          </div>
        </section>

        <section class="detail-block adapter-block">
          <div class="detail-header">
            <span>扩展</span>
            <Pin :size="14" />
          </div>
          <div class="adapter-row">
            <span>MarketDataProvider</span>
            <strong>{{ provider.providerName }}</strong>
          </div>
          <div class="adapter-row">
            <span>刷新</span>
            <strong>{{ provider.refreshLabel }}</strong>
          </div>
        </section>
        </template>
      </aside>
    </div>

    <WatchlistManager
      v-if="watchManagerOpen"
      :groups="watchGroups"
      :entries="watchOrganization.entries"
      :metas="watchMetas"
      :import-status="watchImportStatus"
      @close="watchManagerOpen = false"
      @create-group="addWatchGroup"
      @update-group="updateWatchGroupDetails"
      @move-group="moveWatchGroup"
      @delete-group="deleteWatchGroup"
      @update-entry="editWatchEntry"
      @remove-codes="removeStocks"
      @import="importWatchlist"
      @export="exportWatchlist"
    />
    <AlertCenter
      v-if="alertCenterOpen"
      :rules="alertSettings.rules"
      :events="alertHistory"
      :settings="alertSettings"
      :metas="watchMetas"
      :groups="watchGroups"
      :initial-code="alertCenterInitialCode"
      @close="alertCenterOpen = false"
      @create-rule="createAlertRule"
      @update-rule="updateAlertRule"
      @toggle-rule="toggleAlertRule"
      @delete-rule="deleteAlertRule"
      @mark-read="markAlertRead"
      @mark-all-read="markAllAlertsRead"
      @clear-history="clearAlertHistory"
      @export-history="exportAlertHistory"
      @select-stock="openAlertStock"
      @update-settings="updateAlertSettings"
    />
    <DataSourceHealth v-if="dataSourceHealthOpen" @close="dataSourceHealthOpen = false" />
    <AppearanceSettings v-if="appearanceSettingsOpen" v-model="appearance" @close="appearanceSettingsOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Activity, ArrowLeft, Bell, BookOpen, Database, Gauge, Layers3, ListFilter, Newspaper, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pin, Plus, Radio, RefreshCw, Search, Settings2, Star, TrendingDown, TrendingUp, X } from '@lucide/vue';
import KLineChart from '@/components/KLineChart.vue';
import AlertCenter from '@/components/AlertCenter.vue';
import AppearanceSettings from '@/components/AppearanceSettings.vue';
import DataSourceHealth from '@/components/DataSourceHealth.vue';
import MarketMonitor from '@/components/MarketMonitor.vue';
import SectorDetailPanel from '@/components/SectorDetailPanel.vue';
import TradingKnowledge from '@/components/TradingKnowledge.vue';
import WatchlistManager from '@/components/WatchlistManager.vue';
import { candleVariantKey, effectiveAdjustment } from '@/services/adjustment';
import { applyAppearance, loadAppearance, type AppearanceSettings as AppearanceSettingsState } from '@/services/appearance';
import { createAlertRuntime, evaluateAlerts } from '@/services/alertEngine';
import { EastmoneyAshareProvider } from '@/services/eastmoneyProvider';
import { assessMarketDataHealth } from '@/services/dataHealth';
import { fetchAshareNews, fetchNewsDetail, NEWS_FILTERS } from '@/services/newsProvider';
import { fetchHotStockQuote, fetchHotStockRows, fetchSectorConstituents, fetchSectorRows, fetchStockCandles } from '@/services/sectorProvider';
import { fetchStockAnnouncements, fetchStockCompanyProfile, fetchStockFinancials, fetchStockNews } from '@/services/stockInfoProvider';
import { searchAshareStocks } from '@/services/stockSearch';
import { createWatchGroup, exportWatchlistCsv, exportWatchlistJson, normalizeWatchlistOrganization, parseWatchlistImportReport, removeWatchGroup, reorderWatchEntries, reorderWatchGroups, updateWatchEntry, updateWatchGroup, upsertWatchEntry } from '@/services/watchlistState';
import type { AdjustmentMode, Candle, InstrumentState, StockMeta, Timeframe } from '@/types/market';
import type { AlertHistoryItem, AlertRule, AlertRuntime, AlertSettings } from '@/types/alerts';
import type { NewsItem, NewsSourceKey } from '@/types/news';
import type { MonitorStockReference } from '@/types/marketMonitor';
import type { HotStockRow, HotStockSortKey, SectorMode, SectorRow, SectorSortKey } from '@/types/sector';
import type { StockAnnouncement, StockCompanyProfile, StockFinancialReport } from '@/types/stockInfo';
import type { WatchlistOrganization } from '@/types/watchlist';

const FinanceTrendChart = defineAsyncComponent(() => import('@/components/FinanceTrendChart.vue'));

type WorkspaceTab = 'news' | 'sectors' | 'hotSectors' | 'hotStocks' | 'knowledge' | 'watchlist';
type SortKey = 'custom' | 'signal' | 'change' | 'speed';
type IndicatorTab = 'trend' | 'macd' | 'risk';
type NewsFilterKey = 'all' | NewsSourceKey;
type StockInfoTab = 'news' | 'finance' | 'company' | 'announcements';
type HotSectorSortKey = 'heat' | 'change' | 'money' | 'breadth';

const WATCHLIST_STORAGE_KEY = 'biga.watchlist.v1';
const WATCHLIST_ORGANIZATION_STORAGE_KEY = 'biga.watchlist-organization.v2';
const PANE_LAYOUT_STORAGE_KEY = 'biga.pane-layout.v1';
const ADJUSTMENT_STORAGE_KEY = 'biga.adjustment.v1';
const ALERT_STATE_STORAGE_KEY = 'biga.alert-state.v1';
const initialWatchlist = loadStoredWatchlist();
const initialWatchOrganization = loadStoredWatchOrganization(initialWatchlist);
const initialAlertState = loadAlertState();
const initialPaneLayout = loadPaneLayout();
const provider = new EastmoneyAshareProvider(initialWatchlist);
const snapshot = ref<InstrumentState[]>(provider.getSnapshot());
const watchMetas = ref<StockMeta[]>(initialWatchlist);
const watchOrganization = ref<WatchlistOrganization>(initialWatchOrganization);
const watchCodes = computed(() => watchMetas.value.map((item) => item.code));
const watchGroups = computed(() => [...watchOrganization.value.groups].sort((a, b) => a.order - b.order));
const watchEntryByCode = computed(() => new Map(watchOrganization.value.entries.map((entry) => [entry.code, entry])));
const activeWatchGroupId = ref('all');
const watchManagerOpen = ref(false);
const dataSourceHealthOpen = ref(false);
const appearanceSettingsOpen = ref(false);
const appearance = ref<AppearanceSettingsState>(loadAppearance());
const watchImportStatus = ref<{ message: string; tone: 'success' | 'error' } | null>(null);
const alertCenterOpen = ref(false);
const alertCenterInitialCode = ref('');
const draggedWatchCode = ref('');
const selectedCode = ref(initialWatchlist[0]?.code ?? '');
const leftPaneCollapsed = ref(initialPaneLayout.left);
const rightPaneCollapsed = ref(initialPaneLayout.right);
const phaseNow = ref(provider.getMarketPhase());
const sourceStatus = ref(provider.getSourceStatus());
const clockNow = ref(Date.now());
const activeTab = ref<WorkspaceTab>('news');
const query = ref('');
const searchResults = ref<StockMeta[]>([]);
const searchLoading = ref(false);
const searchError = ref('');
const sortKey = ref<SortKey>('custom');
const timeframe = ref<Timeframe>('fs');
const adjustmentMode = ref<AdjustmentMode>(loadAdjustmentMode());
const showMa = ref(true);
const showVolume = ref(true);
const indicatorTab = ref<IndicatorTab>('trend');
const stockInfoTab = ref<StockInfoTab>('news');
const stockNewsCache = ref<Record<string, NewsItem[]>>({});
const stockFinancialCache = ref<Record<string, StockFinancialReport[]>>({});
const stockCompanyCache = ref<Record<string, StockCompanyProfile | null>>({});
const stockAnnouncementCache = ref<Record<string, StockAnnouncement[]>>({});
const stockInfoErrors = ref<Record<string, string>>({});
const stockInfoLoadingKey = ref('');
const alertSettings = ref<AlertSettings>(initialAlertState.settings);
const alertRuntime = ref<AlertRuntime>(initialAlertState.runtime);
const alertHistory = ref<AlertHistoryItem[]>(initialAlertState.history);
const alertNotificationAtByCode = ref<Record<string, number>>(initialAlertState.notificationAtByCode);
const newsItems = ref<NewsItem[]>([]);
const newsFilter = ref<NewsFilterKey>('all');
const newsLoading = ref(false);
const newsStatus = ref('待连接');
const newsLoadedAt = ref<number | null>(null);
const selectedNews = ref<NewsItem | null>(null);
const newsDetails = ref<Record<string, string[]>>({});
const newsDetailLoadingId = ref('');
const sectorRows = ref<SectorRow[]>([]);
const hotStockRows = ref<HotStockRow[]>([]);
const sectorMode = ref<SectorMode>('industry');
const hotSectorSort = ref<HotSectorSortKey>('heat');
const hotStockSort = ref<HotStockSortKey>('hot');
const sectorLoading = ref(false);
const sectorStatus = ref('待连接');
const selectedSectorCode = ref('');
const sectorConstituentCache = ref<Record<string, HotStockRow[]>>({});
const sectorConstituentLoadingCode = ref('');
const selectedHotStockCode = ref('');
const hotStockTimeframe = ref<Timeframe>('fs');
const hotStockCandleCache = ref<Record<string, Record<string, Candle[]>>>({});
const hotStockLoadingKey = ref('');
const selectedAdjustedCandleCache = ref<Record<string, Record<string, Candle[]>>>({});
const selectedAdjustedLoadingKey = ref('');

let unsubscribe: (() => void) | null = null;
let newsTimer: number | undefined;
let sectorTimer: number | undefined;
let searchTimer: number | undefined;
let phaseTimer: number | undefined;
let unsubscribeNotificationClick: (() => void) | undefined;
let marketListRequestId = 0;
let searchRequestId = 0;
let lastAlertPersistAt = 0;

const workspaceTabs = [
  { key: 'news', label: '新闻', icon: Newspaper },
  { key: 'sectors', label: '市场监控', icon: Activity },
  { key: 'hotSectors', label: '热门板块', icon: Layers3 },
  { key: 'hotStocks', label: '热门股票', icon: TrendingUp },
  { key: 'knowledge', label: '知识库', icon: BookOpen },
  { key: 'watchlist', label: '自选股', icon: Star }
] as const;

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: 'custom', label: '自定义' },
  { key: 'signal', label: '信号' },
  { key: 'change', label: '涨幅' },
  { key: 'speed', label: '速度' }
];

const timeframeOptions: Array<{ key: Timeframe; label: string }> = [
  { key: 'fs', label: '分时' },
  { key: '1d', label: '日K' },
  { key: '1w', label: '周K' },
  { key: '1mo', label: '月K' }
];
const adjustmentOptions: Array<{ key: AdjustmentMode; label: string }> = [
  { key: 'forward', label: '前复权' },
  { key: 'none', label: '不复权' },
  { key: 'backward', label: '后复权' }
];

const indicatorTabs: Array<{ key: IndicatorTab; label: string }> = [
  { key: 'trend', label: '趋势' },
  { key: 'macd', label: 'MACD' },
  { key: 'risk', label: '风控' }
];
const stockInfoTabs: Array<{ key: StockInfoTab; label: string }> = [
  { key: 'news', label: '资讯' },
  { key: 'finance', label: '财务' },
  { key: 'company', label: '公司' },
  { key: 'announcements', label: '公告' }
];
const newsFilters = NEWS_FILTERS;
const sectorModeOptions: Array<{ key: SectorMode; label: string }> = [
  { key: 'industry', label: '行业' },
  { key: 'concept', label: '概念' }
];
const hotSectorSortOptions: Array<{ key: HotSectorSortKey; label: string }> = [
  { key: 'heat', label: '综合热度' },
  { key: 'change', label: '涨幅' },
  { key: 'money', label: '资金' },
  { key: 'breadth', label: '扩散' }
];
const hotStockSortOptions: Array<{ key: HotStockSortKey; label: string }> = [
  { key: 'hot', label: '综合热度' },
  { key: 'change', label: '涨幅' },
  { key: 'amount', label: '成交' },
  { key: 'turnover', label: '换手' }
];

watch(appearance, (value) => applyAppearance(value), { deep: true });

onMounted(() => {
  unsubscribe = provider.subscribe((rows) => {
    snapshot.value = rows;
    syncWatchlistMetadata(rows);
    phaseNow.value = provider.getMarketPhase();
    sourceStatus.value = provider.getSourceStatus();
    evaluateSnapshotAlerts(rows);
  });
  unsubscribeNotificationClick = window.bigA?.onNotificationClick?.(({ code }) => openAlertStock(code));
  provider.start();
  void refreshNews();
  void refreshSectors();
  newsTimer = window.setInterval(() => void refreshNews(), 90_000);
  sectorTimer = window.setInterval(() => void refreshActiveMarketTab(), 15_000);
  phaseTimer = window.setInterval(() => {
    clockNow.value = Date.now();
    phaseNow.value = provider.getMarketPhase();
  }, 5_000);
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribeNotificationClick?.();
  provider.stop();
  if (newsTimer) {
    window.clearInterval(newsTimer);
  }
  if (sectorTimer) {
    window.clearInterval(sectorTimer);
  }
  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }
  if (phaseTimer) {
    window.clearInterval(phaseTimer);
  }
});

const marketPhase = computed(() => phaseNow.value);
const marketDataHealth = computed(() => assessMarketDataHealth(snapshot.value, sourceStatus.value, marketPhase.value, clockNow.value));
const chartMode = computed(() => (timeframe.value === 'fs' ? 'intraday' : 'kline'));
const isMac = computed(() => window.bigA?.platform === 'darwin' || navigator.platform.toLowerCase().includes('mac'));
const hasMarketData = computed(() => snapshot.value.length > 0);
const visibleNews = computed(() => (newsFilter.value === 'all' ? newsItems.value : newsItems.value.filter((item) => item.source === newsFilter.value)));
const newsEmptyLabel = computed(() => (newsLoading.value ? '同步新闻中' : newsLoadedAt.value ? '新闻源暂无返回' : '暂无新闻'));
const selectedNewsDetailLoading = computed(() => Boolean(selectedNews.value && newsDetailLoadingId.value === selectedNews.value.id));
const maxSectorFlow = computed(() => Math.max(...sectorRows.value.map((row) => Math.abs(row.mainNetInflow)), 1));
const maxSectorAmount = computed(() => Math.max(...sectorRows.value.map((row) => row.amount), 1));
const hotSectorRows = computed(() => sortHotSectorRows(sectorRows.value, hotSectorSort.value));
const activeSectorRows = computed(() => hotSectorRows.value);
const selectedSector = computed(() => activeSectorRows.value.find((row) => row.code === selectedSectorCode.value) ?? activeSectorRows.value[0] ?? null);
const selectedSectorConstituents = computed(() => selectedSector.value ? sectorConstituentCache.value[selectedSector.value.code] ?? [] : []);
const selectedSectorConstituentsLoading = computed(() => Boolean(selectedSector.value && sectorConstituentLoadingCode.value === selectedSector.value.code));
const selectedHotStock = computed(() => hotStockRows.value.find((row) => row.code === selectedHotStockCode.value) ?? null);
const selectedHotStockCandles = computed(() => {
  if (!selectedHotStock.value) {
    return [];
  }
  return hotStockCandleCache.value[selectedHotStock.value.code]?.[candleVariantKey(hotStockTimeframe.value, adjustmentMode.value)] ?? [];
});
const hotStockCandlesLoading = computed(() => Boolean(selectedHotStock.value && hotStockLoadingKey.value === hotStockCacheKey(selectedHotStock.value.code, hotStockTimeframe.value, adjustmentMode.value)));
const hotStockChartMode = computed(() => (hotStockTimeframe.value === 'fs' ? 'intraday' : 'kline'));
const selectedHotStockAverage = computed(() => {
  const intraday = selectedHotStock.value
    ? hotStockCandleCache.value[selectedHotStock.value.code]?.[candleVariantKey('fs', 'forward')] ?? []
    : [];
  const latest = intraday[intraday.length - 1];
  if (latest?.average !== undefined) {
    return latest.average;
  }

  if (!intraday.length) {
    return null;
  }

  const total = intraday.reduce((sum, candle) => sum + candle.close, 0);
  return total / intraday.length;
});
const selectedHotStockUpdatedLabel = computed(() => {
  const latest = selectedHotStockCandles.value[selectedHotStockCandles.value.length - 1];
  if (!latest) {
    return hotStockCandlesLoading.value ? '同步中' : '待同步';
  }

  return hotStockTimeframe.value === 'fs' ? formatNewsTime(latest.time * 1000) : formatCandleDate(latest.time);
});
const maxHotStockAmount = computed(() => Math.max(...hotStockRows.value.map((row) => row.amount), 1));
const displayHotStockRows = computed(() => {
  const rows = [...hotStockRows.value];
  if (hotStockSort.value === 'hot') return rows.sort((a, b) => hotStockHeatScore(b) - hotStockHeatScore(a));
  if (hotStockSort.value === 'change') return rows.sort((a, b) => b.changePct - a.changePct);
  if (hotStockSort.value === 'turnover') return rows.sort((a, b) => b.turnoverRate - a.turnoverRate);
  return rows.sort((a, b) => b.amount - a.amount);
});
const hotSectorStats = computed(() => ({
  leader: hotSectorRows.value[0] ?? null,
  strongCount: hotSectorRows.value.filter((row) => sectorHeatScore(row) >= 60).length,
  activeCount: hotSectorRows.value.filter((row) => row.changePct >= 1).length,
  totalAmount: hotSectorRows.value.slice(0, 20).reduce((sum, row) => sum + row.amount, 0)
}));
const hotStockStats = computed(() => ({
  leader: displayHotStockRows.value[0] ?? null,
  strongCount: displayHotStockRows.value.filter((row) => hotStockHeatScore(row) >= 60).length,
  highTurnoverCount: displayHotStockRows.value.filter((row) => row.turnoverRate >= 10).length,
  averageTurnover: hotStockRows.value.length ? hotStockRows.value.reduce((sum, row) => sum + row.turnoverRate, 0) / hotStockRows.value.length : 0,
  totalAmount: hotStockRows.value.reduce((sum, row) => sum + row.amount, 0)
}));
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

const rowsByCode = computed(() => new Map(snapshot.value.map((row) => [row.meta.code, row])));

const watchRows = computed(() => {
  const visibleCodes = activeWatchGroupId.value === 'all'
    ? watchCodes.value
    : watchOrganization.value.entries.filter((entry) => entry.groupId === activeWatchGroupId.value).map((entry) => entry.code);
  const rows = visibleCodes
    .map((code) => rowsByCode.value.get(code))
    .filter((row): row is InstrumentState => Boolean(row));

  return rows.sort((a, b) => {
    if (sortKey.value === 'custom') {
      return (watchEntryByCode.value.get(a.meta.code)?.order ?? Infinity) - (watchEntryByCode.value.get(b.meta.code)?.order ?? Infinity);
    }
    if (sortKey.value === 'change') {
      return b.quote.changePct - a.quote.changePct;
    }

    if (sortKey.value === 'speed') {
      return Math.abs(b.quote.speed) - Math.abs(a.quote.speed);
    }

    return scoreRow(b) - scoreRow(a);
  });
});

const selected = computed(() => {
  const current = rowsByCode.value.get(selectedCode.value);
  if (activeWatchGroupId.value === 'all') return current ?? watchRows.value[0] ?? null;
  return watchRows.value.find((row) => row.meta.code === selectedCode.value) ?? watchRows.value[0] ?? null;
});
const selectedCandles = computed(() => {
  if (!selected.value) return [];
  if (timeframe.value === 'fs' || adjustmentMode.value === 'forward') return selected.value.candles[timeframe.value];
  return selectedAdjustedCandleCache.value[selected.value.meta.code]?.[candleVariantKey(timeframe.value, adjustmentMode.value)] ?? [];
});
const selectedStockNews = computed(() => (selected.value ? stockNewsCache.value[selected.value.meta.code] ?? [] : []));
const selectedFinancialReports = computed(() => (selected.value ? stockFinancialCache.value[selected.value.meta.code] ?? [] : []));
const selectedCompanyProfile = computed(() => (selected.value ? stockCompanyCache.value[selected.value.meta.code] ?? null : null));
const selectedAnnouncements = computed(() => (selected.value ? stockAnnouncementCache.value[selected.value.meta.code] ?? [] : []));
const selectedStockInfoKey = computed(() => (selected.value ? stockInfoCacheKey(selected.value.meta.code, stockInfoTab.value) : ''));
const selectedStockInfoLoading = computed(() => Boolean(selectedStockInfoKey.value && stockInfoLoadingKey.value === selectedStockInfoKey.value));
const selectedStockInfoError = computed(() => stockInfoErrors.value[selectedStockInfoKey.value] ?? '');
const stockInfoTabLabel = computed(() => stockInfoTabs.find((item) => item.key === stockInfoTab.value)?.label ?? '个股资料');
const selectedStockInfoHasData = computed(() => Boolean(selected.value && hasStockInfoCache(selected.value.meta.code, stockInfoTab.value)));

const candidateRows = computed(() => {
  return searchResults.value.filter((item) => !watchCodes.value.includes(item.code)).slice(0, 8);
});

const breadth = computed(() => {
  return snapshot.value.reduce(
    (acc, row) => {
      if (row.quote.changePct > 0.05) acc.up += 1;
      else if (row.quote.changePct < -0.05) acc.down += 1;
      else acc.flat += 1;
      return acc;
    },
    { up: 0, down: 0, flat: 0 }
  );
});
const unreadAlertCount = computed(() => alertHistory.value.filter((event) => !event.readAt).length);
const latestAlertByCode = computed(() => {
  const map = new Map<string, AlertHistoryItem>();
  alertHistory.value.forEach((event) => { if (!map.has(event.instrumentCode)) map.set(event.instrumentCode, event); });
  return map;
});
const selectedLatestAlert = computed(() => selected.value ? latestAlertByCode.value.get(selected.value.meta.code) ?? null : null);
const selectedAlertRuleCount = computed(() => selected.value
  ? alertSettings.value.rules.filter((rule) => rule.enabled && (!rule.instrumentCodes?.length || rule.instrumentCodes.includes(selected.value!.meta.code))).length
  : 0);

const visibleIndicators = computed(() => {
  if (!selected.value) {
    return [];
  }

  const { quote, indicators } = selected.value;

  if (indicatorTab.value === 'macd') {
    return [
      { label: 'DIF', value: formatNullable(indicators.dif, 3), tone: toneForNumber(indicators.dif) },
      { label: 'DEA', value: formatNullable(indicators.dea, 3), tone: toneForNumber(indicators.dea) },
      { label: 'BAR', value: formatNullable(indicators.macd, 3), tone: toneForNumber(indicators.macd) }
    ];
  }

  if (indicatorTab.value === 'risk') {
    return [
      { label: 'RSI6', value: formatNullable(indicators.rsi6, 1), tone: (indicators.rsi6 ?? 50) > 75 ? 'down' : (indicators.rsi6 ?? 50) < 25 ? 'up' : '' },
      { label: '振幅', value: `${quote.amplitude.toFixed(2)}%`, tone: quote.amplitude > 5 ? 'watch' : '' },
      { label: '量比', value: formatNullable(indicators.volumeRatio, 2), tone: (indicators.volumeRatio ?? 0) > 1.4 ? 'up' : '' }
    ];
  }

  return [
    { label: 'MA5', value: formatNullable(indicators.ma5, 2), tone: quote.price >= (indicators.ma5 ?? Infinity) ? 'up' : 'down' },
    { label: 'MA10', value: formatNullable(indicators.ma10, 2), tone: quote.price >= (indicators.ma10 ?? Infinity) ? 'up' : 'down' },
    { label: 'MA20', value: formatNullable(indicators.ma20, 2), tone: quote.price >= (indicators.ma20 ?? Infinity) ? 'up' : 'down' }
  ];
});

watch(activeTab, (tab) => {
  if (tab === 'sectors' || tab === 'hotSectors') {
    selectedSectorCode.value = '';
    void refreshSectors();
  }

  if (tab === 'hotStocks' && !hotStockRows.value.length) {
    void refreshHotStocks();
  }
});

watch(sectorMode, () => {
  selectedSectorCode.value = '';
  if (activeTab.value === 'sectors' || activeTab.value === 'hotSectors') {
    void refreshSectors();
  }
});

watch(hotSectorSort, () => {
  selectedSectorCode.value = '';
  if (activeTab.value === 'hotSectors') {
    void refreshSectors();
  }
});

watch(hotStockSort, () => {
  selectedHotStockCode.value = '';
  if (activeTab.value === 'hotStocks') {
    void refreshHotStocks();
  }
});

watch(hotStockTimeframe, (nextTimeframe) => {
  if (selectedHotStockCode.value) {
    void loadHotStockCandles(selectedHotStockCode.value, nextTimeframe);
  }
});

watch(
  () => [selected.value?.meta.code ?? '', timeframe.value, adjustmentMode.value] as const,
  ([code, selectedTimeframe, adjustment]) => {
    if (code && selectedTimeframe !== 'fs' && adjustment !== 'forward') {
      void loadSelectedAdjustedCandles(code, selectedTimeframe, adjustment);
    }
  },
  { immediate: true }
);

watch(adjustmentMode, (adjustment) => {
  persistAdjustmentMode(adjustment);
  if (selectedHotStockCode.value && hotStockTimeframe.value !== 'fs') {
    void loadHotStockCandles(selectedHotStockCode.value, hotStockTimeframe.value);
  }
});

watch(
  () => [selected.value?.meta.code ?? '', stockInfoTab.value] as const,
  ([code]) => {
    if (code) {
      void loadSelectedStockInfo();
    }
  },
  { immediate: true }
);

watch(query, (value) => {
  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }

  const keyword = value.trim();
  const requestId = ++searchRequestId;
  searchResults.value = [];
  searchError.value = '';

  if (!keyword) {
    searchLoading.value = false;
    return;
  }

  searchLoading.value = true;
  searchTimer = window.setTimeout(async () => {
    try {
      const rows = await searchAshareStocks(keyword);
      if (requestId === searchRequestId) {
        searchResults.value = rows;
      }
    } catch {
      if (requestId === searchRequestId) {
        searchError.value = '查询接口暂不可用';
      }
    } finally {
      if (requestId === searchRequestId) {
        searchLoading.value = false;
      }
    }
  }, 220);
});

function addStock(meta: StockMeta) {
  if (!watchCodes.value.includes(meta.code)) {
    watchMetas.value = [meta, ...watchMetas.value];
    watchOrganization.value = upsertWatchEntry(watchOrganization.value, meta.code, activeWatchGroupId.value === 'all' ? undefined : activeWatchGroupId.value);
    provider.addInstrument(meta);
    persistWatchlist();
    persistWatchOrganization();
  }

  selectedCode.value = meta.code;
  query.value = '';
}

function isWatchlisted(code: string) {
  return watchCodes.value.includes(code);
}

function toggleWatchlistMeta(meta: StockMeta) {
  if (isWatchlisted(meta.code)) {
    removeStock(meta.code);
    return;
  }
  addStock(meta);
}

function toggleHotStockWatchlist(row: HotStockRow) {
  toggleWatchlistMeta(stockMetaFromMarketRow(row, '热门股票'));
}

function toggleMonitorWatchlist(reference: MonitorStockReference) {
  toggleWatchlistMeta(stockMetaFromMarketRow(reference, '市场监控'));
}

function stockMetaFromMarketRow(
  row: Pick<HotStockRow, 'code' | 'name' | 'price'> & Partial<Pick<HotStockRow, 'prevClose' | 'floatMarketCap' | 'pe'>>,
  sector: string
): StockMeta {
  const existing = watchMetas.value.find((item) => item.code === row.code);
  if (existing) return existing;
  return {
    code: row.code,
    name: row.name,
    market: marketForStockCode(row.code),
    sector,
    basePrice: row.prevClose || row.price || 1,
    floatMarketCap: row.floatMarketCap || 0,
    pe: row.pe || 0,
    beta: 1,
    style: 'core'
  };
}

function marketForStockCode(code: string): StockMeta['market'] {
  if (code.startsWith('4') || code.startsWith('8') || code.startsWith('920')) return 'BJ';
  if (code.startsWith('5') || code.startsWith('6') || code.startsWith('9')) return 'SH';
  return 'SZ';
}

function toggleLeftPane() {
  leftPaneCollapsed.value = !leftPaneCollapsed.value;
  persistPaneLayout();
}

function toggleRightPane() {
  rightPaneCollapsed.value = !rightPaneCollapsed.value;
  persistPaneLayout();
}

async function loadSelectedStockInfo(force = false) {
  const row = selected.value;
  if (!row) {
    return;
  }

  const { meta } = row;
  const tab = stockInfoTab.value;
  const key = stockInfoCacheKey(meta.code, tab);
  if ((!force && hasStockInfoCache(meta.code, tab)) || stockInfoLoadingKey.value === key) {
    return;
  }

  stockInfoLoadingKey.value = key;
  const nextErrors = { ...stockInfoErrors.value };
  delete nextErrors[key];
  stockInfoErrors.value = nextErrors;

  try {
    if (tab === 'news') {
      stockNewsCache.value = { ...stockNewsCache.value, [meta.code]: await fetchStockNews(meta) };
    } else if (tab === 'finance') {
      stockFinancialCache.value = { ...stockFinancialCache.value, [meta.code]: await fetchStockFinancials(meta) };
    } else if (tab === 'company') {
      stockCompanyCache.value = { ...stockCompanyCache.value, [meta.code]: await fetchStockCompanyProfile(meta) };
    } else {
      stockAnnouncementCache.value = { ...stockAnnouncementCache.value, [meta.code]: await fetchStockAnnouncements(meta) };
    }
  } catch {
    const label = stockInfoTabs.find((item) => item.key === tab)?.label ?? '个股资料';
    stockInfoErrors.value = { ...stockInfoErrors.value, [key]: `${label}接口暂不可用` };
  } finally {
    if (stockInfoLoadingKey.value === key) {
      stockInfoLoadingKey.value = '';
    }
  }
}

function openStockNews(item: NewsItem) {
  selectedNews.value = item;
  activeTab.value = 'news';
  void loadNewsDetail(item);
}

function hasStockInfoCache(code: string, tab: StockInfoTab) {
  const cache = tab === 'news'
    ? stockNewsCache.value
    : tab === 'finance'
      ? stockFinancialCache.value
      : tab === 'company'
        ? stockCompanyCache.value
        : stockAnnouncementCache.value;
  return Object.prototype.hasOwnProperty.call(cache, code);
}

function stockInfoCacheKey(code: string, tab: StockInfoTab) {
  return `${code}:${tab}`;
}

function addFirstCandidate() {
  const first = candidateRows.value[0];
  if (first) {
    addStock(first);
  }
}

function removeStock(code: string) {
  watchMetas.value = watchMetas.value.filter((item) => item.code !== code);
  watchOrganization.value = { ...watchOrganization.value, entries: watchOrganization.value.entries.filter((entry) => entry.code !== code) };
  provider.removeInstrument(code);
  removeAlertInstrument(code);
  persistWatchlist();
  persistWatchOrganization();
  persistAlertState();

  if (selectedCode.value === code) {
    selectedCode.value = watchCodes.value[0] ?? '';
  }
}

function removeStocks(codes: string[]) {
  const uniqueCodes = [...new Set(codes)];
  const removing = new Set(uniqueCodes);
  watchMetas.value = watchMetas.value.filter((item) => !removing.has(item.code));
  watchOrganization.value = { ...watchOrganization.value, entries: watchOrganization.value.entries.filter((entry) => !removing.has(entry.code)) };
  uniqueCodes.forEach((code) => { provider.removeInstrument(code); removeAlertInstrument(code); });
  if (removing.has(selectedCode.value)) selectedCode.value = watchRows.value[0]?.meta.code ?? watchCodes.value[0] ?? '';
  persistWatchlist();
  persistWatchOrganization();
  persistAlertState();
}

function selectWatchGroup(groupId: string) {
  activeWatchGroupId.value = groupId;
  if (groupId === 'all') return;
  const firstCode = [...watchOrganization.value.entries].sort((a, b) => a.order - b.order).find((entry) => entry.groupId === groupId)?.code ?? '';
  selectedCode.value = firstCode;
}

function removeAlertInstrument(code: string) {
  alertSettings.value = {
    ...alertSettings.value,
    rules: alertSettings.value.rules.flatMap((rule) => {
      if (!rule.instrumentCodes?.includes(code)) return [rule];
      const instrumentCodes = rule.instrumentCodes.filter((item) => item !== code);
      return instrumentCodes.length ? [{ ...rule, instrumentCodes } as AlertRule] : [];
    })
  };
}

function openAlertCenter(code = '') {
  alertCenterInitialCode.value = code;
  alertCenterOpen.value = true;
}

function createAlertRule(rule: AlertRule) {
  alertSettings.value = { ...alertSettings.value, rules: [...alertSettings.value.rules, rule] };
  persistAlertState();
}

function updateAlertRule(rule: AlertRule) {
  alertSettings.value = { ...alertSettings.value, rules: alertSettings.value.rules.map((item) => item.id === rule.id ? rule : item) };
  const prefix = `${encodeURIComponent(rule.id)}::`;
  alertRuntime.value = { entries: Object.fromEntries(Object.entries(alertRuntime.value.entries).filter(([key]) => !key.startsWith(prefix))) };
  persistAlertState();
}

function toggleAlertRule(id: string, enabled: boolean) {
  alertSettings.value = { ...alertSettings.value, rules: alertSettings.value.rules.map((rule) => rule.id === id ? { ...rule, enabled } : rule) };
  persistAlertState();
}

function deleteAlertRule(id: string) {
  alertSettings.value = { ...alertSettings.value, rules: alertSettings.value.rules.filter((rule) => rule.id !== id) };
  const prefix = `${encodeURIComponent(id)}::`;
  alertRuntime.value = { entries: Object.fromEntries(Object.entries(alertRuntime.value.entries).filter(([key]) => !key.startsWith(prefix))) };
  persistAlertState();
}

function updateAlertSettings(patch: Partial<AlertSettings>) {
  alertSettings.value = { ...alertSettings.value, ...patch, rules: alertSettings.value.rules };
  persistAlertState();
}

function markAlertRead(id: string) {
  const now = Date.now();
  alertHistory.value = alertHistory.value.map((event) => event.id === id && !event.readAt ? { ...event, readAt: now } : event);
  persistAlertState();
}

function markAllAlertsRead() {
  const now = Date.now();
  alertHistory.value = alertHistory.value.map((event) => event.readAt ? event : { ...event, readAt: now });
  persistAlertState();
}

function clearAlertHistory() {
  alertHistory.value = [];
  persistAlertState();
}

function exportAlertHistory(events: AlertHistoryItem[]) {
  const rows = [
    ['occurredAt', 'code', 'name', 'rule', 'value', 'threshold', 'severity', 'message', 'readAt'],
    ...events.map((event) => [
      new Date(event.occurredAt).toISOString(), event.instrumentCode, event.instrumentName, event.ruleName,
      String(event.value), event.threshold === undefined ? '' : String(event.threshold), event.severity, event.message,
      event.readAt ? new Date(event.readAt).toISOString() : ''
    ])
  ];
  const csv = rows.map((row) => row.map((value) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(',')).join('\n');
  downloadTextFile(`BigA-alert-history-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
}

function openAlertStock(code: string) {
  if (!watchCodes.value.includes(code)) return;
  selectedCode.value = code;
  activeTab.value = 'watchlist';
  alertCenterOpen.value = false;
}

function evaluateSnapshotAlerts(rows: InstrumentState[]) {
  if (!alertSettings.value.enabled || !marketPhaseAllowsAlerts(phaseNow.value.type)) return;
  const sectorChanges: Record<string, number> = Object.fromEntries(sectorRows.value.map((row) => [row.name, row.changePct]));
  rows.forEach((instrument) => {
    if (sectorChanges[instrument.meta.sector] !== undefined) return;
    const key = normalizeSectorKey(instrument.meta.sector);
    const match = sectorRows.value.find((row) => {
      const rowKey = normalizeSectorKey(row.name);
      return rowKey === key || rowKey.includes(key) || key.includes(rowKey);
    });
    if (match) sectorChanges[instrument.meta.sector] = match.changePct;
  });
  const result = evaluateAlerts({
    instruments: rows,
    rules: alertSettings.value.rules,
    runtime: alertRuntime.value,
    sectorChanges,
    groupIdsByInstrument: Object.fromEntries(watchOrganization.value.entries.map((entry) => [entry.code, entry.groupId])),
    now: Date.now(),
    defaultCooldownMs: alertSettings.value.defaultCooldownMs
  });
  alertRuntime.value = result.runtime;
  if (!result.events.length) {
    if (Date.now() - lastAlertPersistAt >= 30_000) persistAlertState();
    return;
  }

  const events = result.events as AlertHistoryItem[];
  alertHistory.value = [...events, ...alertHistory.value].slice(0, alertSettings.value.maxHistory);
  events.forEach((event) => maybeShowSystemNotification(event));
  persistAlertState();
}

function maybeShowSystemNotification(event: AlertHistoryItem) {
  if (!alertSettings.value.systemNotifications || isAlertQuietTime(new Date())) return;
  const lastAt = alertNotificationAtByCode.value[event.instrumentCode] ?? 0;
  if (event.occurredAt - lastAt < alertSettings.value.defaultCooldownMs) return;
  alertNotificationAtByCode.value = { ...alertNotificationAtByCode.value, [event.instrumentCode]: event.occurredAt };
  void window.bigA?.showNotification?.({ title: `${event.instrumentName} · ${event.ruleName}`, body: event.message, code: event.instrumentCode });
}

function isAlertQuietTime(now: Date) {
  if (!alertSettings.value.quietHoursEnabled) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = timeTextToMinutes(alertSettings.value.quietStart);
  const end = timeTextToMinutes(alertSettings.value.quietEnd);
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end);
}

function timeTextToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
}

function marketPhaseAllowsAlerts(type: string) {
  return type === 'trading' || type === 'auction';
}

function normalizeSectorKey(value: string) {
  return value.replace(/[ⅠⅡⅢIV\s板块概念行业]/gi, '').trim();
}

function formatAlertAge(timestamp: number) {
  const age = Math.max(0, clockNow.value - timestamp);
  if (age < 60_000) return '刚刚';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}分`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}时`;
  return `${Math.floor(age / 86_400_000)}天`;
}

function startWatchDrag(code: string) {
  if (sortKey.value === 'custom') draggedWatchCode.value = code;
}

function dropWatchRow(targetCode: string) {
  if (!draggedWatchCode.value || draggedWatchCode.value === targetCode) return;
  watchOrganization.value = reorderWatchEntries(watchOrganization.value, draggedWatchCode.value, targetCode);
  draggedWatchCode.value = '';
  persistWatchOrganization();
}

function addWatchGroup(name: string) {
  watchOrganization.value = { ...watchOrganization.value, groups: createWatchGroup(watchOrganization.value.groups, name) };
  persistWatchOrganization();
}

function updateWatchGroupDetails(id: string, patch: { name?: string; color?: string }) {
  watchOrganization.value = { ...watchOrganization.value, groups: updateWatchGroup(watchOrganization.value.groups, id, patch) };
  persistWatchOrganization();
}

function moveWatchGroup(sourceId: string, targetId: string) {
  watchOrganization.value = { ...watchOrganization.value, groups: reorderWatchGroups(watchOrganization.value.groups, sourceId, targetId) };
  persistWatchOrganization();
}

function deleteWatchGroup(id: string) {
  watchOrganization.value = removeWatchGroup(watchOrganization.value, id);
  if (activeWatchGroupId.value === id) activeWatchGroupId.value = 'all';
  persistWatchOrganization();
}

function editWatchEntry(code: string, patch: { groupId?: string; tags?: string[] }) {
  watchOrganization.value = updateWatchEntry(watchOrganization.value, code, patch);
  persistWatchOrganization();
}

function importWatchlist(text: string) {
  let report;
  try {
    report = parseWatchlistImportReport(text);
  } catch {
    watchImportStatus.value = { tone: 'error', message: '导入失败：文件格式无法识别' };
    return;
  }
  if (!report.rows.length) {
    watchImportStatus.value = { tone: 'error', message: report.rejected ? `未导入有效股票，已跳过 ${report.rejected} 行` : '未发现可导入的股票' };
    return;
  }
  let organization = watchOrganization.value;
  const nextMetas = [...watchMetas.value];
  let added = 0;
  let updated = 0;
  report.rows.forEach(({ meta, groupName, tags }) => {
    if (!organization.groups.some((group) => group.name === groupName)) {
      organization = { ...organization, groups: createWatchGroup(organization.groups, groupName) };
    }
    const groupId = organization.groups.find((group) => group.name === groupName)?.id;
    if (!nextMetas.some((item) => item.code === meta.code)) {
      nextMetas.push(meta);
      provider.addInstrument(meta);
      added += 1;
    } else updated += 1;
    organization = upsertWatchEntry(organization, meta.code, groupId);
    organization = updateWatchEntry(organization, meta.code, { groupId, tags });
  });
  watchMetas.value = nextMetas;
  watchOrganization.value = normalizeWatchlistOrganization(organization, nextMetas);
  persistWatchlist();
  persistWatchOrganization();
  const skipped = report.rejected ? `，跳过 ${report.rejected} 行` : '';
  watchImportStatus.value = { tone: 'success', message: `导入完成：新增 ${added}，更新 ${updated}${skipped}` };
}

function exportWatchlist(format: 'csv' | 'json') {
  const content = format === 'csv' ? exportWatchlistCsv(watchMetas.value, watchOrganization.value) : exportWatchlistJson(watchMetas.value, watchOrganization.value);
  downloadTextFile(`BigA-watchlist-${new Date().toISOString().slice(0, 10)}.${format}`, content, format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8');
}

function downloadTextFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

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

async function refreshSectors() {
  const requestId = ++marketListRequestId;
  const requestedMode = sectorMode.value;
  const requestedTab = activeTab.value;
  sectorLoading.value = true;

  try {
    const requestedSort = requestedTab === 'hotSectors'
      ? hotSectorSort.value === 'money' ? 'money' : hotSectorSort.value === 'breadth' ? 'breadth' : 'change'
      : 'money';
    const rows = await fetchSectorRows(requestedMode, requestedSort);
    if (requestId !== marketListRequestId || sectorMode.value !== requestedMode || activeTab.value !== requestedTab) return;
    sectorRows.value = rows;
    if (requestedTab === 'hotSectors') {
      const visibleRows = hotSectorRows.value;
      if (!visibleRows.some((row) => row.code === selectedSectorCode.value)) {
        selectedSectorCode.value = visibleRows[0]?.code ?? '';
      }
      if (selectedSector.value) {
        void loadSectorConstituents(selectedSector.value, true);
      }
    }
    const source = rows[0]?.source === 'sina' ? '新浪板块' : '东方财富';
    sectorStatus.value = rows.length ? `${source} · ${marketListTimeLabel(rows)}` : '板块源暂无返回';
  } catch {
    if (requestId === marketListRequestId) sectorStatus.value = '板块源暂不可用';
  } finally {
    if (requestId === marketListRequestId) sectorLoading.value = false;
  }
}

function selectSector(row: SectorRow) {
  selectedSectorCode.value = row.code;
  void loadSectorConstituents(row);
}

async function loadSectorConstituents(row: SectorRow, force = false) {
  if ((!force && Object.prototype.hasOwnProperty.call(sectorConstituentCache.value, row.code)) || sectorConstituentLoadingCode.value === row.code) {
    return;
  }

  sectorConstituentLoadingCode.value = row.code;
  try {
    const stocks = await fetchSectorConstituents(row);
    sectorConstituentCache.value = { ...sectorConstituentCache.value, [row.code]: stocks };
  } finally {
    if (sectorConstituentLoadingCode.value === row.code) {
      sectorConstituentLoadingCode.value = '';
    }
  }
}

function openConstituentStock(row: HotStockRow) {
  if (!hotStockRows.value.some((item) => item.code === row.code)) {
    hotStockRows.value = [row, ...hotStockRows.value];
  }
  activeTab.value = 'hotStocks';
  showHotStockDetail(row);
}

async function openMonitorStock(reference: MonitorStockReference) {
  const existing = hotStockRows.value.find((item) => item.code === reference.code);
  const fallback = existing ?? monitorReferenceToHotStock(reference);
  if (!existing) {
    hotStockRows.value = [fallback, ...hotStockRows.value];
  }
  activeTab.value = 'hotStocks';
  showHotStockDetail(fallback);

  const live = await fetchHotStockQuote(reference.code);
  if (!live) return;
  hotStockRows.value = [live, ...hotStockRows.value.filter((item) => item.code !== live.code)];
}

function monitorReferenceToHotStock(reference: MonitorStockReference): HotStockRow {
  const prevClose = reference.price > 0 && reference.changePct !== -100
    ? reference.price / (1 + reference.changePct / 100)
    : reference.price;
  return {
    code: reference.code,
    name: reference.name,
    price: reference.price,
    prevClose,
    open: reference.price,
    high: reference.price,
    low: reference.price,
    change: reference.price - prevClose,
    changePct: reference.changePct,
    amplitude: 0,
    volume: 0,
    amount: reference.amount,
    turnoverRate: reference.turnoverRate,
    pe: 0,
    volumeRatio: 0,
    marketCap: 0,
    floatMarketCap: 0,
    mainNetInflow: 0,
    mainNetInflowPct: 0,
    speed: 0,
    updatedAt: 0,
    fetchedAt: Date.now()
  };
}

async function refreshHotStocks() {
  const requestId = ++marketListRequestId;
  const requestedSort = hotStockSort.value;
  sectorLoading.value = true;

  try {
    const rows = await fetchHotStockRows(requestedSort);
    if (requestId !== marketListRequestId || activeTab.value !== 'hotStocks' || hotStockSort.value !== requestedSort) return;
    hotStockRows.value = rows;
    if (selectedHotStockCode.value && !rows.some((row) => row.code === selectedHotStockCode.value)) {
      selectedHotStockCode.value = '';
    }
    if (selectedHotStockCode.value) {
      void loadHotStockCandles(selectedHotStockCode.value, hotStockTimeframe.value, true);
    }
    sectorStatus.value = rows.length ? `热门股票 · ${marketListTimeLabel(rows)}` : '股票源暂无返回';
  } catch {
    if (requestId === marketListRequestId) sectorStatus.value = '股票源暂不可用';
  } finally {
    if (requestId === marketListRequestId) sectorLoading.value = false;
  }
}

function refreshActiveMarketTab() {
  if (activeTab.value === 'sectors' || activeTab.value === 'hotSectors') {
    return refreshSectors();
  }

  if (activeTab.value === 'hotStocks') {
    return refreshHotStocks();
  }

  return Promise.resolve();
}

function showNewsDetail(item: NewsItem) {
  selectedNews.value = item;
  void loadNewsDetail(item);
}

function showHotStockDetail(row: HotStockRow) {
  selectedHotStockCode.value = row.code;
  hotStockTimeframe.value = 'fs';
  void loadHotStockCandles(row.code, 'fs');
}

function reloadHotStockCandles(code: string) {
  void loadHotStockCandles(code, hotStockTimeframe.value, true);
}

async function loadHotStockCandles(code: string, nextTimeframe: Timeframe, force = false) {
  const adjustment = effectiveAdjustment(nextTimeframe, adjustmentMode.value);
  const variantKey = candleVariantKey(nextTimeframe, adjustment);
  const key = hotStockCacheKey(code, nextTimeframe, adjustment);
  if ((!force && hotStockCandleCache.value[code]?.[variantKey]?.length) || hotStockLoadingKey.value === key) {
    return;
  }

  hotStockLoadingKey.value = key;

  try {
    const candles = await fetchStockCandles(code, nextTimeframe, adjustment);
    if (candles.length) {
      hotStockCandleCache.value = {
        ...hotStockCandleCache.value,
        [code]: {
          ...hotStockCandleCache.value[code],
          [variantKey]: candles
        }
      };
    }
  } finally {
    if (hotStockLoadingKey.value === key) {
      hotStockLoadingKey.value = '';
    }
  }
}

function hotStockCacheKey(code: string, nextTimeframe: Timeframe, adjustment: AdjustmentMode) {
  return `${code}:${candleVariantKey(nextTimeframe, adjustment)}`;
}

async function loadSelectedAdjustedCandles(code: string, selectedTimeframe: Timeframe, adjustment: AdjustmentMode, force = false) {
  if (selectedTimeframe === 'fs' || adjustment === 'forward') return;
  const variantKey = candleVariantKey(selectedTimeframe, adjustment);
  const requestKey = `${code}:${variantKey}`;
  if ((!force && selectedAdjustedCandleCache.value[code]?.[variantKey]?.length) || selectedAdjustedLoadingKey.value === requestKey) return;

  selectedAdjustedLoadingKey.value = requestKey;
  try {
    const candles = await fetchStockCandles(code, selectedTimeframe, adjustment);
    if (candles.length) {
      selectedAdjustedCandleCache.value = {
        ...selectedAdjustedCandleCache.value,
        [code]: {
          ...selectedAdjustedCandleCache.value[code],
          [variantKey]: candles
        }
      };
    }
  } finally {
    if (selectedAdjustedLoadingKey.value === requestKey) selectedAdjustedLoadingKey.value = '';
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

function syncWatchlistMetadata(rows: InstrumentState[]) {
  const rowMap = new Map(rows.map((row) => [row.meta.code, row.meta]));
  let changed = false;
  const next = watchMetas.value.map((meta) => {
    const liveMeta = rowMap.get(meta.code);
    if (!liveMeta || (liveMeta.name === meta.name && liveMeta.sector === meta.sector && liveMeta.market === meta.market)) {
      return meta;
    }
    changed = true;
    return { ...meta, name: liveMeta.name, sector: liveMeta.sector, market: liveMeta.market };
  });

  if (changed) {
    watchMetas.value = next;
    persistWatchlist();
  }
}

function persistWatchlist() {
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchMetas.value));
  } catch {
    // The live provider remains usable when renderer storage is unavailable.
  }
}

function persistWatchOrganization() {
  try {
    window.localStorage.setItem(WATCHLIST_ORGANIZATION_STORAGE_KEY, JSON.stringify(watchOrganization.value));
  } catch {
    // Keep the current session organization when renderer storage is unavailable.
  }
}

function persistAlertState() {
  lastAlertPersistAt = Date.now();
  try {
    window.localStorage.setItem(ALERT_STATE_STORAGE_KEY, JSON.stringify({
      version: 1,
      settings: alertSettings.value,
      runtime: alertRuntime.value,
      history: alertHistory.value,
      notificationAtByCode: alertNotificationAtByCode.value
    }));
  } catch {
    // Alerts remain active for the current session when storage is unavailable.
  }
}

function loadAlertState() {
  const defaults: AlertSettings = {
    enabled: true,
    defaultCooldownMs: 10 * 60_000,
    systemNotifications: true,
    quietHoursEnabled: true,
    quietStart: '22:30',
    quietEnd: '08:30',
    maxHistory: 500,
    rules: []
  };
  try {
    const raw = window.localStorage.getItem(ALERT_STATE_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) as {
      settings?: Partial<AlertSettings>;
      runtime?: AlertRuntime;
      history?: AlertHistoryItem[];
      notificationAtByCode?: Record<string, number>;
    } : null;
    const rules = Array.isArray(value?.settings?.rules) ? value.settings.rules.filter(isStoredAlertRule) : [];
    return {
      settings: { ...defaults, ...value?.settings, rules, maxHistory: Math.min(2_000, Math.max(50, Number(value?.settings?.maxHistory) || defaults.maxHistory)) },
      runtime: value?.runtime?.entries && typeof value.runtime.entries === 'object' ? value.runtime : createAlertRuntime(),
      history: Array.isArray(value?.history) ? value.history.filter(isStoredAlertHistory).slice(0, 2_000) : [],
      notificationAtByCode: value?.notificationAtByCode && typeof value.notificationAtByCode === 'object' ? value.notificationAtByCode : {}
    };
  } catch {
    return { settings: defaults, runtime: createAlertRuntime(), history: [] as AlertHistoryItem[], notificationAtByCode: {} as Record<string, number> };
  }
}

function isStoredAlertRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<AlertRule>;
  return Boolean(rule.id && rule.name && rule.type);
}

function isStoredAlertHistory(value: unknown): value is AlertHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<AlertHistoryItem>;
  return Boolean(event.id && event.ruleId && event.instrumentCode && Number.isFinite(event.occurredAt));
}

function loadStoredWatchOrganization(metas: StockMeta[]) {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_ORGANIZATION_STORAGE_KEY);
    return normalizeWatchlistOrganization(raw ? JSON.parse(raw) : null, metas);
  } catch {
    return normalizeWatchlistOrganization(null, metas);
  }
}

function persistPaneLayout() {
  try {
    window.localStorage.setItem(PANE_LAYOUT_STORAGE_KEY, JSON.stringify({
      left: leftPaneCollapsed.value,
      right: rightPaneCollapsed.value
    }));
  } catch {
    // Keep the current session layout when renderer storage is unavailable.
  }
}

function loadAdjustmentMode(): AdjustmentMode {
  try {
    const value = window.localStorage.getItem(ADJUSTMENT_STORAGE_KEY);
    if (value === 'none' || value === 'forward' || value === 'backward') return value;
  } catch {
    // Local storage may be unavailable in a restricted renderer.
  }
  return 'forward';
}

function persistAdjustmentMode(value: AdjustmentMode) {
  try {
    window.localStorage.setItem(ADJUSTMENT_STORAGE_KEY, value);
  } catch {
    // Keep the in-memory preference when persistence is unavailable.
  }
}

function loadPaneLayout() {
  try {
    const raw = window.localStorage.getItem(PANE_LAYOUT_STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as { left?: unknown; right?: unknown }) : null;
    return {
      left: value?.left === true,
      right: value?.right === true
    };
  } catch {
    return { left: false, right: false };
  }
}

function loadStoredWatchlist(): StockMeta[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set<string>();
    return parsed.flatMap((value) => {
      if (!isStoredStockMeta(value) || seen.has(value.code)) {
        return [];
      }
      seen.add(value.code);
      return [{ ...value, beta: Number(value.beta) || 1, style: value.style || 'core' }];
    });
  } catch {
    return [];
  }
}

function isStoredStockMeta(value: unknown): value is StockMeta {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<StockMeta>;
  return /^\d{6}$/.test(String(item.code ?? '')) && Boolean(item.name) && (item.market === 'SH' || item.market === 'SZ' || item.market === 'BJ');
}

function scoreRow(row: InstrumentState) {
  const signalScore = row.signals.filter((signal) => signal.active).reduce((sum, signal) => sum + signal.weight, 0);
  return signalScore + Math.abs(row.quote.changePct) * 5 + Math.abs(row.quote.speed) * 24;
}

function priceClass(value: number | null | undefined) {
  if ((value ?? 0) > 0) return 'up';
  if ((value ?? 0) < 0) return 'down';
  return '';
}

function sortSectorRows(rows: SectorRow[], sort: SectorSortKey) {
  return [...rows].sort((a, b) => {
    if (sort === 'money') {
      const aValue = a.source === 'eastmoney' ? a.mainNetInflow : a.amount;
      const bValue = b.source === 'eastmoney' ? b.mainNetInflow : b.amount;
      return bValue - aValue;
    }
    if (sort === 'breadth') {
      return (sectorBreadthRatio(b) ?? b.changePct / 100) - (sectorBreadthRatio(a) ?? a.changePct / 100);
    }
    return b.changePct - a.changePct;
  });
}

function sortHotSectorRows(rows: SectorRow[], sort: HotSectorSortKey) {
  if (sort === 'heat') {
    return [...rows].sort((a, b) => sectorHeatScore(b) - sectorHeatScore(a));
  }
  return sortSectorRows(rows, sort);
}

function sectorBreadthRatio(row: SectorRow) {
  const total = row.upCount + row.downCount + row.flatCount;
  return row.upCount + row.downCount > 0 && total > 0 ? row.upCount / total : null;
}

function sectorBreadthText(row: SectorRow) {
  const ratio = sectorBreadthRatio(row);
  return ratio === null ? `${row.flatCount || '--'}只` : `${(ratio * 100).toFixed(0)}%`;
}

function sectorHeatScore(row: SectorRow) {
  const momentum = clampNumber((row.changePct + 1) * 11, 0, 45);
  const breadth = sectorBreadthRatio(row);
  const breadthScore = breadth === null ? clampNumber((row.changePct + 2) * 3, 0, 15) : breadth * 20;
  const flowScore = row.source === 'eastmoney'
    ? clampNumber(Math.max(0, row.mainNetInflow) / maxSectorFlow.value * 20, 0, 20)
    : clampNumber(row.amount / maxSectorAmount.value * 10, 0, 10);
  const leaderScore = clampNumber(Math.max(0, row.leaderChangePct) * 1.5, 0, 15);
  const speedScore = clampNumber(Math.max(0, row.speed) * 10, 0, 10);
  return Math.round(momentum + breadthScore + flowScore + leaderScore + speedScore);
}

function sectorHeatLabel(row: SectorRow) {
  const score = sectorHeatScore(row);
  if (score >= 75) return '主线';
  if (score >= 60) return '强势';
  if (score >= 45) return '活跃';
  return '观察';
}

function sectorPulseLabel(row: SectorRow) {
  const breadth = sectorBreadthRatio(row);
  if (breadth !== null && breadth >= 0.7) return '全面扩散';
  if (row.source === 'eastmoney' && row.mainNetInflow > 0) return '资金流入';
  if (row.changePct >= 2) return '涨幅异动';
  return row.changePct >= 0 ? '局部活跃' : '弱势整理';
}

function hotStockHeatScore(row: HotStockRow) {
  const momentum = clampNumber(Math.max(0, row.changePct) * 4.5, 0, 45);
  const turnover = clampNumber(row.turnoverRate / 20 * 25, 0, 25);
  const amount = maxHotStockAmount.value > 1
    ? clampNumber(Math.log1p(row.amount) / Math.log1p(maxHotStockAmount.value) * 15, 0, 15)
    : 0;
  const volume = clampNumber(row.volumeRatio / 5 * 10, 0, 10);
  const speed = clampNumber(Math.max(0, row.speed) * 10, 0, 5);
  return Math.round(momentum + turnover + amount + volume + speed);
}

function hotStockHeatLabel(row: HotStockRow) {
  const score = hotStockHeatScore(row);
  if (score >= 75) return '高热';
  if (score >= 55) return '活跃';
  return '观察';
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toneForNumber(value: number | null | undefined) {
  return priceClass(value);
}

function stockLimitPct(code: string, name = '') {
  const normalizedName = name.toUpperCase();
  if (normalizedName.startsWith('N') || normalizedName.startsWith('C')) {
    return null;
  }

  if (normalizedName.includes('ST')) {
    return 5;
  }

  if (code.startsWith('8') || code.startsWith('4') || code.startsWith('920')) {
    return 30;
  }

  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('302') || code.startsWith('688') || code.startsWith('689')) {
    return 20;
  }

  return 10;
}

function timeframeLabel(value: Timeframe) {
  return timeframeOptions.find((item) => item.key === value)?.label ?? value;
}

function formatCandleDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function marketListTimeLabel(rows: Array<SectorRow | HotStockRow>) {
  const sourceUpdatedAt = Math.max(0, ...rows.map((row) => row.updatedAt));
  if (sourceUpdatedAt) return `行情 ${formatNewsTime(sourceUpdatedAt)}`;
  const fetchedAt = Math.max(0, ...rows.map((row) => row.fetchedAt));
  return fetchedAt ? `拉取 ${formatNewsTime(fetchedAt)}` : '无时间信息';
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(value >= 1000 ? 2 : 3);
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(value >= 100 ? 2 : 3)}`;
}

function formatNullable(value: number | null | undefined, digits: number) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(digits);
}

function formatAmount(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1)}亿`;
  }

  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toFixed(1)}万`;
  }

  return value.toFixed(0);
}

function formatFinancialAmount(value: number | null) {
  return value === null ? '--' : formatAmount(value);
}

function formatFinancialPct(value: number | null, signed = true) {
  if (value === null) {
    return '--';
  }
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatInteger(value: number | null) {
  return value === null ? '--' : Math.round(value).toLocaleString('zh-CN');
}

function formatRegisteredCapital(value: number | null) {
  return value === null ? '--' : formatAmount(value * 10_000);
}

function formatVolume(value: number) {
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)}万`;
  }

  return value.toFixed(0);
}

function formatNewsTime(value: number | null) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (sameDay) {
    return time;
  }

  return `${date.getMonth() + 1}-${date.getDate()} ${time}`;
}

function formatInfoDate(value: number | null) {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
</script>
