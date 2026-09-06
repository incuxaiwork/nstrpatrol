import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const AUDIT_PATH = path.join(process.cwd(), "public", "api-audit-admin-web.md");

export function GET(): Response {
  if (!fs.existsSync(AUDIT_PATH)) {
    return new Response("Audit file not found", { status: 404 });
  }
  const body = fs.readFileSync(AUDIT_PATH);
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="api-audit-admin-web.md"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
