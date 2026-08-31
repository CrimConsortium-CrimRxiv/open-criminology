# Is Your Criminology Open? — A Utilitarian Assessment

A CrimConsortium tool. A single-page, fully client-side assessment that helps criminology
researchers and teachers evaluate one specific output (research or teaching) and improve
how open and useful it is for the greater good.

- Live site: https://open.crimconsortium.com/
- Part of the same family as the
  [Faculty Explorer](https://faculty.crimconsortium.com/),
  [Mentor Match](https://mentors.crimconsortium.com/), and
  [Criminology Jobs](https://jobs.crimconsortium.com/) dashboards.

## What it does

You pick one output — Research or Teaching, then Finished/Current/Planned, then the item
type, then a short name. The tool asks a set of concrete, behavioral, multiple-choice
questions that adapt to those choices. It returns:

- An **openness band** — Very Closed, Closed, Mixed, Open, or Very Open.
- A **profile** describing the pattern of choices (e.g., "Reachable but unlicensed",
  "Visible but not reusable").
- A list of **concrete next steps**, ordered by how many openness points each would add.
- A full **scoring breakdown** in a drawer.
- A **downloadable summary** (HTML).
- A **certificate** — for finished outputs that score Open or Very Open only.

## Framework

Questions and scoring draw on widely used standards, adapted for criminology and
criminal justice:

- [TOP Guidelines](https://www.cos.io/initiatives/top-guidelines) (Center for Open Science)
- [Open Science Badges](https://www.cos.io/initiatives/badges)
- [FAIR data principles](https://www.go-fair.org/fair-principles/)
- [Preregistration](https://www.cos.io/initiatives/prereg)
- [OER Achieve rubrics](https://www.achieve.org/files/AchieveOERRubrics.pdf)
- Rights retention and the green / gold / diamond open access landscape

## Privacy

Fully client-side. No backend, no cookies, no localStorage, no analytics, no tracking,
no saving of responses, no network requests during use except page assets (HTML, CSS,
JS, fonts). All scoring and downloads are built in the browser.

## Structure

- `index.html` — single page entry point
- `style.css` — CrimConsortium design system (inherited from the rest of the family)
- `app.js` — assessment engine, scoring, results, downloads

## Local development

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Credits

A [CrimConsortium](https://crimconsortium.com) tool. Browse and post open criminology at
[CrimRxiv](https://crimrxiv.com).
