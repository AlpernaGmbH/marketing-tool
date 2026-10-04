import { NextResponse, type NextRequest } from "next/server";

// Preview- und Development-Deployments dürfen nie im Suchindex landen.

export default function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|favicon.ico).*)"],
};
