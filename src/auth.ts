import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// Maps Google email → internal userId
// Add more entries here when onboarding new users in Phase 5
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
      if (profile?.email) {
        token.userId = EMAIL_TO_USER_ID[profile.email] ?? null;
      }
      return token;
    },
    session({ session, token }) {
      session.user.userId = (token.userId as string) ?? null;
      return session;
    },
  },
});
