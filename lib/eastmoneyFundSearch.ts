/** 东方财富基金搜索（与 `/api/funds/search` 同源），供服务端复用 */

import { unstable_cache } from "next/cache";

export type FundSearchHit = {
  code: string;
  name: string;
  nav?: number;
  navDate?: string;
};

type EastMoneySearchItem = {
  CODE?: string;
  NAME?: string;
  CATEGORY?: number;
  CATEGORYDESC?: string;
  FundBaseInfo?: {
    DWJZ?: number | string;
    FSRQ?: string;
  };
};

const FUND_SEARCH_CACHE_SECONDS = 300;

async function searchFundsEastMoneyUncached(
  trimmed: string,
  limit: number,
): Promise<FundSearchHit[]> {
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(
    trimmed,
  )}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://fund.eastmoney.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; FundEstimator/1.0; +https://localhost)",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return [];
    }
    const json = (await res.json()) as { Datas?: EastMoneySearchItem[] };
    return (json.Datas ?? [])
      .filter((item) => item.CATEGORY === 700 || item.CATEGORYDESC === "基金")
      .filter((item) => /^\d{6}$/.test(item.CODE ?? ""))
      .slice(0, limit)
      .map((item) => ({
        code: item.CODE ?? "",
        name: item.NAME ?? "",
        nav: item.FundBaseInfo?.DWJZ !== undefined ? Number(item.FundBaseInfo.DWJZ) : undefined,
        navDate: item.FundBaseInfo?.FSRQ,
      }));
  } catch {
    return [];
  }
}

/** 同一关键词在多标签/多用户下合并为东财一次拉取（fetch 60s + 全站 5min 结果缓存） */
export async function searchFundsEastMoney(q: string, limit = 10): Promise<FundSearchHit[]> {
  const trimmed = q.trim();
  if (!trimmed) {
    return [];
  }
  const lim = Math.min(100, Math.max(1, Math.floor(limit)));
  return unstable_cache(
    async () => searchFundsEastMoneyUncached(trimmed, lim),
    ["fund-search-v1", trimmed, String(lim)],
    { revalidate: FUND_SEARCH_CACHE_SECONDS },
  )();
}

/** 清洗 OCR / 支付宝省略后的名称，便于搜索 */
export function sanitizeFundNameForSearch(name: string): string {
  let s = name
    .trim()
    .replace(/\s+/g, "")
    .replace(/^[\[【「]+/g, "")
    .replace(/[\]】」]+$/g, "");
  // 常见误识别：ETF] = ETF联接 半截
  s = s.replace(/ETF\]/gi, "ETF联接").replace(/etf\]/gi, "ETF联接");
  // OCR：「灵活配置」常被识成「灵活泼配置」（泼/配形近）
  s = s.replace(/灵活泼配置/g, "灵活配置");
  return s.trim();
}

function normalizeComparable(s: string): string {
  return sanitizeFundNameForSearch(s)
    // 登记名常见「N个月持有期」，截图/口语常写「N月持有」
    .replace(/(\d+)月持有(?!期)/g, "$1个月持有期")
    .replace(/[(\（)）]/g, "")
    .toLowerCase()
    // 东财全称常见「(LOF)」而截图省略，归一化后对齐
    .replace(/lof/gi, "")
    // 东财简称「工银xxx」、用户/截图常写「工银瑞信xxx」
    .replace(/工银瑞信/g, "工银")
    // 去掉常见基金类型词，减少“混合C / 股票C / 债券C”等干扰
    // 注意：不移除“联接/连接”，以免影响联接后缀的约束评分
    .replace(/混合/g, "")
    .replace(/股票/g, "")
    .replace(/债券/g, "")
    .replace(/指数/g, "")
    .replace(/发起式/g, "")
    .replace(/发起/g, "")
    .replace(/基金/g, "")
    .replace(/型/g, "");
}

