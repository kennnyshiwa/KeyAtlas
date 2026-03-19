# KeyAtlas Growth Plan

_Written: 2026-03-17 | Status: Draft_

## Where We Are (Honest Assessment)

| Metric | Current | Notes |
|--------|---------|-------|
| Projects | 362 | Growing via Geekhack backfill (242 GB, 74 IC, 19 Production) |
| Users | 25 | ~1 new signup every 1-2 days |
| Follows | 13 | 6 unique users following projects |
| Favorites | 11 | 5 unique users |
| Comments | 11 | Minimal engagement |
| Vendors | 46 | Good coverage |
| Build Guides | 1 | Needs content |
| Google Index | 3 pages | Homepage, /projects, 1 project page — **critical problem** |

**Bottom line:** You have a solid product with a growing catalog, but almost no one knows it exists. The Geekhack backfill is building a content moat (362 project pages and growing), but Google only sees 3 pages. Discovery is basically zero.

---

## Priority 1: SEO (Biggest Lever, Lowest Cost)

You have 362 project pages that should be ranking for searches like "GMK [setname] group buy", "[keyboard] interest check", etc. Right now Google has indexed almost none of them.

### Immediate Fixes
- [ ] **Verify sitemap.xml is being generated and submitted** — check `keyatlas.io/sitemap.xml` exists and includes all project URLs
- [ ] **Submit sitemap to Google Search Console** — if not already connected, set up GSC with Cloudflare DNS verification
- [ ] **Add structured data (JSON-LD)** to project pages — Product schema with name, description, status, price, images, vendor
- [ ] **Unique meta descriptions per project** — currently likely generic; each project page needs a unique `<meta description>` with set name, status, vendor, dates
- [ ] **Canonical URLs** — make sure each project has a clean canonical (`/projects/[slug]`)
- [ ] **Internal linking** — project pages should cross-link to related projects (same category, same vendor, same designer)

### Content SEO
- [ ] **Category landing pages** — `/projects?category=keycaps` should have unique H1/description targeting "keycap group buys 2026"
- [ ] **Status landing pages** — "Active group buys", "Upcoming interest checks" as crawlable pages
- [ ] **Vendor pages** — each vendor profile page ranks for "[vendor name] group buys"
- [ ] **Blog/news section** — even 1-2 posts/month ("March 2026 Group Buy Roundup", "Best Keycap Sets to Watch") would drive long-tail traffic

### Target Keywords (Low Competition, High Intent)
- "[keycap set name] group buy" — e.g., "GMK Moonlight group buy"
- "[keyboard name] interest check"
- "mechanical keyboard group buys 2026"
- "active keycap group buys"
- "[vendor] group buys" — e.g., "NovelKeys group buys"

### Competitive Gap
- **KeebFinder** (keeb-finder.com) is the main competitor for GB tracking. They rank well but focus primarily on keyboards, less on keycaps/deskmats.
- **Geekhack** has domain authority but terrible UX/searchability.
- **r/MechanicalKeyboards** wiki has a group buy page but it's manually maintained and always outdated.
- **KeyAtlas advantage:** Auto-updated, comprehensive, better UX. Just need Google to see it.

---

## Priority 2: Reddit & Discord Community Seeding

### Reddit (r/MechanicalKeyboards — 2.6M members)
- [ ] **Don't spam.** This community is allergic to self-promotion.
- [ ] **Soft launch approach:**
  - When someone asks "where can I track group buys?" — link KeyAtlas in a comment (organically, from your personal account)
  - Post a genuine "I built this" launch post in r/MechanicalKeyboards with screenshots, story, and why you built it. Be honest about it being early.
  - Cross-post to r/mechmarket, r/keycapdesigners, r/CustomKeyboards
- [ ] **Weekly/monthly roundup posts** — "March 2026 Group Buy Tracker" with a link back to KeyAtlas as the source. Provide genuine value (dates, pricing, vendor links) so people save/share the post.
- [ ] **Engage in IC/GB threads** — when a new IC drops and discussion starts, contribute genuinely and mention you've added it to KeyAtlas for tracking.

