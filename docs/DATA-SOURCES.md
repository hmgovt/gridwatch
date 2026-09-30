# Data sources

Status key: **Verified** = adapter checked against the live service, with real responses kept as test fixtures. **Planned** = not built yet.

## In use

| Source | What we take | Cadence | Licence | Status |
|---|---|---|---|---|
| Elexon BMRS: system warnings (`/datasets/SYSWARN`) | Margin notices, capacity market notices, high risk of demand reduction, demand control imminent, and their cancellations | Server every 2 min; phone every ~15 min in the background, every minute while open | BMRS open data licence; attribution required | Verified 29 Sep 2026 |
| Elexon BMRS: loss of load probability and de-rated margin (`/forecast/system/loss-of-load`) | Spare-capacity forecast by settlement period (1, 2, 4, 8 and 12 h ahead) | Every 10–15 min | As above | Verified 29 Sep 2026 |
| Elexon BMRS: system frequency (`/system/frequency`) | Frequency, one reading every 15 s | Every 1 min | As above | Verified 29 Sep 2026 |
| Rotation schedule (Demand Control Rotation Protocol) | Which rota blocks are off, and when | When announced | – | Operator route (`PUT /v1/admin/rotation`) until a machine-readable feed exists |

Attribution shown in the app: "Contains BMRS data © Elexon Limited copyright and database right 2026."

All three endpoints send `Access-Control-Allow-Origin: *`, which is what lets the Android app read them directly from the phone.

## What the live check found (29 September 2026)

Paths, parameters and field names were as expected, with one exception: `from` and `to` are **required** on the loss-of-load endpoint. The parsers live in `packages/core/src/elexon.ts`, shared by the server and the phone, and fail loudly (into source health) if a feed changes shape.

- **History:** SYSWARN goes back to May 2023. Out of 1,691 messages: 22 margin notices (in six sequences, every one cancelled), 7 capacity market notices, and the rest routine (SO–SO trades, IT outages, Demand Flexibility Service tests, negative reserve warnings). The parser classifies all of them correctly; `packages/core/test/fixtures/syswarn-history.json` keeps the relevant ones as a regression test.
- **Text format:** messages mix real line breaks with literal `\n` sequences. `sanitiseText` turns both into line breaks, so the official wording displays as NESO wrote it.
- **Capacity market notices** give a start time ("Commencement time of notice: 17:30 on 03/12/2024") but no end, so the app treats them as current for 12 hours after the last message.
- **Scale:** on the 28 September margin-notice day, the de-rated margin forecast never fell below about 5.3 GW, and the loss of load probability was 0 throughout. A margin notice measures shortfall against NESO's operating requirement (reserve plus network constraints), not against zero. The app never presents a margin figure as "how close to power cuts".
- **The 28 September notice**, as published: issued 00:30 BST (1,400 MW shortfall, 16:00–19:00), updated 12:00 (104 MW), cancelled at 15:00. The press reported 15:58 for the cancellation; the feed says 15:00. The replay scenario is built from these messages verbatim (`packages/core/src/replay-2026-09-28.ts`).
- **Demand Flexibility Service** messages stopped appearing on SYSWARN after March 2024.

## Backtest: the 2–14 day margin forecast (OCNMFD)

Checked 30 September 2026 against every forecast published June–September 2026 (36,452 rows, from `/datasets/OCNMFD/stream`, 7 days per request). "Lowest x%" ranks the day's forecast spare margin, made 2–5 days ahead, among 113 summer days (median 6,608 MW).

| Margin notice day | 9–15 days ahead | 5–9 days ahead | 2–5 days ahead |
|---|---|---|---|
| 24 Jun | 6,330 MW | 209 MW | −1,015 MW (lowest 2%) |
| 26 Jun | 5,982 | 4,833 | 4,532 (lowest 27%) |
| 9 Jul | 3,884 | 2,154 | 1,977 (lowest 11%) |
| 12 Aug | 6,474 | 6,473 | 6,048 (lowest 42%) |
| 28 Sep | 8,821 | −1,088 | −1,141 (lowest of the summer) |

- **3 of 5 notice days stood out days ahead**, and 28 September was flagged a week ahead.
- **It also flags quiet days:** 9, 13 and 22 September and 30 June were in the lowest ten but had no notice.
- So it's a "watch" signal for an outlook, not a warning. Combine it with wind, demand and outage data before promising anything.

## Still to verify

1. **Rota letters:** the 18 letters (A–U without I, O and Q) in `packages/core/src/rota.ts` should be confirmed against the ESEC guidance revised in April 2026.
2. **The Demand Control Rotation Protocol:** the notice period (reported as about 8 hours), how schedules will be published, and whether in a machine-readable form. Check the GC0176 legal text and the ESEC guidance. The wording of HRDR, DCI and DCRP messages has never appeared in the feed since May 2023, so their patterns are still based on the Grid Code terms.

## Planned

| Source | Why | Notes |
|---|---|---|
| Network operators' live faults and planned outages (UKPN, NGED, SSEN, SPEN, Northern Powergrid, Electricity North West, NIE Networks) | Local power cuts and planned work (at least 2 days' notice) | Open data portals; licences and formats vary. Start archiving as soon as possible: this is the training data for local forecasts. |
| NESO Data Portal: demand, wind and solar forecasts, constraint limits | Forecasting grid stress before notices are issued; the north–south constraint | NESO Open Data Licence |
| Elexon REMIT (power station outages) | Available generation | – |
| Met Office: severe weather warnings (free), DataHub (paid) | Storm risk | DataHub is needed for commercial detail |
| ECMWF open data / archived forecasts | Training storm models on the forecasts that were actually available at the time, not reanalysis | CC-BY 4.0 |
| Environment Agency, SEPA and NRW flood warnings | Substation flood risk | Open Government Licence |
