// Offline support (#71 step 3). The service worker (public/sw.js) runs only on these hosts;
// everywhere else the page removes it and its caches — that is also the off switch: take a
// host out of the list and push.
//   test.log.fargaze.co  the test site, first (agreed 10 Nov)
//   log.fargaze.co       production — on from 12 Nov (Hyoje: try it in the field; ACS campus)
// NEXT_PUBLIC_OFFLINE=1 turns it on anywhere (local testing).
export const OFFLINE_HOSTS = ['test.log.fargaze.co', 'log.fargaze.co'];

export function offlineAllowed(host: string): boolean {
  return process.env.NEXT_PUBLIC_OFFLINE === '1' || OFFLINE_HOSTS.includes(host);
}
