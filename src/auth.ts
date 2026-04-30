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
    jwt({ token, profile }) {
      // profile is only available on first sign-in
      console.log('jwt callback - profile email:', profile?.email, 'token.userId:', token.userId);
      if (profile?.email) {
        token.userId = EMAIL_TO_USER_ID[profile.email] ?? null;
      }
      // If userId already stored in token, keep it
      return token;
    },
    session({ session, token }) {
      (session.user as any).userId = token.userId ?? null;
      return session;
    },
  },
});
