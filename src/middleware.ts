import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthPage = req.nextUrl.pathname.startsWith('/api/auth');
  if (isAuthPage) return NextResponse.next();

  const user = req.auth?.user as any;
  const userId = user?.userId;

  // Not signed in or no mapped userId — redirect to signout to clear session
  if (!userId) {
    if (!req.auth) {
      return NextResponse.redirect(new URL('/api/auth/signin', req.url));
    }
    return NextResponse.redirect(new URL('/api/auth/signout', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
		// /privacy is public: Google's OAuth consent screen links to it.
    // sw.js, the manifest and its icons too: the browser fetches them on its own (#71 step 3).
    '/((?!_next/static|_next/image|favicon.ico|privacy|sw\\.js|manifest\\.webmanifest|icons/).*)',
  ],
};
