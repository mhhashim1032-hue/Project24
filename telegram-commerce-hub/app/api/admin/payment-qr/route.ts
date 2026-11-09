import { NextRequest, NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const key = String(form.get("key") || "");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a QR image file first." }, { status: 400 });
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, or WebP image." }, { status: 400 });
    if (file.size <= 0 || file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "QR image must be larger than 0 bytes and no more than 4 MB." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await invokeGoldFeatherServer("admin_upload_payment_qr", { key, mimeType: file.type, base64: bytes }, { authorization: req.headers.get("authorization") || "", timeoutMs: 25000 });
    return NextResponse.json(result.data, { status: result.status });
  } catch {
    return NextResponse.json({ error: "Payment QR upload failed." }, { status: 500 });
  }
}
