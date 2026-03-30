import { unstable_cache } from "next/cache";

type EastMoneyQuoteResp = {
  data?: {
    f43?: number; // 最新价 * 100
    f57?: string; // 代码
    f58?: string; // 名称
    f60?: number; // 昨收 * 100
  };
};

type EastMoneyTrendsResp = {
  data?: {
    trends?: string[]; // "YYYY-MM-DD HH:mm,price,vol"
  };
};

export type MarketIndexCard = {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  points: Array<{ t: string; price: number }>;
};

const DEFAULT_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://quote.eastmoney.com/",
  "User-Agent": "Mozilla/5.0 (compatible; FundEstimator/1.0; +https://localhost)",
};

function num100(v: number | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v / 100;
}

async function fetchIndexQuoteUncached(secid: string): Promise<{ code: string; name: string; price: number; prevClose: number } | null> {
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f43,f57,f58,f60`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS, next: { revalidate: 10 } });
  if (!res.ok) return null;
  const json = (await res.json()) as EastMoneyQuoteResp;
  const code = json.data?.f57?.trim() || "";
  const name = json.data?.f58?.trim() || "";
  const price = num100(json.data?.f43);
  const prevClose = num100(json.data?.f60);
  if (!code || !name || price === null || prevClose === null || prevClose <= 0) return null;
  return { code, name, price, prevClose };
}

async function fetchIndexTrendsUncached(secid: string): Promise<Array<{ t: string; price: number }>> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2&fields2=f51,f53,f56&ndays=1`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS, next: { revalidate: 10 } });
  if (!res.ok) return [];
  const json = (await res.json()) as EastMoneyTrendsResp;
  const rows = json.data?.trends ?? [];
  const out: Array<{ t: string; price: number }> = [];
  for (const s of rows) {
    // "2026-03-30 09:15,3913.72,0"
    const parts = s.split(",");
    if (parts.length < 2) continue;
    const t = parts[0]?.trim();
    const p = Number(parts[1]);
    if (!t || !Number.isFinite(p)) continue;
    out.push({ t, price: p });
  }
  return out;
}

const INDEX_LIST: Array<{ secid: string; displayOrder: number }> = [
  { secid: "1.000001", displayOrder: 1 }, // 上证指数
  { secid: "1.000300", displayOrder: 2 }, // 沪深300
  { secid: "0.399001", displayOrder: 3 }, // 深证成指
  { secid: "0.399006", displayOrder: 4 }, // 创业板指
  { secid: "100.HSI", displayOrder: 5 }, // 恒生指数
  { secid: "1.000688", displayOrder: 6 }, // 科创50（上证科创板50成份指数）
  { secid: "2.H30269", displayOrder: 7 }, // 红利低波
];

async function listMarketIndicesUncached(): Promise<MarketIndexCard[]> {
  const rows = await Promise.all(
    INDEX_LIST.map(async (it) => {
      const [q, points] = await Promise.all([
        fetchIndexQuoteUncached(it.secid),
        fetchIndexTrendsUncached(it.secid),
      ]);
      if (!q) return null;
      const change = q.price - q.prevClose;
      const changePct = (q.price / q.prevClose - 1) * 100;
      const card: MarketIndexCard = {
        code: q.code,
        name: q.name,
        price: q.price,
        prevClose: q.prevClose,
        change,
        changePct,
        points,
      };
      return { displayOrder: it.displayOrder, card };
    }),
  );
  return rows
    .filter((x): x is { displayOrder: number; card: MarketIndexCard } => x !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((x) => x.card);
}

export const listMarketIndices = unstable_cache(
  async () => listMarketIndicesUncached(),
  ["market-indices-v1"],
  { revalidate: 10 },
);

