# Instagram Unfollowers

See who you follow on Instagram that doesn't follow you back, and optionally unfollow them.

This is a security-reviewed copy of [davidarroyo1234/InstagramUnfollowers](https://github.com/davidarroyo1234/InstagramUnfollowers)
(MIT, upstream commit `8a5b0f8`, 2026-09-10) with a few changes, listed below.

## How to use

You need a computer; this runs in a desktop browser's developer console.

1. Open [`dist/instagram-unfollowers.js`](dist/instagram-unfollowers.js) on GitHub, click **Raw**, and copy the whole file.
2. Go to <https://www.instagram.com> and log in.
3. Open the developer console: `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Option+J` (Mac) in Chrome,
   `Ctrl+Shift+K` / `Cmd+Option+K` in Firefox. Chrome may ask you to type `allow pasting` first.
4. Paste the script and press Enter. The Instagram page is replaced by the tool.
5. Click **Run Scan** and wait. Results only appear once the scan is (nearly) done; large accounts take a while
   because it paces its requests.
6. Review the list. Click an avatar to **whitelist** someone you want to keep following (friends, brands, creators);
   whitelisted accounts move to their own tab, so "select all" won't pick them up.
7. Tick the accounts to drop (or **All**) and click **Unfollow**. Reload the page when you're done to get Instagram back.

**Copy / JSON / CSV** export the current list if you just want to see who doesn't follow back without unfollowing anyone.

## Rate limits

Instagram rate-limits unfollows. The default timings (about 4s between unfollows, plus a 5-minute pause every 5)
are upstream's and can be changed in **Settings**. If Instagram rejects an unfollow, the run stops and tells you,
because every request after a block fails anyway. Wait for the block to clear, then rescan and run again;
anything already unfollowed won't show up again.

Only paste this script from this repository: code pasted into the console can do anything you can do on Instagram.

## Security review

What the script does, verified by reading every source file and by scanning the built file:

- **Talks only to Instagram.** The only URLs in the built script are `https://www.instagram.com/api/v1/friendships/…`
  (reads your following/followers lists) and `https://www.instagram.com/web/friendships/…/unfollow/` (unfollows).
  These are the same endpoints instagram.com itself uses. The `w3.org` strings in the file are SVG/HTML namespace
  names, not network requests.
- **Never sees your password.** It runs inside your already-logged-in tab. It reads two cookies: `ds_user_id` (your
  account id, to build the list URLs) and `csrftoken` (Instagram requires it on the unfollow request). Both are sent
  only to instagram.com.
- **Stores data only in your browser.** Your whitelist and timing settings go in the instagram.com tab's
  `localStorage`. Exports are files downloaded to your computer. Nothing is uploaded anywhere.
- **No hidden code.** No `eval`, `new Function`, remote script loading, trackers or analytics.
- **Dependencies:** the only library bundled into the script is [preact](https://preactjs.com) (UI).
  As of 2026-09-28, `npm audit` reports 0 vulnerabilities for all dependencies, including the build tooling.

### Changes from upstream

- **Detects rejected unfollows.** Upstream counted an unfollow as successful as long as the network request didn't
  crash, so a rate-limited or blocked run reported everything as unfollowed while nothing happened. It now checks
  Instagram's response, logs the failure, and stops the run on the first rejection.
- Handles a missing login session with a message instead of silently hanging.
- Removed the localhost demo mode (it loaded avatars from a third-party site) so the script contains no
  non-Instagram URLs at all.
- Removed upstream's GitHub Pages landing page, its dev server and unused Babel packages, and refreshed the
  lockfile so `npm audit` is clean.

## Rebuilding / verifying the built file

The build is reproducible, so you can check that `dist/instagram-unfollowers.js` really comes from `src/`:

```sh
npm ci
npm run build
git status   # dist/instagram-unfollowers.js should show no changes
```

## License

MIT. See [LICENSE](LICENSE). Original work copyright (c) 2023 David Arroyo.
