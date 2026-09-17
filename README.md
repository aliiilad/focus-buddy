# Focus Buddy

**Work first, scroll later.** A free "earn your scroll time" system for iPhone: a small website plus Apple Shortcuts. No App Store, no $99 developer fee.

- A warm focus timer (the "hearth") with focus, rest, and long-rest modes, a streak, and a weekly chart.
- Opening Instagram/TikTok/etc. sends you to Focus Buddy first.
- You **earn** scroll minutes by finishing focus sessions (default: 25 min of work → 10 min of scrolling, max 60/day). Unused minutes expire at midnight.
- Spending minutes means a **10-second pause** and **writing down why** you're opening the app.
- No minutes? The **emergency unlock** makes you wait 5 min, then 10, then 20…
- Making the rules **looser takes 24 hours** to kick in. Making them **stricter is instant**.

## Why these features (the research)

| Feature | Evidence |
|---|---|
| Pause before opening | *one sec* app, [PNAS 2023](https://www.pnas.org/doi/abs/10.1073/pnas.2213114120): people gave up 36% of attempts to open an app; attempts dropped 37% over 6 weeks. [CHI 2024](https://dl.acm.org/doi/10.1145/3613904.3642370): usage bounces back fast when the friction is removed |
| Real limits beat reminders | [PNAS Nexus 2025](https://academic.oup.com/pnasnexus/article/4/2/pgaf017/8016017) RCT (n=467): blocking mobile internet for 2 weeks improved attention, mental health, and well-being |
| Precommitment (24h delay, friend's passcode) | [Allcott, Gentzkow & Song, AER 2022](https://www.aeaweb.org/articles?id=10.1257%2Faer.20210867): app limits cut social media by 22 min/day; ~31% of use comes from self-control problems |
| Earn the reward with work | Temptation bundling, [Milkman et al. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4381662/) |
| Grayscale tip | [Digital nudges RCT](https://www.researchgate.net/publication/348083401_Digital_Nudges_for_Screen_Time_Reduction_A_Randomized_Control_Trial_with_Performance_and_Wellbeing_Outcomes) and [grayscale study](https://www.tandfonline.com/doi/abs/10.1080/03623319.2020.1737461) |

**Honest limit:** Shortcuts can't truly block apps. Pair this with a Screen Time daily limit whose passcode a friend holds. That part you can't get around. See [SHORTCUTS_SETUP.md](SHORTCUTS_SETUP.md), Step 0.

## Files

| File | What it is |
|---|---|
| `index.html` | The page shell |
| `style.css` | Look and feel (light/dark) |
| `app.js` | All the logic, with comments |
| `SHORTCUTS_SETUP.md` | iPhone setup, step by step |

## Try it on your Mac

```bash
cd "/Users/aidili/cc/Focus Buddy" && python3 -m http.server 8765
```

Open http://localhost:8765/?debug=1. In debug mode 1 minute = 2 seconds and the 24h delay becomes 1 minute, and it keeps separate data. Add `&from=Instagram` to see the gate screen.

## Put it online (free)

The Shortcuts automation needs a real web address. The easiest option:

**Netlify Drop (no account setup beyond sign-in):**
1. Go to https://app.netlify.com/drop
2. Drag the `Focus Buddy` folder onto the page.
3. Copy the address it gives you (e.g. `https://something.netlify.app`). That's `YOUR-SITE` in the setup guide.

**Or GitHub Pages:**
1. Create a new public repo on github.com (e.g. `focus-buddy`) and upload `index.html`, `style.css`, `app.js`.
2. Repo **Settings → Pages** → Source: *Deploy from a branch* → `main` / root → Save.
3. After a minute your site is at `https://<username>.github.io/focus-buddy/`.

Then follow [SHORTCUTS_SETUP.md](SHORTCUTS_SETUP.md) on your iPhone.
