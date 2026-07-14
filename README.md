# BigA Monitor

Vue 3 + Electron 的轻量 A 股监盘端。当前包含新闻、市场监控、热门板块、热门股票、知识库和自选股工作区，支持真实行情、市场情绪、龙虎榜席位 B/S、资金流向、分时/K 线、盘口、指标、预警、个股 F10，以及基于真实日 K 的模式雷达、正反例、遮挡回放和本地错题本。

界面支持深色/浅色模式，以及金融金、量化蓝、墨玉青、朱砂红四套主题；外观设置本地持久化，A 股涨红跌绿语义保持固定。

完整的项目逻辑、API 字段、刷新策略和回退说明见 [项目逻辑与 API 说明](docs/PROJECT_ARCHITECTURE_AND_APIS.md)。每日功能变更见 [每日开发更新记录](docs/DAILY_CHANGELOG.md)。

## 运行

```bash
pnpm install
pnpm run dev
```

开发启动会优先使用 `6173`，如果端口被占用会自动顺延，并把实际地址传给 Electron。

开发时不需要先构建：`src/**` 由 Vite 热更新，`electron/**` 变更会自动重启 Electron。

只看 Web 工作区：

```bash
pnpm run dev:web
```

新闻默认走东方财富直连接口，网易财经作为兜底。需要额外启用 RSSHub 聚合源时，可以指定自建 RSSHub：

```bash
BIGA_RSSHUB_BASE_URL=http://127.0.0.1:1200 VITE_BIGA_ENABLE_RSSHUB_NEWS=1 pnpm run dev
```

## 本地打包

本地开发阶段不需要频繁构建。需要安装包时可以按平台打包：

```bash
pnpm run dist:mac
pnpm run dist:win
pnpm run dist:linux
```

项目不提供 GitHub Release 安装包。请从源码安装依赖后在本地运行，或按自己的系统环境执行上面的打包命令。

## 官网

官网静态页位于 `docs/site`，GitHub Pages 工作流会在 `main` 分支更新后自动部署。

官网不提供二进制下载，源码入口和本地运行方式位于页面末段。

## 扩展点

- `src/services/eastmoneyProvider.ts` 是当前真实行情源，东方财富负责快照/分时/K 线，新浪负责五档盘口；失败时保留上一帧/模拟兜底。
- `src/services/newsProvider.ts` 是当前新闻源，优先接东方财富快讯/资讯，网易财经兜底，可选接入 RSSHub 聚合并标准化为 `NewsItem`。
- `src/services/marketMonitorProvider.ts` 聚合全市场涨跌、涨跌停、龙虎榜和新浪行业/个股资金流向。
- `src/services/marketHistory.ts` 将市场情绪和行业资金按 5 分钟桶本地采集，用于复盘、连续流入和行业轮动分析。
- `src/services/marketTransport.ts` 除请求去重、重试与熔断外，还记录本次运行现场质量，并按日保存各数据主机近 90 天的成功率和延迟趋势。
- `src/services/sectorProvider.ts` 是板块与热门股数据层，东方财富为主，新浪行业、概念和排行接口回退。
- `src/services/knowledgeCaseAnalyzer.ts` 用明确规则筛选知识库案例，并输出 K 线标记、辅助线和教学解释。
- `src/services/knowledgePatternEngine.ts` 扫描六类量价/趋势模式，计算规则证据和后续 1/3/5/10 日表现；阈值可在规则实验室本地重算。
- `src/services/marketData.ts` 定义了模拟行情源，可作为离线 fallback 或测试源。
- `src/services/indicators.ts` 放指标计算和异动信号，避免 UI 组件里堆交易逻辑。
- `src/data/universe.ts` 当前为空股票池，后续可从你的计划里接入自选或策略结果。
- `src/components/KLineChart.vue` 负责分时线、K 线、教学标记和辅助线渲染，当前基于 `lightweight-charts`。
