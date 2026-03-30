type EastmoneyTopHolding = {
  code: string;
  name: string;
  weightPct: number | null;
};

type EastmoneyTopHoldingResult = {
  title: string | null;
  items: EastmoneyTopHolding[];
};

function decodeHtml(raw: string) {
  return raw
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(raw: string) {
  return decodeHtml(raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

function parseWeightPct(raw: string): number | null {
  const text = raw.replace(/[%\s]/g, "");
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

function unescapeJsString(raw: string) {
  return raw.replace(/\\"/g, '"').replace(/\\\//g, "/").replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}

/**
 * 抓取东财 F10 的基金重仓股（取最新披露一期，默认前 10 条）
 */
export async function getFundTopStockHoldings(code: string): Promise<EastmoneyTopHoldingResult> {
  const trimmed = code.trim();
  if (!trimmed) return { title: null, items: [] };

  const url =
    `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?` +
    `type=jjcc&code=${encodeURIComponent(trimmed)}&topline=10&year=&month=`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "*/*",
        Referer: "https://fundf10.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (compatible; FundEstimator/1.0; +https://localhost)",
      },
      next: { revalidate: 21_600 },
    });
    if (!res.ok) return { title: null, items: [] };
    const text = await res.text();

    const titleMatch = text.match(/<h4[^>]*class=['"]t['"][^>]*>([\s\S]*?)<\/h4>/i);
    const title = titleMatch?.[1] ? stripTags(titleMatch[1]) : null;

    const contentMatch = text.match(/content\s*:\s*"([\s\S]*?)"\s*,\s*arryear/i);
    const contentRaw = contentMatch?.[1] ? unescapeJsString(contentMatch[1]) : text;

    const tableMatch = contentRaw.match(/<table[\s\S]*?<\/table>/i);
    if (!tableMatch?.[0]) return { title, items: [] };

    const table = tableMatch[0];
    const rowMatches = Array.from(table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    if (rowMatches.length <= 1) return { title, items: [] };

    const items: EastmoneyTopHolding[] = [];
    for (const row of rowMatches.slice(1)) {
      const rowHtml = row[1] ?? "";
      const cells = Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) =>
        stripTags(m[1] ?? ""),
      );
      if (cells.length < 4) continue;
      const stockCode = cells[1] ?? "";
      const stockName = cells[2] ?? "";
      if (!/^\d{6}$/.test(stockCode) || !stockName) continue;
      items.push({
        code: stockCode,
        name: stockName,
        weightPct: parseWeightPct(cells[3] ?? ""),
      });
    }

    return { title, items: items.slice(0, 10) };
  } catch {
    return { title: null, items: [] };
  }
}

