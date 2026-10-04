import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// Zwei Aufgaben:
// 1. Preview- und Development-Deployments dürfen nie im Suchindex landen.
// 2. Clerk prüft die Sitzung, aber nur für die Schnittstellen (/api/...), die wissen müssen, wer angemeldet ist.
//    Seiten laufen ohne Clerk: Sie sind statisch, und Besucher ohne Konto sollen keine Anfrage an Clerk auslösen.
//    Ohne Clerk-Schlüssel läuft nichts davon.

const clerk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY ? clerkMiddleware() : null;

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const forClerk = clerk !== null && req.nextUrl.pathname.startsWith("/api/");
  const res = forClerk ? ((await clerk(req, event)) ?? NextResponse.next()) : NextResponse.next();
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|favicon.ico).*)"],
};
