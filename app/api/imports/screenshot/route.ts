import { NextResponse } from "next/server";
import { withAuth } from "@/lib/routeAuth";
import { screenshotUploadSchema } from "@/lib/validations";
import {
  ERR_NO_VISION_KEY,
  parseHoldingsFromScreenshotBase64,
} from "@/services/screenshotImportService";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const POST = withAuth(async (req) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const parsed = screenshotUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { imageBase64, mediaType } = parsed.data;

  let buf: Buffer;
  try {
    buf = Buffer.from(imageBase64, "base64");
  } catch {
    return NextResponse.json({ error: "图片 Base64 无效" }, { status: 400 });
  }

  if (buf.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "图片过大，请压缩后重试（最大约 8MB）" },
      { status: 400 },
    );
  }

  try {
    const rows = await parseHoldingsFromScreenshotBase64(imageBase64, mediaType);
    return NextResponse.json({ rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "识别失败";
    if (msg === ERR_NO_VISION_KEY) {
      return NextResponse.json(
        {
          error:
            "服务器未配置视觉模型密钥：请设置 OPENAI_API_KEY、或 DASHSCOPE_API_KEY（阿里云百炼）、或 ARK_API_KEY + ARK_ENDPOINT_ID（火山方舟）",
        },
        { status: 503 },
      );
    }
    if (msg === "VISION_NO_HOLDINGS") {
      return NextResponse.json(
        {
          error:
            "模型已返回内容，但未解析到有效持仓（请检查截图是否含 6 位基金代码，或换一张重试）",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: `识别失败：${msg}` }, { status: 502 });
  }
});
