export type KnowledgeCategory = 'basics' | 'volume' | 'orderbook' | 'shortTerm' | 'advanced' | 'risk';

export interface KnowledgeTerm {
  id: string;
  title: string;
  aliases: string[];
  category: KnowledgeCategory;
  level: '入门' | '进阶';
  weight: 1 | 2 | 3;
  summary: string;
  explanation: string;
  signals: string[];
  pitfall: string;
  example: string;
  related: string[];
}

export const KNOWLEDGE_CATEGORIES: Array<{ key: 'all' | KnowledgeCategory; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'basics', label: '基础概念' },
  { key: 'volume', label: '量价关系' },
  { key: 'orderbook', label: '盘口语言' },
  { key: 'shortTerm', label: '短线交易' },
  { key: 'advanced', label: '进阶认知' },
  { key: 'risk', label: '风险控制' }
];

export const TRADING_KNOWLEDGE: KnowledgeTerm[] = [
  {
    id: 'turnover-rate', title: '换手率', aliases: ['换手'], category: 'basics', level: '入门', weight: 3,
    summary: '一定时间内股票成交量占流通股本的比例，用来观察筹码交换活跃度。',
    explanation: '换手率高说明筹码交换充分，但不等于资金一定看多。它需要结合股价位置、成交额和历史常态比较。同样是 10% 换手，低位放量与高位爆量的含义可能完全不同。',
    signals: ['与该股近 20 日平均换手比较', '结合流通市值判断成交额是否真实活跃', '观察高换手后价格能否站稳'],
    pitfall: '把高换手直接理解成主力进场。买卖双方同时存在，高换手也可能是派发。',
    example: '一只股票平时换手约 2%，某日涨到 8% 且收在高位，说明关注度明显提升，但次日承接才决定强弱。',
    related: ['volume-ratio', 'volume-price-rise', 'chip-distribution']
  },
  {
    id: 'volume-ratio', title: '量比', aliases: [], category: 'basics', level: '入门', weight: 2,
    summary: '当前平均每分钟成交量与过去若干交易日同期平均成交量的比值。',
    explanation: '量比反映当天成交活跃度相对历史同期的变化。量比大于 1 通常表示放量，小于 1 表示缩量。开盘阶段数值容易剧烈波动，应随交易时间推进观察。',
    signals: ['早盘量比需配合开盘位置', '量比持续而非瞬间冲高更有参考性', '同时检查成交额绝对值'],
    pitfall: '只看量比排名追涨，忽略股票可能已在高位放量出货。',
    example: '上午 10 点量比 2.5，代表截至当前的平均分钟成交约为近期同期的 2.5 倍。',
    related: ['turnover-rate', 'volume-breakout', 'high-volume']
  },
  {
    id: 'amplitude', title: '振幅', aliases: [], category: 'basics', level: '入门', weight: 1,
    summary: '当日最高价与最低价相对昨收价的波动幅度。',
    explanation: '振幅描述日内价格活动范围。高振幅意味着机会和风险同时放大，常见于消息刺激、情绪博弈或流动性不足的股票。',
    signals: ['和该股历史平均振幅比较', '观察振幅扩大时成交量是否同步', '区分冲高回落和探底回升'],
    pitfall: '把振幅大当作趋势强。大幅震荡也可能只是多空分歧巨大。',
    example: '昨收 10 元，最高 10.8 元、最低 9.8 元，振幅约为 10%。',
    related: ['turnover-rate', 'intraday-t', 'stop-loss']
  },
  {
    id: 'limit-up', title: '涨停与跌停', aliases: ['涨停板', '跌停板'], category: 'basics', level: '入门', weight: 2,
    summary: '交易所对单日价格波动设置的限制，不同板块和特殊股票限制不同。',
    explanation: '主板普通股票通常为 10%，创业板和科创板通常为 20%，北交所通常为 30%，ST 股票通常为 5%。新股上市初期可能适用不同规则。',
    signals: ['确认股票所属板块和特别处理状态', '区分触板、封板与炸板', '查看封单和成交承接'],
    pitfall: '以为触及涨停就不能成交。涨停价仍可交易，只有卖盘不足时才难以买入。',
    example: '价格触及涨停后又回落称为炸板；一直封到收盘通常称为封板。',
    related: ['limit-break', 'board-trading', 'market-cycle']
  },
  {
    id: 'volume-price-rise', title: '量价齐升', aliases: ['价涨量增'], category: 'volume', level: '入门', weight: 3,
    summary: '股价上涨的同时成交量放大，表示上涨获得更多资金参与。',
    explanation: '健康的量价齐升通常表现为价格稳步抬高、成交量温和放大、回落时缩量。它更像趋势得到确认，而不是单凭一根放量阳线就下结论。',
    signals: ['价格突破关键位置并站稳', '成交量高于近期均量但不过度失控', '回踩时量能收缩且承接存在'],
    pitfall: '高位巨量长上影也属于价涨量增，但可能代表分歧和派发，并非健康上涨。',
    example: '股价突破 20 日平台，成交量为近 5 日均量的 1.8 倍，随后两日缩量守住平台，可信度更高。',
    related: ['volume-breakout', 'low-volume-pullback', 'volume-price-divergence']
  },
  {
    id: 'volume-breakout', title: '放量突破', aliases: [], category: 'volume', level: '入门', weight: 3,
    summary: '价格突破压力位时成交量明显高于近期平均水平。',
    explanation: '放量意味着更多筹码在关键价位完成交换。有效突破通常还需要收盘站稳、后续不快速跌回原区间，并有板块或市场环境配合。',
    signals: ['标出前高、平台或均线压力', '比较突破量和近期均量', '等待收盘或回踩确认'],
    pitfall: '盘中刚越过前高就追入，忽略收盘回落形成假突破。',
    example: '前高 12 元，股价放量收于 12.3 元；次日回踩 12 元附近缩量企稳，突破质量较好。',
    related: ['volume-price-rise', 'low-volume-pullback', 'support-resistance']
  },
  {
    id: 'low-volume-pullback', title: '缩量回调', aliases: [], category: 'volume', level: '入门', weight: 2,
    summary: '上涨后价格回落，但成交量较上涨阶段明显减少。',
    explanation: '缩量回调常被理解为主动抛压有限，但前提是趋势和关键支撑尚未破坏。如果持续阴跌且无人承接，缩量也可能代表关注度消失。',
    signals: ['回调量低于上涨阶段均量', '关键支撑未被有效跌破', '止跌时出现承接或重新放量'],
    pitfall: '认为所有缩量下跌都安全。弱势股缩量阴跌可能持续很久。',
    example: '突破平台后回踩三天，成交量逐日减少且收盘始终在平台上方，可继续观察承接。',
    related: ['volume-price-rise', 'volume-breakout', 'support-resistance']
  },
  {
    id: 'volume-price-divergence', title: '量价背离', aliases: [], category: 'volume', level: '进阶', weight: 2,
    summary: '价格走势与成交量变化不再相互确认，例如价格创新高而量能萎缩。',
    explanation: '背离是警示而非立即反转信号。上涨缩量可能说明追价意愿减弱，下跌缩量也可能只是卖压减轻，需要等待价格结构确认。',
    signals: ['比较相邻高点或低点的量能', '确认是否同时出现动能指标背离', '观察关键位置是否失守'],
    pitfall: '看到背离就立刻反向交易，忽略强趋势可以多次背离。',
    example: '指数连续创新高，但成交额逐波下降且上涨家数减少，说明上涨广度和参与度走弱。',
    related: ['volume-price-rise', 'high-volume', 'sector-effect']
  },
  {
    id: 'high-volume', title: '天量', aliases: ['巨量'], category: 'volume', level: '进阶', weight: 1,
    summary: '成交量达到较长周期内的极高水平，说明筹码发生剧烈交换。',
    explanation: '天量没有固定数值，要与该股自身历史比较。低位天量可能是资金介入，高位天量可能是分歧或派发，核心看天量之后价格往哪走。',
    signals: ['对比半年或一年成交量分位', '记录天量 K 线高低点', '观察后续是否缩量站稳'],
    pitfall: '把天量直接等同于见顶或启动。它只说明交易异常拥挤。',
    example: '高位天量长阴后数日无法收复，风险含义通常高于低位天量阳线。',
    related: ['turnover-rate', 'volume-price-divergence', 'chip-distribution']
  },
  {
    id: 'bs-point', title: 'B/S 点', aliases: ['BS', '买卖点'], category: 'orderbook', level: '入门', weight: 3,
    summary: 'B 通常表示 Buy，S 通常表示 Sell，用于标注买入侧和卖出侧事件。',
    explanation: '不同软件的 B/S 含义并不完全相同：可能是用户真实成交记录、逐笔主动买卖方向、算法信号，或龙虎榜席位的历史标记。必须先确认数据来源，不能把算法推演当成机构真实成交时点。',
    signals: ['查看图例和数据来源说明', '区分真实成交、主动方向和算法信号', '结合价格位置与成交量验证'],
    pitfall: '看到 B 就买、看到 S 就卖，或把推演点误认为某机构的精确下单记录。',
    example: '本客户端龙虎榜分时中的 B*/S* 是按公开席位金额和真实逐笔方向推演，并非席位分钟级成交披露。',
    related: ['inner-outer-volume', 'dragon-tiger-list', 'large-order-flow']
  },
  {
    id: 'inner-outer-volume', title: '内盘与外盘', aliases: ['内外盘'], category: 'orderbook', level: '入门', weight: 2,
    summary: '通常按成交价靠近买价或卖价，将成交归为主动卖出或主动买入。',
    explanation: '外盘常被视为主动买入，内盘常被视为主动卖出，但它只是成交方向分类，无法识别真实账户意图，也会受快速撤单、价格跳动和撮合规则影响。',
    signals: ['观察内外盘的持续差而非单笔', '配合价格是否同步上行或下行', '注意集合竞价和极端盘口失真'],
    pitfall: '用外盘大于内盘直接判断主力吸筹。方向统计不等于资金身份。',
    example: '外盘持续增加但股价不涨，可能说明上方卖压很重，不能只看外盘数字。',
    related: ['bs-point', 'order-book', 'large-order-flow']
  },
  {
    id: 'order-book', title: '五档盘口', aliases: ['买五卖五'], category: 'orderbook', level: '入门', weight: 2,
    summary: '展示当前最接近成交价的五档买入和卖出委托。',
    explanation: '五档反映此刻挂单，不代表一定成交。大单可以快速撤销，真正的强弱要看挂单变化、实际成交、价格推进和持续时间。',
    signals: ['观察挂单是否持续而非瞬时出现', '比较成交穿透某档位的速度', '结合逐笔成交判断主动方向'],
    pitfall: '把大买单当成绝对支撑。未成交挂单随时可以撤走。',
    example: '卖一持续被主动成交消耗且价格逐档上移，比单纯看到买一大单更能体现主动性。',
    related: ['inner-outer-volume', 'large-order-flow', 'bs-point']
  },
  {
    id: 'large-order-flow', title: '主力净流入', aliases: ['大单净流入'], category: 'orderbook', level: '进阶', weight: 2,
    summary: '数据商按成交单规模和方向估算的大额资金净买卖值。',
    explanation: '这是模型统计，不是交易所公布的“主力账户流水”。不同平台对大单阈值和主动方向的算法不同，因此数值可能不一致。更适合观察趋势和相对强弱。',
    signals: ['确认数据商和大单划分标准', '连续多日比单日突增更有参考性', '检查净流入时价格是否同步走强'],
    pitfall: '把主力净流入当作可验证的机构买入金额，或者忽略大单拆单行为。',
    example: '连续三日大单净流入且价格抬高，比单日净流入但冲高回落更值得跟踪。',
    related: ['bs-point', 'inner-outer-volume', 'dragon-tiger-list']
  },
  {
    id: 'intraday-t', title: '日内做 T', aliases: ['做T', 'T+0'], category: 'shortTerm', level: '入门', weight: 3,
    summary: '利用已有底仓在同一天高卖低买或低买高卖，降低持仓成本或兑现波动。',
    explanation: 'A 股股票实行 T+1，当天新买的股票通常不能当天卖出。所谓日内做 T，是先持有可卖底仓，再利用等量或部分仓位完成日内差价，最终可保持总仓位不变。',
    signals: ['先确认有可卖底仓', '计算手续费与预期价差', '围绕明确支撑、压力和分时偏离操作'],
    pitfall: '无底仓误以为能当天买卖；为几分钱频繁交易；卖出后股价单边上涨导致丢失仓位。',
    example: '已有 1000 股，盘中高位卖出 300 股，回落后买回 300 股，完成正 T；反向顺序通常称倒 T。',
    related: ['amplitude', 'support-resistance', 'position-management']
  },
  {
    id: 'rumor-note', title: '小作文', aliases: ['传闻'], category: 'shortTerm', level: '入门', weight: 3,
    summary: '在社交平台或群聊传播、缺乏正式来源验证的消息或逻辑文章。',
    explanation: '小作文可能包含真实线索，也可能是过时信息、夸大解读甚至操纵情绪的内容。交易上应核对公告、监管披露、公司互动平台和权威媒体，尤其警惕盘中突然传播的截图。',
    signals: ['检查原始出处、发布时间和完整上下文', '搜索公司公告与监管披露', '观察是否只有截图而无可验证链接'],
    pitfall: '先买后核实，或因内容写得专业就默认真实。消息兑现时也可能出现利好出尽。',
    example: '群聊称某公司获得大订单，但公告和互动平台均无披露，应按未证实传闻处理。',
    related: ['expectation', 'event-risk', 'dragon-tiger-list']
  },
  {
    id: 'board-trading', title: '打板', aliases: [], category: 'shortTerm', level: '进阶', weight: 2,
    summary: '在股票接近或达到涨停价时买入，博弈封板和次日溢价。',
    explanation: '打板交易关注封板质量、市场情绪、板块地位、成交结构和次日预期，风险集中且节奏快。它不是“涨停就买”，更不适合缺乏纪律的新手。',
    signals: ['确认板块强度和个股辨识度', '观察首封时间、开板次数和回封力度', '预先定义次日不及预期的处理'],
    pitfall: '排板成交后忽略炸板风险，或在情绪退潮期机械追涨停。',
    example: '同板块多股涨停、龙头率先封板且换手充分，和尾盘孤立偷板的交易质量不同。',
    related: ['limit-break', 'market-cycle', 'weak-to-strong']
  },
  {
    id: 'limit-break', title: '炸板', aliases: ['开板'], category: 'shortTerm', level: '入门', weight: 2,
    summary: '股票曾封住涨停，但随后卖盘增加导致涨停价被打开。',
    explanation: '炸板代表涨停价附近供给超过承接。一次快速开板后强力回封，与反复开板、放量回落的含义不同，需要结合市场情绪和个股地位判断。',
    signals: ['统计开板次数与持续时间', '观察回封速度和成交量', '比较同板块其他股票表现'],
    pitfall: '看到回封就认定风险解除。反复炸板往往意味着分歧持续扩大。',
    example: '早盘首封后一分钟内回封，通常强于尾盘反复开板且封单不断减少。',
    related: ['board-trading', 'limit-up', 'market-cycle']
  },
  {
    id: 'weak-to-strong', title: '弱转强', aliases: [], category: 'shortTerm', level: '进阶', weight: 2,
    summary: '个股原本表现低于预期，随后在竞价或盘中转为明显强于预期。',
    explanation: '弱转强的核心是预期差，不是单纯从下跌变上涨。常见观察包括前一日分歧、次日竞价承接、开盘快速修复以及板块配合。',
    signals: ['先定义市场原本的弱预期', '观察竞价量价和开盘承接', '确认强势能否持续而非瞬间脉冲'],
    pitfall: '事后把任何反弹都称为弱转强，缺少事前预期基准。',
    example: '前一日炸板回落，次日却高开并迅速放量回封，才具备典型的超预期特征。',
    related: ['expectation', 'board-trading', 'market-cycle']
  },
  {
    id: 'dragon-tiger-list', title: '龙虎榜', aliases: [], category: 'advanced', level: '入门', weight: 3,
    summary: '交易所披露达到特定异常交易条件股票的买卖营业部或机构席位数据。',
    explanation: '龙虎榜不是全市场资金明细，只覆盖触发披露条件的股票和上榜席位。机构专用席位通常匿名，同名营业部也不等于固定自然人，数据更适合研究资金结构和市场偏好。',
    signals: ['查看上榜原因和披露口径', '区分机构、沪深股通和营业部', '比较买卖净额占当日成交额比例'],
    pitfall: '盲目跟随知名席位，或把营业部别名当作某位交易者身份的确证。',
    example: '净买额很大但仅占当日成交额很小比例时，对价格的解释力可能有限。',
    related: ['bs-point', 'large-order-flow', 'turnover-rate']
  },
  {
    id: 'market-cycle', title: '情绪周期', aliases: ['短线周期'], category: 'advanced', level: '进阶', weight: 3,
    summary: '短线资金风险偏好在冰点、修复、发酵、高潮和退潮之间循环变化。',
    explanation: '情绪周期不是固定天数公式，而是对涨跌停数量、连板高度、炸板率、亏钱效应和主线扩散的综合描述。它帮助判断同一交易模式在不同环境下的胜率差异。',
    signals: ['观察涨停、跌停、炸板和连板高度', '跟踪昨日强势股次日反馈', '判断主线是扩散还是收缩'],
    pitfall: '机械套用周期名称，忽略指数、容量趋势和突发事件对节奏的改变。',
    example: '高位股连续大跌、炸板率升高、昨日涨停普遍低开，通常体现退潮特征。',
    related: ['board-trading', 'weak-to-strong', 'sector-effect']
  },
  {
    id: 'sector-effect', title: '板块效应', aliases: ['联动'], category: 'advanced', level: '入门', weight: 2,
    summary: '同一行业或概念的多只股票因共同逻辑出现同步上涨或下跌。',
    explanation: '板块效应能提高个股行情的持续性。通常需要观察龙头、涨停家数、上涨覆盖度、成交额和后排反馈，而不是只看板块指数涨幅。',
    signals: ['是否有明确领涨核心', '上涨是否从少数个股向板块扩散', '中军和后排是否提供正反馈'],
    pitfall: '把个股独立上涨硬贴成板块主线，或在后排大面积掉队时继续追高。',
    example: '龙头涨停、中军放量上涨、板块多数股票翻红，说明联动强于只有一只股票冲板。',
    related: ['market-cycle', 'expectation', 'dragon-tiger-list']
  },
  {
    id: 'expectation', title: '预期差', aliases: ['超预期', '不及预期'], category: 'advanced', level: '进阶', weight: 3,
    summary: '真实结果或市场表现与参与者原有预期之间的差异。',
    explanation: '股价交易的是预期而不只是事实。利好公布后下跌，可能是利好已提前反映；业绩一般但好于悲观预期，也可能上涨。判断预期差必须先明确市场已经在价格中计入了什么。',
    signals: ['比较公告结果与一致预期', '观察消息前股价是否已提前运行', '关注消息后开盘和承接反馈'],
    pitfall: '只判断消息本身好坏，不考虑价格位置和市场此前预期。',
    example: '公司利润增长 50% 看似利好，但市场原本预期增长 80%，股价仍可能按不及预期交易。',
    related: ['weak-to-strong', 'rumor-note', 'market-cycle']
  },
  {
    id: 'chip-distribution', title: '筹码集中', aliases: ['筹码结构'], category: 'advanced', level: '进阶', weight: 2,
    summary: '持仓成本或股东持股分布趋于集中，用于描述潜在抛压与持仓稳定性。',
    explanation: '软件筹码峰通常由成交数据估算，并非账户级真实持仓。股东户数下降也有披露周期，不能据此精确推断主力成本。筹码分析应作为价格与成交结构的补充。',
    signals: ['明确数据是估算筹码还是定期股东户数', '观察集中过程中的价格趋势', '结合套牢盘和获利盘位置'],
    pitfall: '把估算筹码峰当成真实主力成本线，认为跌到该位置必然反弹。',
    example: '股价长期横盘并充分换手后突破，原平台常成为重要筹码交换区，但不是绝对支撑。',
    related: ['turnover-rate', 'high-volume', 'support-resistance']
  },
  {
    id: 'position-management', title: '仓位管理', aliases: [], category: 'risk', level: '入门', weight: 3,
    summary: '根据机会质量和可承受风险，决定单笔与总账户投入比例。',
    explanation: '仓位管理先解决“错了亏多少”，再考虑“对了赚多少”。常见方法包括单笔风险预算、分批建仓和相关性控制，避免多个同板块持仓形成隐性重仓。',
    signals: ['交易前计算止损距离和最大亏损', '限制单一个股与单一方向暴露', '连续亏损时主动降低仓位'],
    pitfall: '用满仓表达信心，或亏损后加仓试图快速回本。',
    example: '账户可接受单笔亏损 1%，止损距离为 5%，理论仓位上限约为账户的 20%，还需考虑滑点。',
    related: ['stop-loss', 'intraday-t', 'liquidity-risk']
  },
  {
    id: 'stop-loss', title: '止损', aliases: ['风控线'], category: 'risk', level: '入门', weight: 3,
    summary: '当交易逻辑失效或亏损达到预设范围时退出，控制单次损失。',
    explanation: '止损可以基于价格结构、波动率、时间或账户风险预算。关键是入场前定义失效条件，并考虑跳空和流动性导致的实际成交偏差。',
    signals: ['止损位对应明确逻辑失效', '仓位与止损距离匹配', '执行后复盘而非立即报复性交易'],
    pitfall: '把任意固定百分比套在所有股票上，或价格触发后临时下移止损。',
    example: '按平台突破买入，若收盘重新跌回平台且无法修复，交易前提失效，比“亏到受不了再卖”更清晰。',
    related: ['position-management', 'support-resistance', 'liquidity-risk']
  },
  {
    id: 'liquidity-risk', title: '流动性风险', aliases: [], category: 'risk', level: '进阶', weight: 2,
    summary: '想买卖时无法按预期价格和数量成交的风险。',
    explanation: '小成交额股票、跌停、突发事件和极端行情中，盘口深度可能快速消失。回测中的价格不代表实盘一定成交，仓位越大，冲击成本通常越高。',
    signals: ['检查日均成交额和盘口深度', '估算仓位占日成交额比例', '为跳空、跌停和滑点留出余量'],
    pitfall: '只按账面价格计算风险，忽略卖不出去或成交价格大幅偏离。',
    example: '持仓金额占股票日成交额比例过高时，即使判断正确，退出也可能显著压低成交均价。',
    related: ['position-management', 'stop-loss', 'order-book']
  },
  {
    id: 'event-risk', title: '事件风险', aliases: ['黑天鹅'], category: 'risk', level: '进阶', weight: 1,
    summary: '公告、监管、业绩、政策或突发消息导致价格跳空和逻辑突变。',
    explanation: '事件风险往往无法依靠盘中止损完全规避，因为信息可能在收盘后出现。财报窗口、重大事项停牌和高传闻密度阶段，应通过仓位而非预测来控制暴露。',
    signals: ['查看财报和解禁等重要日历', '检查公告与监管问询', '传闻驱动时降低确定性假设'],
    pitfall: '认为设置止损单就能覆盖隔夜跳空或连续跌停风险。',
    example: '满仓跨越业绩披露，即使设置止损，次日大幅低开也可能远低于计划价格成交。',
    related: ['rumor-note', 'position-management', 'stop-loss']
  },
  {
    id: 'support-resistance', title: '支撑与压力', aliases: ['支撑位', '压力位'], category: 'risk', level: '入门', weight: 2,
    summary: '历史交易密集或多空反复博弈形成的潜在承接区与抛压区。',
    explanation: '支撑和压力更适合看作区域而非精确点位。被反复测试会消耗挂单，真正有效与否要看触及时的成交量、收盘位置和后续反馈。',
    signals: ['标记前高前低和成交密集区', '观察触及区域时量价反应', '突破后检查角色是否互换'],
    pitfall: '认为画出一条线就必然反弹或回落，忽略市场环境和放量穿透。',
    example: '原平台上沿突破后回踩企稳，过去的压力区可能转化为新的支撑区。',
    related: ['volume-breakout', 'low-volume-pullback', 'stop-loss']
  },
  {
    id: 'call-auction', title: '集合竞价', aliases: ['竞价'], category: 'basics', level: '入门', weight: 3,
    summary: '交易所集中撮合买卖申报并确定开盘价或收盘价的交易阶段。',
    explanation: 'A 股开盘集合竞价主要发生在 9:15 至 9:25，其中后半段撤单规则不同。竞价价格、匹配量和未匹配量能反映开盘前供需，但单次挂单仍可能具有迷惑性。',
    signals: ['比较竞价涨幅与昨日收盘结构', '观察匹配量而非只看挂单金额', '结合 9:25 后开盘承接'],
    pitfall: '只凭 9:15 的高开幅度判断强弱，忽略可撤单阶段的虚假申报。',
    example: '竞价高开且匹配量显著放大，开盘后仍能守住竞价低点，通常比高开后立即下杀更强。',
    related: ['weak-to-strong', 'order-book', 'expectation']
  },
  {
    id: 'market-cap', title: '总市值与流通市值', aliases: ['市值'], category: 'basics', level: '入门', weight: 2,
    summary: '总市值覆盖全部股份，流通市值只计算当前可交易股份。',
    explanation: '市值影响资金容量、价格弹性和指数权重。流通市值较小的股票更容易被有限资金推动，也更容易出现流动性和波动风险。',
    signals: ['区分总股本与实际流通股本', '比较成交额占流通市值比例', '关注限售股解禁变化'],
    pitfall: '用股价高低判断公司贵不贵，忽略股本规模和估值。',
    example: '10 元、100 亿股的公司市值远高于 100 元、1 亿股的公司。',
    related: ['turnover-rate', 'liquidity-risk', 'valuation']
  },
  {
    id: 'valuation', title: 'PE 与 PB', aliases: ['市盈率', '市净率', '估值'], category: 'basics', level: '入门', weight: 2,
    summary: 'PE 比较市值与利润，PB 比较市值与净资产，是常见相对估值指标。',
    explanation: '估值必须结合行业、盈利质量、增长和周期位置。亏损企业的 PE 可能失效，金融和重资产行业常更多参考 PB，不能跨行业机械比较。',
    signals: ['确认使用静态、滚动还是预测口径', '与自身历史和同行比较', '检查利润是否含一次性损益'],
    pitfall: '认为低 PE 必然便宜、高 PE 必然泡沫，忽略利润趋势和资产质量。',
    example: '周期行业利润高点时 PE 可能看似很低，但若利润即将回落，低 PE 可能是周期陷阱。',
    related: ['market-cap', 'expectation', 'event-risk']
  },
  {
    id: 'ex-rights', title: '除权除息', aliases: ['除权', '除息', '复权'], category: 'basics', level: '入门', weight: 1,
    summary: '分红送转后对股价进行技术调整，使公司价值变化在价格上得到对应反映。',
    explanation: '现金分红会导致除息参考价下降，送转股会改变股本和每股价格。分析长期 K 线通常使用前复权或后复权，避免把技术调整误判为真实暴跌。',
    signals: ['查看分红送转公告与除权日', '确认图表使用何种复权口径', '比较总回报而非只看裸价格'],
    pitfall: '把除息形成的价格缺口当成亏损，或混用不同复权口径计算涨跌。',
    example: '10 元股票每股派息 0.5 元，除息参考价约为 9.5 元，不代表开盘瞬间凭空亏损 5%。',
    related: ['valuation', 'support-resistance', 'event-risk']
  },
  {
    id: 't-plus-one', title: 'T+1', aliases: ['隔日交易'], category: 'basics', level: '入门', weight: 2,
    summary: '当天买入的 A 股股票通常要到下一个交易日才能卖出。',
    explanation: 'T+1 限制的是当日新买股份的卖出，但当天卖出已有持仓后所得资金通常可以继续买入。ETF、可转债等品种可能适用不同规则。',
    signals: ['下单前确认品种交易制度', '区分可用资金与可卖股份', '隔夜仓位考虑跳空风险'],
    pitfall: '买入后发现当日无法止损，或把所有证券品种都按股票 T+1 理解。',
    example: '周一买入普通 A 股，通常周二才能卖出；已有底仓则可通过等量买卖完成做 T。',
    related: ['intraday-t', 'position-management', 'event-risk']
  },
  {
    id: 'price-rise-volume-fall', title: '价涨量缩', aliases: ['缩量上涨'], category: 'volume', level: '进阶', weight: 2,
    summary: '价格继续上涨，但成交量低于此前上涨阶段。',
    explanation: '价涨量缩既可能表示抛压很轻，也可能表示追价资金不足。趋势初期与高位末端的解释不同，应结合换手、市场广度和后续放量方向判断。',
    signals: ['比较价格位置和趋势阶段', '观察上涨家数与板块联动', '等待后续放量确认方向'],
    pitfall: '固定把缩量上涨解释成惜售或背离，不考虑所处位置。',
    example: '突破后连续小阳缩量且回撤很浅，可能是抛压有限；高位加速后缩量新高则需警惕动能下降。',
    related: ['volume-price-divergence', 'volume-price-rise', 'market-cycle']
  },
  {
    id: 'price-fall-volume-rise', title: '价跌量增', aliases: ['放量下跌'], category: 'volume', level: '入门', weight: 2,
    summary: '价格下跌同时成交量放大，说明卖压和分歧明显增加。',
    explanation: '放量下跌通常偏弱，但低位恐慌放量后快速收回也可能形成筹码交换。关键看收盘位置、支撑是否失守以及之后是否出现修复。',
    signals: ['判断是否跌破关键结构', '观察放量 K 线收盘位置', '跟踪次日是否继续放量下跌'],
    pitfall: '看到低位放量就立即抄底，忽略下跌趋势可能刚开始。',
    example: '放量长阴跌破平台且次日无法收回，通常比盘中下探后长下影收复更弱。',
    related: ['high-volume', 'stop-loss', 'support-resistance']
  },
  {
    id: 'volume-cluster', title: '堆量', aliases: ['量堆'], category: 'volume', level: '进阶', weight: 1,
    summary: '一段时间成交量连续维持在高于此前常态的水平，形成明显量能台阶。',
    explanation: '堆量说明持续有资金参与和筹码交换，比单日脉冲更有连续性。向上堆量但价格不涨也可能表示上方供给沉重。',
    signals: ['比较连续多日量能与历史基准', '观察价格重心是否同步抬升', '记录堆量区间高低点'],
    pitfall: '只要连续放量就视为吸筹，忽略高位放量滞涨。',
    example: '五日成交量均为此前均量两倍且价格稳步上移，比单日巨量后迅速缩回更具持续性。',
    related: ['volume-price-rise', 'high-volume', 'chip-distribution']
  },
  {
    id: 'commission-ratio', title: '委比与委差', aliases: ['委比', '委差'], category: 'orderbook', level: '入门', weight: 2,
    summary: '比较一定档位内买卖委托数量的差异，用于描述当前挂单倾向。',
    explanation: '委差是买盘委托量减卖盘委托量，委比是差额占买卖委托总量的比例。它们只反映未成交挂单，容易受撤单和大额虚挂影响。',
    signals: ['观察数值是否持续', '配合实际成交和价格推进', '留意关键价位挂单变化'],
    pitfall: '委比为正就认定会上涨，忽略挂单可以撤销且不代表真实成交意愿。',
    example: '委比很高但价格持续下跌，说明表面买单未能转化为有效承接。',
    related: ['order-book', 'inner-outer-volume', 'sweep-order']
  },
  {
    id: 'price-speed', title: '涨速', aliases: ['涨跌速度'], category: 'orderbook', level: '入门', weight: 2,
    summary: '股票在短时间窗口内价格变化的速度，用于捕捉盘中异动。',
    explanation: '涨速强调变化快慢而非当日累计涨幅。高涨速能提示资金突然行动，但也常出现在流动性较差或冲高回落阶段。',
    signals: ['同时检查成交额和盘口深度', '观察涨速是否带动板块联动', '区分首次异动与末端加速'],
    pitfall: '仅凭涨速榜追入，忽略价格位置、流动性和持续承接。',
    example: '两分钟上涨 3% 但成交额很小，与大成交额股票持续放量推升的可交易性不同。',
    related: ['amplitude', 'sector-effect', 'sweep-order']
  },
  {
    id: 'sweep-order', title: '扫单与砸单', aliases: ['扫货', '砸盘'], category: 'orderbook', level: '进阶', weight: 2,
    summary: '主动买单连续吃掉卖档称扫单，主动卖单连续打穿买档常称砸单。',
    explanation: '扫单和砸单描述成交行为，不直接识别账户身份。观察重点是价格是否逐档推进、成交是否连续，以及被打穿后是否快速补单。',
    signals: ['逐笔成交方向是否连续', '盘口档位是否被真实消耗', '动作后价格能否维持'],
    pitfall: '把几笔大额成交都称作主力扫货，忽略对倒和流动性差异。',
    example: '卖一到卖五被连续主动买单成交且价格上移，才比单笔大买单更接近扫单特征。',
    related: ['order-book', 'inner-outer-volume', 'large-order-flow']
  },
  {
    id: 'seal-order', title: '封单', aliases: ['封板资金'], category: 'orderbook', level: '进阶', weight: 2,
    summary: '涨停价上的未成交买单或跌停价上的未成交卖单。',
    explanation: '封单大小需相对流通市值、成交额和可见卖压判断。封单会变化和撤销，绝对金额不能单独代表次日溢价。',
    signals: ['比较封单与当日成交额', '观察封单增减和撤单速度', '结合封板时间与开板次数'],
    pitfall: '认为封单越大越安全，忽略一致预期过强时次日也可能兑现。',
    example: '早盘缩量封板且封单稳定，与尾盘勉强回封、封单反复减少的质量不同。',
    related: ['limit-up', 'limit-break', 'board-trading']
  },
  {
    id: 'first-board', title: '首板', aliases: ['一板'], category: 'shortTerm', level: '入门', weight: 2,
    summary: '一轮行情中股票首次涨停，是短线资金确认新方向的常见观察点。',
    explanation: '首板数量很多，质量取决于题材新鲜度、板块联动、封板结构和个股地位。首板只是结果标签，不自动意味着次日有溢价。',
    signals: ['判断是否为板块最早响应', '观察成交量与封板时间', '检查公告和消息来源'],
    pitfall: '把所有首板视为同等机会，忽略后排跟风和消息真实性。',
    example: '新题材中率先放量涨停并带动板块的首板，辨识度通常高于尾盘孤立涨停。',
    related: ['board-trading', 'sector-effect', 'market-cycle']
  },
  {
    id: 'leader-stock', title: '龙头股', aliases: ['龙头'], category: 'shortTerm', level: '进阶', weight: 3,
    summary: '在一轮题材或趋势行情中，对板块情绪和价格具有显著带动作用的核心股票。',
    explanation: '龙头不是单看涨幅或连板数，而是综合启动时间、带动性、流动性、辨识度和逆势承接。龙头地位会动态变化。',
    signals: ['板块分歧时是否率先修复', '上涨时能否带动同方向扩散', '成交容量能否承接主流资金'],
    pitfall: '事后把最高板叫龙头，或认为龙头永远不会补跌。',
    example: '板块回落时核心股保持强承接，随后率先创新高并带动同板块回流，更体现龙头作用。',
    related: ['sector-effect', 'market-cycle', 'capacity-core']
  },
  {
    id: 'capacity-core', title: '容量核心', aliases: ['中军'], category: 'shortTerm', level: '进阶', weight: 2,
    summary: '成交额大、流动性好，能够承载较大资金并代表板块趋势的核心股票。',
    explanation: '容量核心未必连续涨停，但其成交和趋势常决定板块能否容纳机构与大资金。它与高弹性小票龙头可能同时存在、分工不同。',
    signals: ['成交额位居板块前列', '走势对板块指数贡献明显', '分歧时有持续流动性承接'],
    pitfall: '把市值大或成交额大自动等同于核心，忽略板块影响力。',
    example: '小票负责打开高度，大成交额股票稳步上行并承载资金，二者可能共同构成板块核心结构。',
    related: ['leader-stock', 'sector-effect', 'liquidity-risk']
  },
  {
    id: 'nuclear-button', title: '核按钮', aliases: ['按核'], category: 'shortTerm', level: '进阶', weight: 1,
    summary: '短线语境中指开盘或盘中集中快速卖出，导致价格剧烈下挫。',
    explanation: '核按钮通常出现在预期转弱、情绪退潮或隔夜持仓争相兑现时。它是市场行为描述，不是正式订单类型。',
    signals: ['竞价明显低于预期', '开盘卖单集中且承接不足', '同类高位股同步走弱'],
    pitfall: '看到低开就机械卖出，或在流动性不足时使用过大市价委托。',
    example: '高位股竞价大幅低开，开盘后同板块多股快速跌停，常体现集中风险释放。',
    related: ['market-cycle', 'liquidity-risk', 'position-management']
  },
  {
    id: 'trend', title: '趋势', aliases: ['上升趋势', '下降趋势'], category: 'advanced', level: '入门', weight: 3,
    summary: '价格高低点在一段时间内呈现有方向的持续结构。',
    explanation: '上升趋势通常表现为高点和低点逐步抬高，下降趋势相反。均线只是趋势的平滑描述，趋势是否破坏仍要看价格结构和周期。',
    signals: ['识别高低点是否同向移动', '选择明确观察周期', '用成交量和板块强度交叉验证'],
    pitfall: '周期混用：日线下降却用一分钟反弹证明趋势反转。',
    example: '日线低点持续抬高且回调不破前低，比仅站上一条均线更能说明结构改善。',
    related: ['support-resistance', 'mean-reversion', 'volume-price-rise']
  },
  {
    id: 'mean-reversion', title: '均值回归', aliases: ['回归均值'], category: 'advanced', level: '进阶', weight: 2,
    summary: '价格或指标大幅偏离常态后，倾向向历史平均水平靠拢的统计现象。',
    explanation: '均值回归不是必然反转。基本面重估或强趋势会使均值本身移动，因此需要定义周期、偏离程度和失效条件。',
    signals: ['明确使用的均值与观察周期', '测量偏离是否达到历史极端', '等待动能衰减或结构确认'],
    pitfall: '价格越跌越买，假设所有偏离都会回归旧均值。',
    example: '震荡市场中价格远离 20 日均线后常回靠，但趋势加速阶段可能长期保持偏离。',
    related: ['trend', 'volume-price-divergence', 'stop-loss']
  },
  {
    id: 'market-breadth', title: '市场广度', aliases: ['涨跌家数'], category: 'advanced', level: '进阶', weight: 2,
    summary: '用上涨家数、下跌家数、新高新低等衡量行情参与范围。',
    explanation: '指数上涨但多数股票下跌，说明行情集中在少数权重；指数涨幅一般但上涨家数广，体感可能更好。广度可用于验证指数趋势健康度。',
    signals: ['比较上涨与下跌家数', '跟踪创新高和创新低数量', '观察广度是否领先指数转弱'],
    pitfall: '只看指数涨跌判断整个市场强弱。',
    example: '指数创新高而上涨家数持续减少，是趋势参与度收窄的警示，但不是立即见顶结论。',
    related: ['market-cycle', 'sector-effect', 'volume-price-divergence']
  },
  {
    id: 'catalyst', title: '催化剂', aliases: ['催化'], category: 'advanced', level: '进阶', weight: 2,
    summary: '可能改变盈利预期、估值或资金关注度的新增事件。',
    explanation: '催化剂包括政策、订单、产品、业绩和行业价格变化。有效催化需要区分新增信息与已知信息，并评估兑现时间和业绩弹性。',
    signals: ['确认信息首次出现时间', '评估对收入利润的传导路径', '观察板块和资金反馈'],
    pitfall: '把所有新闻都称作催化，忽略市场已经提前交易或事件无法落到利润。',
    example: '行业产品涨价只有在公司有对应产能和议价能力时，才可能转化为实质盈利催化。',
    related: ['expectation', 'rumor-note', 'event-risk']
  },
  {
    id: 'drawdown', title: '最大回撤', aliases: ['回撤'], category: 'risk', level: '入门', weight: 3,
    summary: '资产净值从某个历史高点下降到随后低点的最大幅度。',
    explanation: '最大回撤衡量策略或账户曾经承受的下行压力。相同收益率下，回撤更小、恢复时间更短的策略通常更容易长期执行。',
    signals: ['同时记录回撤幅度与持续时间', '区分单笔亏损和组合回撤', '根据回撤阶段调整风险暴露'],
    pitfall: '只看年化收益忽略实现过程中可能无法承受的亏损。',
    example: '净值从 1.20 降至 0.90，阶段回撤为 25%，之后回到 1.20 才完成修复。',
    related: ['position-management', 'stop-loss', 'risk-reward']
  },
  {
    id: 'risk-reward', title: '盈亏比', aliases: ['风险收益比', 'R倍数'], category: 'risk', level: '入门', weight: 3,
    summary: '计划盈利空间与可能亏损空间的比例，用于评估交易是否值得承担风险。',
    explanation: '盈亏比必须和胜率一起看。高盈亏比策略可以容忍较低胜率，高胜率策略若偶尔巨亏仍可能失效。实际结果还会受滑点和执行影响。',
    signals: ['入场前标出失效位和目标依据', '用历史样本估计胜率', '记录实际 R 倍数分布'],
    pitfall: '随意画很远的目标价制造高盈亏比，或只追求胜率不控制尾部亏损。',
    example: '计划止损 3%，合理目标 6%，理论盈亏比约 2:1，但还需判断达到目标的概率。',
    related: ['stop-loss', 'position-management', 'drawdown']
  },
  {
    id: 'slippage', title: '滑点', aliases: ['冲击成本'], category: 'risk', level: '进阶', weight: 2,
    summary: '计划成交价与实际成交均价之间的偏差。',
    explanation: '滑点来自行情快速变化、盘口深度不足、订单规模过大和系统延迟。回测若忽略滑点，短周期或高换手策略的结果可能严重高估。',
    signals: ['记录委托价与实际成交价', '按股票流动性分组统计', '大单使用分批或限价控制'],
    pitfall: '认为成交额大就没有滑点，或用收盘价假设全部仓位瞬间成交。',
    example: '计划 10 元买入，实际多档成交均价 10.05 元，买入滑点约 0.5%。',
    related: ['liquidity-risk', 'position-management', 'order-book']
  },
  {
    id: 'concentration-risk', title: '集中度风险', aliases: ['相关性风险'], category: 'risk', level: '进阶', weight: 2,
    summary: '仓位过度集中在单一个股、行业或同一驱动因素造成的组合风险。',
    explanation: '持有多只股票不等于分散。如果它们属于同一板块或依赖同一政策，行情反转时可能同步下跌。需要从风险来源而非股票数量看分散。',
    signals: ['按行业和逻辑归类持仓', '评估持仓收益相关性', '限制同一事件驱动的总暴露'],
    pitfall: '买了五只同板块股票就认为已经分散风险。',
    example: '同时持有多只半导体股，面对行业政策变化时仍可能相当于一个集中仓位。',
    related: ['position-management', 'event-risk', 'drawdown']
  }
];
