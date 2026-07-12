export interface StockFinancialReport {
  reportDate: string;
  reportName: string;
  revenue: number | null;
  revenueGrowth: number | null;
  netProfit: number | null;
  netProfitGrowth: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  roe: number | null;
  grossMargin: number | null;
  debtRatio: number | null;
  operatingCashflowPerShare: number | null;
}

export interface StockCompanyProfile {
  fullName: string;
  englishName: string;
  securityType: string;
  industry: string;
  exchange: string;
  listingDate: string;
  foundedDate: string;
  chairman: string;
  president: string;
  legalRepresentative: string;
  actualController: string;
  employees: number | null;
  registeredCapital: number | null;
  website: string;
  phone: string;
  email: string;
  address: string;
  mainBusiness: string;
  businessScope: string;
  profile: string;
}

export interface StockAnnouncement {
  id: string;
  title: string;
  category: string;
  publishedAt: number | null;
}