function extractQdiiTailLetter(normName: string): string | null {
  // normalize后形如：...qdiiA / ...qdiiC
  const m = normName.match(/qdii([a-z])$/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function extractLinkTailLetter(normName: string): string | null {
  // normalize后形如：...联接c / ...连接d
  const m = normName.match(/(?:联接|连接)([a-z])$/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function longestCommonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** 生成多组关键词，提高东财联想命中率（截断名、补联接、去 QDII 括号等） */
export function buildFundSearchQueryVariants(displayName: string): string[] {
  const base = sanitizeFundNameForSearch(displayName);
  const out: string[] = [];
  const add = (x: string) => {
    const t = x.trim().replace(/\s+/g, "");
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };
  add(base);

  // N月持有 → N个月持有期：东财对简称常 0 命中（如景顺长城华城稳健6月持有混合A）
  if (/(\d+)月持有(?!期)/.test(base)) {
    const expanded = base.replace(/(\d+)月持有(?!期)/g, "$1个月持有期");
    add(expanded);
  }

  // 工银瑞信 → 工银：东财联想 API 对「工银瑞信前沿医疗」常无结果，需用「工银前沿医疗」
  if (/工银瑞信/.test(base)) {
    const gy = base.replace(/工银瑞信/g, "工银");
    add(gy);
    add(gy.replace(/混合/g, "").replace(/股票/g, "").replace(/债券/g, "").replace(/指数/g, "").replace(/发起式/g, "").replace(/发起/g, "").replace(/基金/g, "").replace(/型/g, ""));
  }

  // 适配：东财搜索对“混合C / QDII C”等后缀敏感
  // - 质量成长混合C：需要能搜到“华泰柏瑞质量成长”（去掉混合与末尾字母）
  // - 新兴市场优选混合(QDII)C：需要能搜到“建信新兴市场”（去掉优选、混合、qdii等干扰词）
  const noDesc = base.replace(/优选/g, "").replace(/精选/g, "");
  const noType = base.replace(/混合/g, "").replace(/股票/g, "").replace(/债券/g, "").replace(/指数/g, "").replace(/发起式/g, "").replace(/发起/g, "").replace(/基金/g, "").replace(/型/g, "");
  const stripTailLetter = (s: string) => s.replace(/([A-Za-z])$/i, "");

  add(noDesc);
  add(noType);
  add(stripTailLetter(noType));
  add(stripTailLetter(noDesc));
  // 额外：去掉 qdii 关键字再搜一轮，方便命中“建信新兴市场”这类条目
  if (/qdii/i.test(base)) {
    const noQdii = base.replace(/qdii/gi, "");
    add(noQdii);
    add(stripTailLetter(noQdii));
  }

  if (base.length >= 4) {
    add(base.replace(/\(QDII\)[A-Za-z]*$/i, "").replace(/（QDII）/g, ""));
    add(base.replace(/\(QDII\)/gi, "").replace(/（QDII）/g, ""));
    const paren = base.indexOf("(");
    if (paren >= 6) add(base.slice(0, paren));
  }
  if (/ETF$/i.test(base) && !/[联接连接]/.test(base)) {
    add(`${base}联接`);
    add(`${base}联接C`);
  }
  const m = base.match(/^(.+)(联接|连接)([A-Za-z]?)$/i);
  if (m?.[1] && m[1].length >= 6) add(m[1]);
  if (base.length > 20) add(base.slice(0, 20));
  if (base.length > 14) add(base.slice(0, 14));
  if (base.length > 10) add(base.slice(0, 10));
  return out;
}

/** 在搜索结果中选与截图基金名最贴近的一项（支付宝等仅有全称） */
export function pickBestFundMatch(needle: string, hits: FundSearchHit[]): FundSearchHit | null {
  if (!hits.length) return null;
  const n = normalizeComparable(needle);
  if (!n) return hits[0] ?? null;

  const nQdii = extractQdiiTailLetter(n);
  const nHasQdii = n.includes("qdii");
  const nLink = extractLinkTailLetter(n);
  const nHasLink = n.includes("联接") || n.includes("连接");

  const scored = hits.map((h) => {
    const hn = normalizeComparable(h.name);
    let score = 0;
    if (hn === n) score = 100_000;
    else if (hn.includes(n)) score = 50_000 + Math.min(n.length * 100, 9000);
    else if (n.includes(hn) && hn.length >= 6) score = 20_000 + hn.length * 10;
    else {
      const pref = longestCommonPrefix(n, hn);
      score = pref * 50;
      if (pref >= 8) score += 1000;
    }

    // 强制后缀一致：防止把 QDII)C 误匹配成 QDII)A、把 联接C 误匹配成非联接 ETF
    if (nHasQdii) {
      if (nQdii) {
        score += hn.includes(`qdii${nQdii}`) ? 30_000 : -50_000;
      } else if (!hn.includes("qdii")) {
        score -= 50_000;
      }
    }
    if (nHasLink) {
      if (nLink) {
        const ok = hn.includes(`联接${nLink}`) || hn.includes(`连接${nLink}`);
        score += ok ? 25_000 : -45_000;
      } else if (!hn.includes("联接") && !hn.includes("连接")) {
        score -= 45_000;
      }
    }
    return { h, score, hn };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]!;

  if (top.score >= 20_000) return top.h;
  if (top.hn.includes(n) || n.includes(top.hn)) return top.h;
  if (top.score >= 400 && n.length >= 8) return top.h;
  if (hits.length === 1) return hits[0]!;
  return top.score >= 350 ? top.h : null;
}

/** 多轮关键词搜索并合并结果，再择优匹配（解决单关键词无结果、名称截断问题） */
export async function resolveFundByNameFromEastMoney(displayName: string): Promise<FundSearchHit | null> {
  const needle = sanitizeFundNameForSearch(displayName);
  if (!needle) return null;

  const variants = buildFundSearchQueryVariants(displayName);
  const merged = new Map<string, FundSearchHit>();

  for (const q of variants) {
    const hits = await searchFundsEastMoney(q, 25);
    for (const h of hits) merged.set(h.code, h);
    if (merged.size >= 40) break;
  }

  const all = [...merged.values()];
  if (!all.length) return null;
  return pickBestFundMatch(needle, all);
}