### Discord
- [ ] **Target servers:** MechKeys, 40% Keyboards, KeebTalk, individual designer/vendor servers
- [ ] **Same approach as Reddit:** be a helpful member first, mention KeyAtlas when relevant
- [ ] **Discord bot (future):** a `/gb` command that pulls active GBs from KeyAtlas API — this would be a strong distribution channel if servers adopt it

---

## Priority 3: Retention & Engagement Hooks

### What brings people back?
Right now: nothing automated. Someone has to remember to visit.

- [ ] **Email notifications** — "A project you follow changed status (IC → GB)" — this is already built (notification system exists), needs email delivery
- [ ] **Push notifications** — web push + iOS app push for followed projects
- [ ] **Weekly digest email** — "3 new GBs this week, 2 GBs ending soon, 1 IC you follow went live"
- [ ] **RSS feed** — `/feed.xml` with new projects, status changes. Keeb enthusiasts still use RSS readers.

### Engagement features
- [ ] **Comments on projects** — exists but underused (11 total). Consider prompting users to share opinions on ICs
- [ ] **"Notify me when GB opens"** button on IC projects — killer feature, easy win
- [ ] **Price alerts** — "This GB is ending in 3 days" (partially built with GB ending reminders)

---

## Priority 4: Distribution & Partnerships

### Vendors
- [ ] **Reach out to vendors** — offer them a way to claim/manage their vendor page on KeyAtlas. This gives them a reason to link back to you (SEO backlinks + legitimacy).
- [ ] **Vendor dashboard (future)** — let vendors update their own project status, add pricing, manage listings. Reduces your workload and gives them ownership.

### Designers
- [ ] **IC/GB submission flow** — designers should be able to submit their own ICs directly on KeyAtlas. If KeyAtlas becomes where designers announce, you win.
- [ ] **Embed widgets** — let designers embed a "Track on KeyAtlas" badge on their Geekhack posts. Free backlinks + awareness.

### Content Creators
- [ ] **Keyboard YouTubers/streamers** — offer them early data ("here's what's trending on KeyAtlas") for their content. They link back.
- [ ] **Newsletter partnerships** — keeb newsletters (if any exist) could use KeyAtlas as a data source.

---

## Priority 5: Analytics & Measurement

### Set Up (Immediate)
- [ ] **Cloudflare Analytics** — Kenneth, add an API token with Analytics read permission. I can pull: page views, top pages, referrer sources, geographic breakdown, bot vs human traffic.
- [ ] **Google Search Console** — verify site, submit sitemap, track impressions/clicks/position for target keywords
- [ ] **Plausible or Umami** (optional) — lightweight, privacy-friendly analytics as alternative/supplement to Cloudflare

### Track Weekly
- Page views (total + per project)
- Top referrer sources (Google, Reddit, Discord, direct)
- Search Console: impressions, clicks, average position
- User signups per week
- Follows/favorites per week
- Which project pages get the most traffic (tells you what people search for)

---

## Execution Timeline

### This Week (Mar 17-23)
1. Verify/fix sitemap.xml generation
2. Submit to Google Search Console
3. Add unique meta descriptions to project pages
4. Set up Cloudflare Analytics access

### Next 2 Weeks (Mar 24 - Apr 6)
5. Add JSON-LD structured data to project pages
6. Internal cross-linking between related projects
7. First Reddit "I built this" launch post
8. RSS feed

### Month 2 (April)
9. Category/status landing pages with unique SEO content
10. Weekly digest email
11. Vendor outreach (top 5 vendors first)
12. Discord bot prototype

### Month 3+ (May onwards)
13. Blog/roundup content
14. Designer submission flow
15. Embed widgets
16. Measure everything, double down on what works

---

## The Honest Take

KeyAtlas has product-market fit potential — the keeb community genuinely needs a better way to track GBs than Geekhack threads and scattered Discord announcements. The Geekhack backfill gives you a content advantage no one else is building programmatically.

But content without distribution is invisible. **SEO is the #1 priority** because you're sitting on 362 pages of long-tail keyword content that Google can't see. Fix that and organic traffic should start flowing within 4-6 weeks.

Everything else (Reddit, Discord, partnerships) amplifies what SEO starts. Don't try to do everything at once — SEO first, community second, partnerships third.
