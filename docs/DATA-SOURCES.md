# Data sources

Status key: **Built** = adapter written and tested against recorded samples. **VERIFY** = not yet checked against the live service. **Planned** = not built yet.

## In use

| Source | What we take | Cadence | Licence | Status |
|---|---|---|---|---|
| Elexon BMRS: system warnings (`/datasets/SYSWARN`) | Margin notices, capacity market notices, high risk of demand reduction, demand control imminent, and their cancellations | Every 2 min | BMRS open data licence; attribution required | Built, **VERIFY** |
| Elexon BMRS: loss of load probability and de-rated margin (`/forecast/system/loss-of-load`) | Spare-capacity forecast by settlement period (1–12 h ahead) | Every 15 min | As above | Built, **VERIFY** |
| Elexon BMRS: system frequency (`/system/frequency`) | Latest frequency | Every 1 min | As above | Built, **VERIFY** |
| Rotation schedule (Demand Control Rotation Protocol) | Which rota blocks are off, and when | When announced | – | Operator route (`PUT /v1/admin/rotation`) until a machine-readable feed exists |

Attribution shown in the app: "Contains BMRS data © Elexon Limited copyright and database right 2026."

## What to verify first

The build environment could not reach Elexon, so these were written from Elexon's published API as we understand it. Run `pnpm --filter @gridwatch/api ingest:once` from a machine with internet access, then check each item:

1. **Endpoint paths and query parameters** in `services/api/src/sources/elexon.ts` (`ELEXON_PATHS`, and parameter names such as `publishDateTimeFrom` and `from`/`to`).
2. **Field names**: `publishTime`, `warningType` and `warningText` for SYSWARN; `lossOfLoadProbability`, `deratedMargin`, `forecastHorizon` and `startTime` for the loss-of-load forecast; `measurementTime` and `frequency` for frequency. The schemas accept a few alternatives, and anything unrecognised fails loudly in source health rather than silently.
3. **Warning wording**: the classifier and window parser in `packages/core/src/notices.ts` were tested on synthetic messages. Replace `services/api/test/fixtures/*.json` with real archived responses and extend the tests.
4. **Rota letters**: the 18 letters (A–U without I, O and Q) in `packages/core/src/rota.ts` should be confirmed against the ESEC guidance revised in April 2026.
5. **The Demand Control Rotation Protocol's notice period** (reported as about 8 hours), how schedules will be published, and whether they are machine-readable. Check the GC0176 legal text and the ESEC guidance.

## Planned

| Source | Why | Notes |
|---|---|---|
| Network operators' live faults and planned outages (UKPN, NGED, SSEN, SPEN, Northern Powergrid, Electricity North West, NIE Networks) | Local power cuts and planned work (at least 2 days' notice) | Open data portals; licences and formats vary. Start archiving as soon as possible: this is the training data for local forecasts. |
| NESO Data Portal: demand, wind and solar forecasts, constraint limits | Forecasting grid stress before notices are issued; the north–south constraint | NESO Open Data Licence |
| Elexon REMIT (power station outages) | Available generation | – |
| Met Office: severe weather warnings (free), DataHub (paid) | Storm risk | DataHub is needed for commercial detail |
| ECMWF open data / archived forecasts | Training storm models on the forecasts that were actually available at the time, not reanalysis | CC-BY 4.0 |
| Environment Agency, SEPA and NRW flood warnings | Substation flood risk | Open Government Licence |
