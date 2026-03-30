import { resolveFundByNameFromEastMoney } from "@/lib/eastmoneyFundSearch";
import { fetchFundGzRaw } from "@/providers/fundProvider";
import type { FundQuote } from "@/types/fund";
import { getFundQuote } from "@/services/fundQuoteService";

const VISION_FUND_CODE_LEN = 6;

export type ScreenshotParsedRow = {
  fundCode: string;
  fundName?: string;
  shares: number | null;
  costPrice: number | null;
  note?: string;
};

/** 视觉模型原始行（支付宝等可先无名码，仅有名称 + 市值 + 收益率） */
type VisionParsedRow = {
  fundCode: string;
  fundName?: string;
  shares: number | null;
  costPrice: number | null;
  /** 持有金额 / 市值（支付宝「金额」列） */
  marketValue?: number | null;
  /** 持有收益率，小数形式，如 0.0305 表示 3.05% */
  holdingProfitRate?: number | null;
  holdingProfit?: number | null;
  note?: string;
};

/** 未配置任何视觉模型密钥 */
export const ERR_NO_VISION_KEY = "SERVER_NO_VISION_KEY";

function normalizeFundCode(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 6) return digits;
  if (digits.length > 6) return digits.slice(0, VISION_FUND_CODE_LEN);
  return null;
}

const VISION_PROMPT = `你是公募基金持仓截图解析工具。请阅读图片中的表格或列表，识别每一条持仓（忽略「市场解读」「产品提醒」等横幅文案、忽略广告与汇总重复行）。

一、支付宝 / 蚂蚁财富「我的持有」常见列：
- 名称：基金全称（fundName，必填，须与截图一致写全，含「联接C」「(QDII)C」等后缀，勿截断；勿把 ] 当成名称一部分）
- 金额：当前持有市值（marketValue，数字，元）
- 昨日收益：可记到 note，不必作为必填
- 持有收益：holdingProfit（数字，元，可正可负）
- 持有收益率：holdingProfitRate 用小数表示（如 3.05% 写作 0.0305；-8.31% 写作 -0.0831）。若截图上是百分数数字 3.05，请换算为小数 0.0305。
此类截图通常不显示 6 位基金代码：fundCode 可省略或留空，不要编造。

二、天天基金等常见列：
- fundCode：6 位代码（有则填）
- shares：持有份额；costPrice：单位成本（元/份）

三、输出要求：
顶层必须是对象，含 holdings 数组。字段名用英文小驼峰：fundCode（可选）、fundName、marketValue、holdingProfit、holdingProfitRate、shares、costPrice、note。
仅输出 JSON，不要 markdown。

示例（支付宝风格）：
{"holdings":[{"fundName":"华夏创业板新能源ETF联接C","marketValue":10202.25,"holdingProfit":302.25,"holdingProfitRate":0.0305}]}
`.trim();

/** 从模型输出中截取第一段完整 JSON 对象或数组（含字符串内引号） */
function extractFirstJsonValue(s: string): string | null {
  const trimmed = s.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fenced?.[1]?.trim() ?? trimmed;
  const i0 = inner.search(/[\[{]/);
  if (i0 < 0) return null;
  const open = inner[i0];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = i0; i < inner.length; i++) {
    const c = inner[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return inner.slice(i0, i + 1);
    }
  }
  return null;
}

function toFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").replace(/%/g, "").trim();
    if (!t) return undefined;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** 持有收益率统一为小数：模型可能给 3.05 或 0.0305 */
function toHoldingRateDecimal(v: unknown): number | undefined {
  const n = toFiniteNumber(v);
  if (n === undefined) return undefined;
  if (Math.abs(n) <= 1) return n;
  return n / 100;
}

function pickUnknown(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined && obj[k] !== null) {
      return obj[k];
    }
  }
  return undefined;
}

/** 兼容 holdings / data / list、中文键名、份额与成本为字符串等 */
function extractHoldingsArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const o = parsed as Record<string, unknown>;
  const candidates = [
    o.holdings,
    o.data,
    o.items,
    o.list,
    o.funds,
    o.result,
    o.基金列表,
    o["持仓"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (c && typeof c === "object") {
      const inner = c as Record<string, unknown>;
      if (Array.isArray(inner.holdings)) return inner.holdings;
      if (Array.isArray(inner.list)) return inner.list;
    }
  }
  return [];
}

