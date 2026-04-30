import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const EMAIL_TO_USER_ID: Record<string, string> = {
  [process.env.GOOGLE_OWNER_EMAIL!]: 'hyoje',
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      const email = user?.email ?? token.email;
      if (email && !token.userId) {
        token.userId = EMAIL_TO_USER_ID[email as string] ?? null;
      }
      return token;
    },
    session({ session, token }) {
      (session.user as any).userId = token.userId ?? null;
      return session;
    },
  },
});
