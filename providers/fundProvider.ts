/**
 * 东方财富基金估值接口（后端代理封装，禁止前端直连）
 * 接口示例：https://fundgz.1234567.com.cn/js/{code}.js
 */

export type RawFundGz = {
  fundcode: string;
  name: string;
  jzrq: string;
  dwjz: string;
  gsz: string;
  gszzl: string;
  gztime: string;
};

export type RawFundLatestNav = {
  nav?: string;
  navDate?: string;
  changeRate?: string;
};

function getTimeoutMs(envName: string, fallback: number) {
  const raw = process.env[envName];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonp(text: string): RawFundGz | null {
  const m = text.match(/jsonpgz\((\{[\s\S]*\})\)/);
  if (!m?.[1]) {
    return null;
  }
  try {
    return JSON.parse(m[1]) as RawFundGz;
  } catch {
    return null;
  }
}

export async function fetchFundGzRaw(
  code: string,
  opts?: { bypassCache?: boolean },
): Promise<RawFundGz | null> {
  const trimmed = code.trim();
  if (!trimmed) {
    return null;
  }
  const url = `https://fundgz.1234567.com.cn/js/${encodeURIComponent(trimmed)}.js`;
  const timeoutMs = getTimeoutMs("FUND_PROVIDER_TIMEOUT_MS", 3000);
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: "*/*",
        Referer: "https://fund.eastmoney.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; FundEstimator/1.0; +https://localhost)",
      },
      ...(opts?.bypassCache
        ? { cache: "no-store" as const }
        : { next: { revalidate: 30 } }),
    }, timeoutMs);
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    return parseJsonp(text);
  } catch {
    return null;
  }
}

/**
 * 东财历史净值 lsjz（每页固定最多 20 条，新→旧）
 * 示例：https://api.fund.eastmoney.com/f10/lsjz?fundCode=018590&pageIndex=1&pageSize=20
 */
export type RawLsjzRow = {
  FSRQ?: string;
  DWJZ?: string;
};

export async function fetchFundLsjzPage(
  code: string,
  pageIndex: number,
): Promise<{ list: RawLsjzRow[]; totalCount: number } | null> {
  const trimmed = code.trim();
  if (!trimmed || pageIndex < 1) {
    return null;
  }
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${encodeURIComponent(trimmed)}&pageIndex=${pageIndex}&pageSize=20`;
  const timeoutMs = getTimeoutMs("FUND_PROVIDER_TIMEOUT_MS", 4500);
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://fundf10.eastmoney.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; FundEstimator/1.0; +https://localhost)",
      },
      /** 历史 lsjz 按日披露为主，全站共用长缓存，减轻东财压力（与 fundNavHistoryService unstable_cache 一致） */
      next: { revalidate: 86_400 },
    }, timeoutMs);
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      Data?: { LSJZList?: RawLsjzRow[] };
      TotalCount?: number;
      ErrCode?: number;
    };
    if (json.ErrCode !== 0 && json.ErrCode !== undefined) {
      return null;
    }
    const list = json.Data?.LSJZList ?? [];
    return {
      list,
      totalCount: typeof json.TotalCount === "number" ? json.TotalCount : list.length,
    };
  } catch {
    return null;
  }
}

/** 取 lsjz 最新一条作为“最新净值” */
export async function fetchFundLatestNavRaw(code: string): Promise<RawFundLatestNav | null> {
  const trimmed = code.trim();
  if (!trimmed) {
    return null;
  }
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${encodeURIComponent(trimmed)}&pageIndex=1&pageSize=1`;
  const timeoutMs = getTimeoutMs("FUND_PROVIDER_TIMEOUT_MS", 3000);
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://fundf10.eastmoney.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; FundEstimator/1.0; +https://localhost)",
      },
      next: { revalidate: 60 },
    }, timeoutMs);
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      Data?: { LSJZList?: Array<{ FSRQ?: string; DWJZ?: string; JZZZL?: string }> };
    };
    const latest = json?.Data?.LSJZList?.[0];
    if (!latest) {
      return null;
    }
    return {
      nav: latest.DWJZ,
      navDate: latest.FSRQ,
      changeRate: latest.JZZZL,
    };
  } catch {
    return null;
  }
}
