# Batch GEO — Bulk AI Crawler Readiness Scanner

Paste 20–60 domains, get back whether GPTBot, ClaudeBot, PerplexityBot,
Google-Extended and other AI crawlers can actually read each site — in one
pass. Built for agencies auditing a whole client list or prospect list at
once, since every checker I found online only does one domain at a time.

## No paid API, no card, ever

Everything this checks is public data any browser can fetch — `robots.txt`,
`llms.txt`, and the homepage HTML. There is no third-party data provider,
no API key, no signup required to run this. That also means: no ongoing
cost to you no matter how much it gets used.

## What it checks (and how it's scored, out of 100)

| Check | Points | What it means |
|---|---|---|
| AI crawler access | 40 | Are GPTBot / ClaudeBot / PerplexityBot / etc. blocked in robots.txt? |
| llms.txt present | 15 | Does the site publish an llms.txt file for AI crawlers? |
| Structured data | 20 | Is there JSON-LD schema markup on the homepage? |
| Meta signals | 15 | Reasonable title + meta description present? |
| Renders without JS | 10 | Is there real text in the HTML, or is it an empty shell that needs JavaScript to render? |

80+ = Good, 50–79 = Needs work, under 50 = Poor.

**Be upfront with anyone using this: these are heuristic checks, not an
official validator.** The bot list needs periodic updates (new AI crawlers
appear every few months), and the "renders without JS" check is a rough
approximation, not a real headless-browser render. Good enough to flag
obvious problems, not good enough to be the final word — tell users to
verify anything important manually before acting on it.

## Quick start

```bash
npm install
npm start
```

Open http://localhost:3000 — that's it, no `.env`, no keys.

## Project structure

```
server.js          Express backend — fetches robots.txt/llms.txt/homepage, scores each domain
public/index.html  Page structure
public/style.css   UI styling
public/app.js      Domain parsing, table render, sort, CSV export
```

---

## How to make this public (verified free, no card required, mid-2026)

You need somewhere that can run a persistent Node.js process (not a static
site host — this has a backend that does the fetching). Two solid free
options that genuinely don't ask for a card:

### Option A: Render (recommended — most established, good docs)

1. Push this project to a GitHub repo (create a free GitHub account if you
   don't have one — also no card required).
2. Go to render.com, sign up with your GitHub account.
3. Click **New → Web Service**, connect your repo.
4. Build command: `npm install`. Start command: `npm start`.
5. Choose the **Free** instance type.
6. Deploy. Render gives you a live URL like `your-app.onrender.com`.

**Honest limitation:** Render's free tier spins your app down after 15
minutes of no traffic, and the next visitor waits 30–60 seconds for it to
wake back up. Fine for early traction-testing; annoying once you have real
regular users — that's when it's worth the $7/mo Starter tier.

### Option B: Bonto (simplest — paste code directly in browser, no GitHub needed)

1. Go to bonto.dev, sign up (no card required).
2. Use their browser-based editor to paste in your project files, or connect
   git if you have a repo.
3. It auto-detects Node.js, installs dependencies, and deploys to a
   `your-app.bonto.run` URL.

**Honest limitation:** free tier gives 75 runtime hours/month — fine for
testing and early traffic, but track usage if it starts getting real
visitors.

### After it's live, either way:

- **Custom domain**: both platforms support connecting your own domain name
  (you'd buy that separately, e.g. via Namecheap/Porkbun — that part does
  cost a few dollars/year, no way around owning a domain being paid). Not
  required to launch — the free subdomain works fine for testing traction
  first.
- **Getting traffic**: the tool being free to run doesn't mean people will
  find it. Post it in SEO/agency communities (relevant subreddits, Indie
  Hackers, agency Slack/Discord groups, LinkedIn), and consider a short
  post explaining the "bulk vs single-domain" angle — that's your actual
  differentiator, lead with it.