function normalizeNameKey(name: string | undefined): string {
  return (name ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeNameForCodeCheck(name: string | undefined): string {
  return (name ?? "")
    .replace(/\s+/g, "")
    .replace(/[\[\]【】「」]+/g, "")
    .replace(/灵活泼配置/g, "灵活配置")
    // 与 eastmoneyFundSearch.normalizeComparable 一致：N月持有 ≈ N个月持有期
    .replace(/(\d+)月持有(?!期)/g, "$1个月持有期")
    .replace(/[(（)）]+/g, "")
    .toLowerCase();
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

function isFundNameConsistentWithCode(fundName: string, officialFundName: string): boolean {
  const n = normalizeNameForCodeCheck(fundName);
  const o = normalizeNameForCodeCheck(officialFundName);
  if (!n || !o) return true;

  const nQdii = extractQdiiTailLetter(n);
  const oQdii = extractQdiiTailLetter(o);
  const nHasQdii = n.includes("qdii");
  const oHasQdii = o.includes("qdii");

  if (nQdii) {
    // 例如：QDII)C 被错误选成 QDII)A
    return oQdii === nQdii;
  }
  if (nHasQdii && !oHasQdii) return false;

  const nLink = extractLinkTailLetter(n);
  const oLink = extractLinkTailLetter(o);
  const nHasLink = n.includes("联接") || n.includes("连接");
  const oHasLink = o.includes("联接") || o.includes("连接");

  if (nLink) {
    // 例如：联接C 被错误选成 非联接
    return oLink === nLink;
  }
  if (nHasLink && !oHasLink) return false;

  return true;
}

function normalizeVisionRow(row: unknown): VisionParsedRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const codeRaw = pickUnknown(r, [
    "fundCode",
    "fund_code",
    "code",
    "基金代码",
    "基金code",
    "fundcode",
  ]);
  const code = codeRaw !== undefined ? normalizeFundCode(String(codeRaw)) : null;

  const nameRaw = pickUnknown(r, ["fundName", "fund_name", "name", "基金名称", "基金简称", "标题", "名称"]);

  const nameStr =
    typeof nameRaw === "string"
      ? nameRaw.trim() || undefined
      : nameRaw != null
        ? String(nameRaw).trim() || undefined
        : undefined;

  if (!code && !nameStr) return null;

  const shares = toFiniteNumber(
    pickUnknown(r, ["shares", "share", "持有份额", "份额", "quantity", "持有数量"]),
  );
  const cost = toFiniteNumber(
    pickUnknown(r, ["costPrice", "cost_price", "cost", "单位成本", "成本", "持仓成本", "成本价"]),
  );
  const marketValue = toFiniteNumber(
    pickUnknown(r, [
      "marketValue",
      "market_value",
      "amount",
      "金额",
      "市值",
      "资产",
      "持有金额",
      "当前市值",
    ]),
  );
  const holdingProfit = toFiniteNumber(
    pickUnknown(r, ["holdingProfit", "holding_profit", "持有收益", "累计收益", "收益"]),
  );
  const holdingProfitRate = toHoldingRateDecimal(
    pickUnknown(r, ["holdingProfitRate", "holding_profit_rate", "持有收益率", "收益率", "涨跌幅"]),
  );

  const noteRaw = r.note;
  return {
    fundCode: code ?? "",
    fundName: nameStr,
    shares: shares !== undefined && shares > 0 ? shares : null,
    costPrice: cost !== undefined && cost >= 0 ? cost : null,
    marketValue: marketValue !== undefined && marketValue > 0 ? marketValue : null,
    holdingProfitRate:
      holdingProfitRate !== undefined && Number.isFinite(holdingProfitRate) ? holdingProfitRate : null,
    holdingProfit: holdingProfit !== undefined && Number.isFinite(holdingProfit) ? holdingProfit : null,
    note: typeof noteRaw === "string" ? noteRaw.trim() || undefined : undefined,
  };
}

function parseVisionRowsFromParsedJson(parsed: unknown): VisionParsedRow[] {
  const arr = extractHoldingsArray(parsed);
  const seen = new Map<string, VisionParsedRow>();
  for (const item of arr) {
    const row = normalizeVisionRow(item);
    if (!row) continue;
    const key = row.fundCode || normalizeNameKey(row.fundName) || "";
    if (!key) continue;
    seen.set(key, row);
  }
  return [...seen.values()];
}

function parseVisionModelTextToRows(text: string): VisionParsedRow[] {
  const block = extractFirstJsonValue(text);
  if (!block) {
    throw new Error("VISION_JSON_PARSE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    throw new Error("VISION_JSON_PARSE");
  }
  const rows = parseVisionRowsFromParsedJson(parsed);
  if (rows.length === 0) {
    throw new Error("VISION_NO_HOLDINGS");
  }
  return rows;
}

/**
 * 截图推算份额用的单份净值：与支付宝「持有金额」口径一致，优先东财 fundgz 的 gsz（estimateNav）。
 * getFundQuote().nav 在午休、非交易日等时刻往往落在 lsjz 正式净值，会低于当前 app 展示的估值（如 1.49 vs 1.5144）。
 */
function navForScreenshotImportSizing(quote: FundQuote): number | undefined {
  const est = quote.estimateNav;
  if (est !== undefined && Number.isFinite(est) && est > 0) {
    return est;
  }
  const fallback = quote.nav ?? quote.officialNav;
  if (fallback !== undefined && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  return undefined;
}

/**
 * 用东财搜索补全代码；支付宝类用市值 + 持有收益率 + 当前净值推算份额与单位成本。
 * costPrice = nav / (1 + rate)；shares = marketValue / nav
 */
async function enrichVisionRowsForHoldings(vision: VisionParsedRow[]): Promise<ScreenshotParsedRow[]> {
  const out: ScreenshotParsedRow[] = [];

  for (const row of vision) {
    let fundCode = row.fundCode.trim();
    let fundName = row.fundName;
    let didCodeCorrect = false;
    // 供后续复用：避免同一行既用于名称校验又用于净值/估值计算时重复拉取
    let gzForThisRow: Awaited<ReturnType<typeof fetchFundGzRaw>> | undefined;

    // fundCode 若为 6 位且 fundName 存在：不盲信模型 code，先用 fundgz 的“基金全称”校验是否同一份额类别
    // 典型误差：QDII)C 被识别成 QDII)A、ETF联接C 被识别成 ETF(非联接)
    if (/^\d{6}$/.test(fundCode) && fundName) {
      gzForThisRow = await fetchFundGzRaw(fundCode, { bypassCache: true });
      const officialName = gzForThisRow?.name;
      if (officialName && !isFundNameConsistentWithCode(fundName, officialName)) {
        const best = await resolveFundByNameFromEastMoney(fundName);
        if (best && best.code && best.code !== fundCode) {
          didCodeCorrect = true;
          fundCode = best.code;
          if (best.name) fundName = best.name;
          gzForThisRow = await fetchFundGzRaw(fundCode, { bypassCache: true });
        }
      }
    }

    if (!/^\d{6}$/.test(fundCode) && fundName) {
      const best = await resolveFundByNameFromEastMoney(fundName);
      if (best) {
        fundCode = best.code;
        if (!fundName) fundName = best.name;
      }
    }

    let shares = row.shares;
    let costPrice = row.costPrice;
    const parts: string[] = [];

    const needRecalc = didCodeCorrect || !shares || shares <= 0 || costPrice == null || costPrice < 0;
    if (needRecalc && /^\d{6}$/.test(fundCode)) {
      const mv = row.marketValue;
      let rate: number | undefined =
        row.holdingProfitRate != null && Number.isFinite(row.holdingProfitRate)
          ? row.holdingProfitRate
          : undefined;
      // 支付宝同时有「持有收益」时，用 收益/(市值-收益) 作为收益率，避免 14.75% 四舍五入与金额不一致
      if (mv != null && mv > 0 && row.holdingProfit != null && Number.isFinite(row.holdingProfit)) {
        const costEst = mv - row.holdingProfit;
        if (costEst > 0) {
          rate = row.holdingProfit / costEst;
        }
      }
      if (mv != null && mv > 0 && rate != null && rate > -0.999) {
        const quote = await getFundQuote(fundCode);
        // 绕过缓存拉 fundgz：支付宝「持有金额」多数按最近披露单位净值 dwjz 口径，与 1.5144 这一类数一致；
        // gsz 为盘中估算，常与 dwjz 不同；若仅用 gsz 会出现 市值/gsz 份额偏大（如 016874 dwjz=1.5144 gsz=1.5041）。
        const gzLive =
          gzForThisRow && gzForThisRow.fundcode === fundCode ? gzForThisRow : await fetchFundGzRaw(fundCode, { bypassCache: true });
        const dwjzLive =
          gzLive?.dwjz !== undefined && String(gzLive.dwjz).trim() !== ""
            ? Number(gzLive.dwjz)
            : undefined;
        const gszLive =
          gzLive?.gsz !== undefined && String(gzLive.gsz).trim() !== ""
            ? Number(gzLive.gsz)
            : undefined;
        const nav =
          dwjzLive !== undefined && Number.isFinite(dwjzLive) && dwjzLive > 0
            ? dwjzLive
            : gszLive !== undefined && Number.isFinite(gszLive) && gszLive > 0
              ? gszLive
              : navForScreenshotImportSizing(quote);
        if (nav != null && nav > 0) {
          shares = mv / nav;
          costPrice = nav / (1 + rate);
          const navLabel =
            dwjzLive !== undefined && Number.isFinite(dwjzLive) && dwjzLive > 0
              ? `dwjz=${nav}`
              : gszLive !== undefined && Number.isFinite(gszLive) && gszLive > 0
                ? `gsz=${nav}`
                : `nav=${nav}`;
          parts.push(`由市值÷fundgz ${navLabel} 与收益率推算份额/成本`);
          if (didCodeCorrect) parts.push("按名称校验已修正基金代码");
          if (quote.fundName && !fundName) fundName = quote.fundName;
        } else {
          parts.push("未取到净值，请手写份额与成本");
        }
      }
    }

    if (!/^\d{6}$/.test(fundCode)) {
      out.push({
        fundCode: fundCode || "",
        fundName,
        shares: shares ?? null,
        costPrice: costPrice ?? null,
        note: [row.note, "未匹配到基金代码，请手写或修改名称后重试"].filter(Boolean).join("；"),
      });
      continue;
    }

    const note = [row.note, ...parts].filter(Boolean).join("；") || undefined;
    out.push({
      fundCode,
      fundName,
      shares: shares ?? null,
      costPrice: costPrice ?? null,
      note,
    });
  }

  return out;
}

async function parseAndEnrichFromModelText(text: string): Promise<ScreenshotParsedRow[]> {
  const vision = parseVisionModelTextToRows(text);
  const enriched = await enrichVisionRowsForHoldings(vision);
  if (!enriched.length) {
    throw new Error("VISION_NO_HOLDINGS");
  }
  return enriched;
}

async function callOpenAIVision(imageBase64: string, mediaType: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY!.trim();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini",
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OPENAI_HTTP_${res.status}:${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const t = data.choices?.[0]?.message?.content;
  if (!t || typeof t !== "string") {
    throw new Error("OPENAI_EMPTY_RESPONSE");
  }
  return t;
}

function extractDashScopeMessageText(data: unknown): string {
  const d = data as {
    code?: string;
    message?: string;
    output?: {
      choices?: Array<{
        message?: { content?: Array<{ text?: string }> | string };
      }>;
    };
  };
  if (typeof d.code === "string" && d.code && d.code !== "Success") {
    throw new Error(`DASHSCOPE_${d.code}:${String(d.message ?? "")}`.slice(0, 400));
  }
  const content = d.output?.choices?.[0]?.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** 阿里云百炼 DashScope — 通义千问 VL（国内，文档要求图片为 data:image/...;base64,...） */
async function callDashScopeVision(imageBase64: string, mediaType: string): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY!.trim();
  const base = process.env.DASHSCOPE_BASE_URL?.trim() || "https://dashscope.aliyuncs.com";
  const url = `${base.replace(/\/$/, "")}/api/v1/services/aigc/multimodal-generation/generation`;
  const model = process.env.DASHSCOPE_VL_MODEL?.trim() || "qwen3-vl-flash-2026-01-22";
  const imageUrl = `data:${mediaType};base64,${imageBase64}`;
  const textPrompt = `${VISION_PROMPT}\n\n仅返回 JSON 对象本身，不要使用 markdown 代码块包裹。`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: "user",
            content: [{ image: imageUrl }, { text: textPrompt }],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`DASHSCOPE_HTTP_${res.status}:${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = extractDashScopeMessageText(data);
  if (!text) {
    throw new Error("DASHSCOPE_EMPTY_RESPONSE");
  }
  return text;
}

/** 解析方舟 / OpenAI 兼容 chat/completions 的 message.content（支持 string 或 content parts） */
function openAiCompatibleMessageText(data: unknown): string {
  const d = data as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  if (d.error && typeof d.error.message === "string") {
    throw new Error(`ARK_API:${d.error.message.slice(0, 400)}`);
  }
  const raw = d.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * 字节火山方舟 — OpenAI 兼容 POST /v3/chat/completions（需控制台创建 API Key + 多模态推理接入点 ID）
 * https://www.volcengine.com/docs/82379/1298459
 */
async function callVolcArkVision(imageBase64: string, mediaType: string): Promise<string> {
  const key = process.env.ARK_API_KEY?.trim();
  const endpointId =
    process.env.ARK_ENDPOINT_ID?.trim() ||
    process.env.ARK_VISION_ENDPOINT_ID?.trim() ||
    process.env.VOLC_ARK_ENDPOINT_ID?.trim();
  if (!key) {
    throw new Error("ARK_KEY_MISSING");
  }
  if (!endpointId) {
    throw new Error("ARK_ENDPOINT_ID_MISSING");
  }

  const base =
    process.env.ARK_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com/api/v3";
  const url = `${base.replace(/\/$/, "")}/chat/completions`;

  const textBlock = `${VISION_PROMPT}\n\n仅返回 JSON 对象本身，不要使用 markdown 代码块包裹。`;

  const payload: Record<string, unknown> = {
    model: endpointId,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: textBlock },
          {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${imageBase64}` },
          },
        ],
      },
    ],
  };

  if (process.env.ARK_RESPONSE_JSON !== "0") {
    payload.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ARK_HTTP_${res.status}:${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = openAiCompatibleMessageText(data);
  if (!text) {
    throw new Error("ARK_EMPTY_RESPONSE");
  }
  return text;
}

type VisionBackendId = "openai" | "dashscope" | "volc";

/**
 * 截图 → 结构化持仓候选。支持：
 * - OpenAI 多模态（OPENAI_API_KEY）
 * - 阿里云百炼通义千问 VL（DASHSCOPE_API_KEY）
 * - 字节火山方舟豆包多模态（ARK_API_KEY + ARK_ENDPOINT_ID，OpenAI 兼容 /v3/chat/completions）
 *
 * VISION_PROVIDER：auto | openai | dashscope | volc | ark（默认 auto：openai → dashscope → volc）
 */
export async function parseHoldingsFromScreenshotBase64(
  imageBase64: string,
  mediaType: string = "image/png",
): Promise<ScreenshotParsedRow[]> {
  const openai = process.env.OPENAI_API_KEY?.trim();
  const dash = process.env.DASHSCOPE_API_KEY?.trim();
  const arkKey = process.env.ARK_API_KEY?.trim();
  const arkEndpoint =
    process.env.ARK_ENDPOINT_ID?.trim() ||
    process.env.ARK_VISION_ENDPOINT_ID?.trim() ||
    process.env.VOLC_ARK_ENDPOINT_ID?.trim();
  const volcReady = !!(arkKey && arkEndpoint);

  if (!openai && !dash && !volcReady) {
    throw new Error(ERR_NO_VISION_KEY);
  }

  const prefer = (process.env.VISION_PROVIDER || "auto").trim().toLowerCase();
  let order: VisionBackendId[];
  switch (prefer) {
    case "dashscope":
      // 阿里优先，失败（包括额度用尽）则自动切到火山，再兜底 OpenAI
      order = ["dashscope", "volc", "openai"];
      break;
    case "openai":
      order = ["openai", "dashscope", "volc"];
      break;
    case "volc":
    case "ark":
      order = ["volc", "openai", "dashscope"];
      break;
    default:
      // auto：若同时配置了阿里与火山，则优先 dashscope → volc → openai
      if (dash && volcReady) {
        order = ["dashscope", "volc", "openai"];
      } else {
        order = ["openai", "dashscope", "volc"];
      }
  }

  const errors: string[] = [];
  for (const provider of order) {
    if (provider === "openai" && openai) {
      try {
        const text = await callOpenAIVision(imageBase64, mediaType);
        return await parseAndEnrichFromModelText(text);
      } catch (e) {
        errors.push(`OpenAI: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (provider === "dashscope" && dash) {
      try {
        const text = await callDashScopeVision(imageBase64, mediaType);
        return await parseAndEnrichFromModelText(text);
      } catch (e) {
        errors.push(`DashScope: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (provider === "volc" && volcReady) {
      try {
        const text = await callVolcArkVision(imageBase64, mediaType);
        return await parseAndEnrichFromModelText(text);
      } catch (e) {
        errors.push(`VolcArk: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  throw new Error(errors.join(" | ") || "VISION_ALL_PROVIDERS_FAILED");
}
