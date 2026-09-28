# Launch checklist

To be useful for the tight days NESO expects in mid-to-late January, the national layer needs to be live by early December 2026.

## Product and data

- [ ] Verify the Elexon adapters against live data ([DATA-SOURCES.md](DATA-SOURCES.md)) and replace the synthetic test fixtures with real ones.
- [ ] Confirm the rota letter set and the rotation protocol details from the primary documents.
- [ ] Decide how rotation schedules will reach us (feed, or operator entry with a two-person check) and rehearse it.
- [ ] Have every user-facing sentence about notices checked by someone with grid operations experience.
- [ ] Test with real users, including older people and someone who relies on medical equipment.
- [ ] Commission an accessibility audit against WCAG 2.2 AA; the build targets it but hasn't been independently tested.

## Name and brand

- [ ] Clear the name: search the UKIPO trade mark register (classes 9 and 42), and check domains and app store names. The working name "Mainsight" passed a quick web search only.
- [ ] Don't use "National Grid" or NESO branding. Keep the "not affiliated" line.

## Legal and compliance

- [ ] Set up the company, register with the ICO and pay the fee.
- [ ] Publish a privacy notice and terms of use, reviewed by a solicitor. Include a clear disclaimer: the app explains official information and can't guarantee warnings.
- [ ] Complete a DPIA.
- [ ] Follow ASA/CAP rules in marketing: no fear-based claims, no overclaiming accuracy.
- [ ] Check data licence terms and attribution for every source.

## Infrastructure and operations

- [ ] Domain, DNS, TLS and HSTS preload once stable.
- [ ] Host the static site with `_headers` support, and the API in a UK or EU region with backups of the SQLite database and archive.
- [ ] Put VAPID keys and the admin token in a secret manager.
- [ ] Monitor feed health and push failure rates, and page someone when the critical feed is stale.
- [ ] Have an on-call rota for winter evenings, and a runbook for "NESO issues a notice" and "rotation announced".
- [ ] Commission an independent penetration test.
- [ ] Pin GitHub Actions to SHAs, and enable Dependabot alerts, secret scanning and CodeQL.

## App stores (after the PWA)

- [ ] Apple Developer and Google Play accounts.
- [ ] Capacitor shells, and FCM and APNs push ([PORTING.md](PORTING.md)).
- [ ] Privacy labels and the data safety form.
