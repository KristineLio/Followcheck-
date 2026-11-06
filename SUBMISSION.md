# FollowCheck — SkyCastle "Cancel My Subscription" submission draft

> **Only post after VibeFlow has re-synced and the updated live app has been tested.**

**FollowCheck — Your circle. Clearly.** 🌿

**Replaces:** The follower-list comparison and saved-history workflow of **FollowMeter Plus**, listed at **€5.49/month** in the Bulgarian App Store ([price source](https://apps.apple.com/bg/app/followmeter-for-instagram/id651309421)). FollowCheck is not a replacement for real-time monitoring, story viewers, or post engagement tracking.

**Live VibeFlow URL:** https://christina.users.skycastle.ai/12727/

Your Instagram circle, no login and no subscription. Upload the original **Followers and following** Instagram ZIP (HTML or JSON) to see accurate mutuals, people who don't follow you back, people you don't follow back, and changes across separate exports. Filter usernames and download an entire categorized CSV report. File processing and saved snapshots stay in your browser. No scraping and no Instagram password.

**Try it instantly:** Click **Try the working demo** to explore a fully calculated fictional account with two snapshots, view new/missing follower changes, and download a sample report before uploading anything.

**Privacy and scope:** This is export-based, not live Instagram monitoring. A missing username is not proof of intentional unfollowing. Not affiliated with Instagram or FollowMeter.

---

## Submission QA checklist

- [ ] VibeFlow has pulled the latest `vibeflow-grand-prize` commit and deployed it to the existing live URL.
- [ ] Landing hero's **Try the working demo** opens the calculated sample immediately.
- [ ] Demo counts 1,250 followers, 840 following, 654 mutual, 186 not-following-back, 596 you-don't-follow-back; history +34 new / -12 missing / +22 net.
- [ ] Demo guide buttons work and **Download full report** yields a usable CSV.
- [ ] Upload an original real Instagram **All time** ZIP and confirm follower totals against the downloaded data.
- [ ] Import a second ZIP for the same local account label and confirm New/Missing/Net; verify history survives reload.
- [ ] Test Chrome desktop, Android Chrome, and iPhone Safari. Watch for decompression support errors.
- [ ] Verify mobile no horizontal scrolling, no blocked buttons and no errors.
- [ ] Confirm the live link, monthly price, and replacement scope in the `#builds` entry.