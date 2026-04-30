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
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
