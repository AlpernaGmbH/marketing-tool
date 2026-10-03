import { NextResponse } from "next/server";

// Preview- und Development-Deployments dürfen nie im Suchindex landen.
export function middleware() {
  const res = NextResponse.next();
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|favicon.ico).*)"],
};
