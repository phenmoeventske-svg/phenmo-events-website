# AGENTS.md

This workspace contains a Phenmo Events marketing website plus a staff operations portal, served
by a Node HTTP server backed by SQLite.

## Project overview
- Main entry point: [index.html](index.html)
- Styling: [style.css](style.css)
- Images and uploaded assets live in [Images](Images)
- Server and API: [server.js](server.js) with the data layer in [server/db.js](server/db.js)
- Staff portal (PWA): [staff-portal/](staff-portal)
- Tests: [test/api.test.js](test/api.test.js) — run with `npm run test`

## How to work in this codebase
- The marketing page is plain HTML/CSS — prefer direct edits in [index.html](index.html) and [style.css](style.css).
- The server uses the Node standard library only (`node:http`, `node:sqlite`, `fs`, `path`) plus `bcryptjs`. Do not add a web framework.
- Requires **Node.js 22.5+** because the data layer uses the built-in `node:sqlite` module.
- Run `npm run test` after changing the server, the data layer, or the portal's API calls.
- Preserve the existing section structure and IDs used by navigation links: `home`, `services`, `gallery`, `about`, and `contact`.
- Keep the current visual language: dark background, blue accent color, gold section labels, and strong responsive layout behavior.

## Important conventions
- The browser page uses a fixed header, hero section, services grid, gallery grid, about section, contact CTA, and footer.
- Mobile behavior is handled in [style.css](style.css) via media queries and the `.menu-toggle` / `.nav-links.is-open` pattern.
- The footer, hero buttons, gallery cards, and service cards already follow established styling patterns; match those patterns when editing.
- Asset references are case-sensitive on some systems, so preserve existing filenames such as `phenmo-logo.jpg` and the images under [Images](Images). Image names may contain spaces — keep them URL-safe when referencing.

## Recommended validation
- Open [index.html](index.html) in a browser to preview changes.
- For local serving, run `python -m http.server` from this workspace root and visit `http://localhost:8000`.

## Editing guidance
- When updating text content, keep the marketing tone for an event services business.
- When updating layout or spacing, prefer making changes in the existing CSS sections instead of adding large new styling systems.
- If new sections are added, keep them consistent with the existing card/grid patterns and responsive breakpoints.
- If the mobile menu behavior is changed, make sure the script in [index.html](index.html) still matches the new class names used in [style.css](style.css).
