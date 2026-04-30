import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthPage = req.nextUrl.pathname.startsWith('/api/auth');
  if (isAuthPage) return NextResponse.next();

  console.log('middleware auth:', JSON.stringify(req.auth?.user));

  // Not signed in at all
  if (!req.auth) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  // Signed in but no mapped userId
  const userId = (req.auth.user as any)?.userId;
  if (!userId) {
    // Clear session and send to signin
    const signoutUrl = new URL('/api/auth/signout', req.url);
    signoutUrl.searchParams.set('callbackUrl', '/api/auth/signin');
    return NextResponse.redirect(signoutUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
