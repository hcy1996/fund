import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "config", "export-config-temp.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(raw) as unknown;
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "读取导出模板失败" }, { status: 500 });
  }
}

