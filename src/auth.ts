import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const EMAIL_TO_USER_ID: Record<string, string> = {
  [process.env.GOOGLE_OWNER_EMAIL!]: 'hyoje',
};

console.log('EMAIL_TO_USER_ID keys:', Object.keys(EMAIL_TO_USER_ID));

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      console.log('jwt callback - user:', JSON.stringify(user), 'token:', JSON.stringify(token));
      if (user?.email) {
        token.userId = EMAIL_TO_USER_ID[user.email] ?? null;
      }
      return token;
    },
    session({ session, token }) {
      (session.user as any).userId = token.userId ?? null;
      return session;
    },
  },
});
