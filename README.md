# SiteShiftKit

A static-first website migration QA toolkit. The public site includes six browser-side utilities: URL inventory comparison, redirect-map checks, robots.txt analysis, XML sitemap parsing, canonical tag inspection, and llms.txt generation.

## Deployment

Hosted as a Render Static Site from this repository. No backend or database is required for the initial release. Tool inputs are processed in the visitor's browser; the tools do not fetch arbitrary websites or verify live HTTP status codes.

## Local preview

Open `index.html` in a modern browser or run `python3 -m http.server 8000` from the repository root.

## Roadmap

- Add server-side crawl jobs with explicit scope, rate limits and abuse controls.
- Add downloadable migration audit reports.
- Expand original technical migration guides and case studies.
- Add privacy-preserving usage analytics after disclosure and consent review.

## Keyword research

Initial US keyword hypotheses are documented in the project research notes. Third-party keyword estimates are directional, not traffic guarantees.
