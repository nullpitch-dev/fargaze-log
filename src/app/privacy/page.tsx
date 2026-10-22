// src/app/privacy/page.tsx
// Public privacy notice. Google's OAuth consent screen needs a privacy policy
// link before the app can be published (the rclone backup client lives in the
// same Google Cloud project as the site's sign-in). The middleware lets this
// path through without signing in.

export const metadata = { title: 'Privacy · FarGaze Log' };

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-sm leading-relaxed text-stone-700 dark:text-zinc-300">
      <h1 className="text-xl font-semibold mb-4 text-stone-900 dark:text-zinc-100">Privacy</h1>
      <p className="mb-3">
        FarGaze Log is a private, single-user application. Only its owner can sign in; any other
        Google account is refused after sign-in, and no data about it is kept.
      </p>
      <p className="mb-3">
        Signing in with Google uses only your email address, to check that you are the owner.
        The owner&apos;s backup tool uses Google Drive access limited to files it creates itself,
        to store backups of this application&apos;s own database.
      </p>
      <p className="mb-3">
        No data is shared with, sold to, or used by third parties.
      </p>
      <p>Contact: hyoje.choi.uk@gmail.com</p>
    </main>
  );
}
