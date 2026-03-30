import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PkChartSection } from "../pk-chart-section";
import { PkHoldingsSection } from "../pk-holdings-section";
import { PkSelectionPanel } from "../pk-selection-panel";

test("PK selection cards render clickable fund detail links", () => {
  const html = renderToStaticMarkup(
    <PkSelectionPanel
      query=""
      onQueryChange={() => {}}
      suggestions={[]}
      suggesting={false}
      suggestionError={null}
      onAddCode={(code: string) => {
        void code;
      }}
      sessionUserId={null}
      selected={["000001"]}
      fundsByCode={{
        "000001": {
          code: "000001",
          name: "华夏成长混合",
          fundType: "混合型",
          estimateTime: null,
          navDate: null,
          nav: null,
          estimateNav: null,
          dailyChangeRate: null,
          periods: [],
        },
      }}
      onRemoveSelected={() => {}}
    />,
  );

  assert.match(html, /href="\/funds\/000001"/);
  assert.match(html, /华夏成长混合/);
});

test("PK holdings cards render clickable fund detail links", () => {
  const html = renderToStaticMarkup(
    <PkHoldingsSection
      loading={false}
      error={null}
      selected={["000001"]}
      fundsByCode={{
        "000001": {
          code: "000001",
          name: "华夏成长混合",
          holdingsTitle: "2025年4季度股票投资明细",
          holdingsStocks: [
            { code: "600519", name: "贵州茅台", weightPct: 8.66 },
            { code: "000858", name: "五粮液", weightPct: 6.12 },
          ],
          periods: [],
        },
      }}
    />,
  );

  assert.match(html, /href="\/funds\/000001"/);
});

test("PK chart section renders stronger annotation guidance", () => {
  const html = renderToStaticMarkup(
    <PkChartSection
      selectedCount={2}
      chartRange="3m"
      onChartRangeChange={() => {}}
      chartLegendItems={[
        { code: "000001", name: "华夏成长混合", color: "#1677ff" },
        { code: "000002", name: "易方达蓝筹", color: "#ff7a45" },
      ]}
      chartSeries={[
        {
          code: "000001",
          name: "华夏成长混合",
          pct: [0, 0.8, 1.2],
          dates: ["2026-01-01", "2026-02-01", "2026-03-01"],
          stroke: "#1677ff",
        },
        {
          code: "000002",
          name: "易方达蓝筹",
          pct: [0, 0.4, 0.9],
          dates: ["2026-01-01", "2026-02-01", "2026-03-01"],
          stroke: "#ff7a45",
        },
      ]}
      chartError={null}
      chartLoading={false}
      chartGeom={{
        min: -1,
        max: 2,
        yTicks: [-1, 0, 1, 2],
        lines: [
          { stroke: "#1677ff", lineD: "M 0 0 L 10 10" },
          { stroke: "#ff7a45", lineD: "M 0 1 L 10 11" },
        ],
        xTicks: [
          { x: 54, label: "01-01" },
          { x: 280, label: "02-01" },
          { x: 548, label: "03-01" },
        ],
      }}
      chartReadyText=""
      chartWidth={560}
      chartHeight={210}
      padLeft={54}
      padRight={12}
    />,
  );

  assert.match(html, /当前点位/);
  assert.match(html, /悬浮查看/);
});
