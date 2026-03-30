import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHoldingStatsByCategoryForUser } from "@/services/statsService";
import { chromium } from "playwright";

function requireCronSecret(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return { ok: false as const, res: NextResponse.json({ error: "CRON_SECRET 未配置" }, { status: 500 }) };
  }
  const got = req.headers.get("x-cron-secret")?.trim() || "";
  if (got !== expected) {
    return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true as const };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtMoney(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0.00%";
  return `${(n * 100).toFixed(2)}%`;
}

function buildStatsHtml(params: {
  ownerName: string;
  snapshotText: string;
  totalValue: number;
  groups: Awaited<ReturnType<typeof getHoldingStatsByCategoryForUser>>["groups"];
}) {
  const { ownerName, snapshotText, totalValue, groups } = params;
  const colors = ["#1677ff", "#ffb020", "#00b96b", "#7c3aed", "#ef4444", "#0ea5e9", "#14b8a6"];

  const items = groups.map((g, i) => ({
    name: g.bigName,
    value: g.bigValue,
    pct: g.bigPct,
    color: colors[i % colors.length]!,
  }));
  const sum = items.reduce((s, it) => s + (Number.isFinite(it.value) ? it.value : 0), 0);
  let acc = 0;
  const segs = sum <= 0 ? [] : items.map((it) => {
    const pct = it.value / sum;
    const start = acc;
    acc += pct;
    return { color: it.color, pct, offset: start };
  });

  const tableRows: string[] = [];
  for (const g of groups) {
    const bigRowSpan = g.smalls.reduce((s, sm) => s + sm.funds.length, 0);
    let bigPrinted = false;
    for (const s of g.smalls) {
      let smallPrinted = false;
      const smallOfTotal = totalValue > 0 ? s.smallValue / totalValue : 0;
      for (const f of s.funds) {
        const cells: string[] = [];
        if (!bigPrinted) {
          cells.push(
            `<td rowspan="${bigRowSpan}" class="td td-center td-mid">${escapeHtml(g.bigName)}</td>`,
          );
          bigPrinted = true;
        }
        if (!smallPrinted) {
          cells.push(
            `<td rowspan="${s.funds.length}" class="td td-center td-mid">${escapeHtml(s.smallName)}</td>`,
          );
          smallPrinted = true;
        }
        cells.push(`<td class="td td-left td-muted">${escapeHtml(f.code)}</td>`);
        cells.push(`<td class="td td-left">${escapeHtml(f.name)}</td>`);
        cells.push(`<td class="td td-right td-muted">${fmtPct(f.pct)}</td>`);
        cells.push(`<td class="td td-right">${fmtMoney(f.value)}</td>`);
        // 小类占全部：只在第一行显示（rowspan），用一个小环形图 + 文本
        if (f === s.funds[0]) {
          const dash = (smallOfTotal * 100).toFixed(6);
          const rest = (100 - smallOfTotal * 100).toFixed(6);
          cells.push(
            `<td rowspan="${s.funds.length}" class="td td-center td-mid">` +
              `<div class="mini-donut">` +
                `<svg width="44" height="44" viewBox="0 0 42 42" aria-hidden="true">` +
                  `<circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#edf2ff" stroke-width="5"></circle>` +
                  `<circle cx="21" cy="21" r="15.915" fill="transparent" stroke="${g.bigName ? items.find(x=>x.name===g.bigName)?.color ?? "#1677ff" : "#1677ff"}" stroke-width="5" stroke-dasharray="${dash} ${rest}" stroke-dashoffset="25"></circle>` +
                  `<circle cx="21" cy="21" r="11" fill="#fff"></circle>` +
                `</svg>` +
                `<div class="mini-text">${fmtPct(smallOfTotal)}</div>` +
                `<div class="mini-money">${fmtMoney(s.smallValue)}</div>` +
              `</div>` +
            `</td>`,
          );
        }
        tableRows.push(`<tr>${cells.join("")}</tr>`);
      }
    }
    // 大类小计
    tableRows.push(
      `<tr class="tr-big-subtotal">` +
        `<td class="td td-left td-strong">小计（${escapeHtml(g.bigName)}）</td>` +
        `<td class="td"></td>` +
        `<td class="td"></td>` +
        `<td class="td"></td>` +
        `<td class="td td-right td-strong">${fmtPct(g.bigPct)}</td>` +
        `<td class="td td-right td-strong">${fmtMoney(g.bigValue)}</td>` +
        `<td class="td"></td>` +
      `</tr>`,
    );
  }

  const donutLegend = items
    .map(
      (it) =>
        `<div class="legend-row">` +
          `<div class="legend-name"><span class="dot" style="background:${it.color}"></span>${escapeHtml(it.name)}</div>` +
          `<div class="legend-pct">${fmtPct(it.pct)}</div>` +
        `</div>`,
    )
    .join("");

  const donutCircles = segs
    .map((seg) => {
      const dash = (seg.pct * 100).toFixed(6);
      const rest = (100 - seg.pct * 100).toFixed(6);
      const offset = (25 - seg.offset * 100).toFixed(6);
      return `<circle cx="21" cy="21" r="15.915" fill="transparent" stroke="${seg.color}" stroke-width="6" stroke-dasharray="${dash} ${rest}" stroke-dashoffset="${offset}"></circle>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>统计快照</title>
    <style>
      html, body { margin: 0; padding: 0; background: #ffffff; font-family: "PingFang SC","Hiragino Sans GB","Microsoft YaHei", Arial, Helvetica, sans-serif; color:#1f2a44; }
      .wrap { width: 980px; padding: 14px; }
      .card { border:1px solid #dbe5ff; border-radius: 12px; background:#fff; padding: 10px; }
      .row { display:flex; align-items:center; justify-content:space-between; gap: 12px; }
      .title { font-weight: 700; font-size: 14px; }
      .sub { font-size: 11px; color:#8ea1c8; }
      .donut-card { margin-top: 10px; border:1px solid #e8efff; background:#f9fbff; border-radius: 12px; padding: 10px; position: relative; }
      .stamp { position:absolute; right: 12px; top: 8px; font-size: 11px; color:#8ea1c8; font-variant-numeric: tabular-nums; }
      .donut { display:flex; align-items:center; justify-content:center; gap: 18px; }
      .legend { display:grid; gap: 6px; font-size: 12px; color:#4d5f87; min-width: 240px; }
      .legend-row { display:flex; justify-content:space-between; gap: 12px; }
      .legend-name { display:flex; align-items:center; gap: 8px; }
      .dot { width: 10px; height: 10px; border-radius: 3px; display:inline-block; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
      th { background:#f5f8ff; color:#4d5f87; border: 1px solid #e4ecff; padding: 6px 8px; }
      .td { border: 1px solid #f0f4ff; padding: 6px 8px; vertical-align: top; }
      .td-center { text-align:center; }
      .td-left { text-align:left; }
      .td-right { text-align:right; }
      .td-mid { vertical-align: middle; }
      .td-muted { color:#6a7ea8; }
      .td-strong { font-weight: 700; color:#1f2a44; }
      .tr-total td { background:#ffeec2; border-color:#e4ecff; color:#7a4b00; font-weight: 700; }
      .tr-big-subtotal td { background:#f0f4ff; border-color:#e4ecff; }
      .mini-donut { display:flex; flex-direction:column; align-items:center; gap: 2px; }
      .mini-text { font-size: 10px; color:#4d5f87; }
      .mini-money { font-size: 10px; font-weight:700; color:#1f2a44; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="row">
          <div>
            <div class="title">统计快照（归属人：${escapeHtml(ownerName)}）</div>
            <div class="sub">金额口径：净值市值（与首页持仓一致）</div>
          </div>
          <div style="text-align:right">
            <div class="sub">总计</div>
            <div class="title" style="font-variant-numeric: tabular-nums;">¥ ${fmtMoney(totalValue)}</div>
          </div>
        </div>

        <div class="donut-card">
          <div class="stamp">${escapeHtml(snapshotText)}</div>
          <div class="donut">
            <svg width="140" height="140" viewBox="0 0 42 42" aria-hidden="true">
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e8efff" stroke-width="6"></circle>
              ${donutCircles}
              <circle cx="21" cy="21" r="11" fill="#fff"></circle>
            </svg>
            <div class="legend">
              <div style="font-weight:700;color:#1f2a44">大类占比（全部）</div>
              ${donutLegend}
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align:center">大类</th>
              <th style="text-align:center">小类</th>
              <th style="text-align:left">代码</th>
              <th style="text-align:left">基金名称</th>
              <th style="text-align:right">占比</th>
              <th style="text-align:right">持有金额</th>
              <th style="text-align:center">小类占全部</th>
            </tr>
          </thead>
          <tbody>
            <tr class="tr-total">
              <td class="td td-left">总计</td>
              <td class="td"></td>
              <td class="td"></td>
              <td class="td"></td>
              <td class="td td-right">100.00%</td>
              <td class="td td-right">¥ ${fmtMoney(totalValue)}</td>
              <td class="td"></td>
            </tr>
            ${tableRows.join("")}
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>`;
}

export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return auth.res;

  const ownerName = "我";
  const now = new Date();
  const snapshotText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(
    now.getHours(),
  ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const users = await prisma.user.findMany({ select: { id: true } });
  let ok = 0;
  let skipped = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  // 单次任务顺序执行，避免本地/小机器资源爆炸
  for (const u of users) {
    try {
      const stats = await getHoldingStatsByCategoryForUser(u.id, "owner", { ownerName });
      if (!stats || stats.totalValue <= 0 || stats.groups.length === 0) {
        skipped++;
        continue;
      }

      // 防重复：同一用户同一归属人 1 小时内只存一份
      const last = await prisma.statsSnapshot.findFirst({
        where: { userId: u.id, ownerName },
        orderBy: { snapshotAt: "desc" },
        select: { snapshotAt: true },
      });
      if (last && now.getTime() - last.snapshotAt.getTime() < 60 * 60 * 1000) {
        skipped++;
        continue;
      }

      const html = buildStatsHtml({
        ownerName,
        snapshotText,
        totalValue: stats.totalValue,
        groups: stats.groups,
      });

      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: "load" });
        // 容器宽度固定 980 + padding，可直接对 body 截图
        const pngBuf = await page.screenshot({ fullPage: true, type: "png" });
        const png = new Uint8Array(pngBuf);
        await prisma.statsSnapshot.create({
          data: {
            userId: u.id,
            ownerName,
            snapshotAt: now,
            totalValue: stats.totalValue,
            png,
          },
        });
        ok++;
      } finally {
        await browser.close();
      }
    } catch (e) {
      errors.push({ userId: u.id, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  return NextResponse.json({ ok, skipped, errorsCount: errors.length, errors });
}

