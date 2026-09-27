import { NextRequest, NextResponse } from "next/server";

// 全站登录:个人投资数据(持仓、付费数据源)不能公开。
// token 与 src/lib/auth.ts 的 makeToken 一致:sha256(password + SALT)。
const COOKIE_NAME = "settings_auth";
const SALT = "stock-intel-settings-2026";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.SETTINGS_PASSWORD;
  const { pathname, search } = req.nextUrl;

  if (!password) {
    // 未配置密码:生产环境拒绝访问,避免在无保护状态下公开;本地开发放行。
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("SETTINGS_PASSWORD 未配置，站点已锁定。", { status: 503 });
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && token === (await sha256Hex(password + SALT))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 放行:登录页、登录接口、静态资源
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|egret.*\\.svg|executives/).*)"],
};
