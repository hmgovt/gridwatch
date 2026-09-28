# Privacy design

Mainsight is built to work without knowing who or where its users are. This page is the engineering record of what we collect, why, and for how long. It feeds the public privacy notice and the data protection impact assessment, but it is **not legal advice**; have both reviewed before launch.

## Data inventory

| Data | Where it lives | Why | Kept for |
|---|---|---|---|
| Rota letter (one of 18) | Device; server only if alerts are on | Tell the user whether their block is in a rotating power cut | Until changed or deleted |
| Alert preference (3 levels) | Device; server only if alerts are on | Decide which alerts to send | Until changed or deleted |
| Browser push address and keys | Server only, if alerts are on | Deliver alerts (issued by Google, Mozilla, Apple or Microsoft) | Until alerts are turned off, the push service says it has expired, or 180 days without the app being opened |
| Hashed alert token | Server | Let the device change or delete its own registration | As above |
| Last opened date (day precision) | Server, if alerts are on | Remove abandoned registrations | As above |
| Delivery log (registration id + alert key) | Server | Never send the same alert twice | 30 days |
| Theme, onboarding flag, last status | Device only | App settings and offline use | Until deleted |

**Never collected:** name, email, phone number, postal address, precise or approximate location, contacts, device identifiers, advertising IDs, analytics or tracking cookies.

**Postcodes:** the app does not ask for one yet. When local fault forecasts arrive, only the outward code (such as `SW1A`, covering thousands of homes) will be used. The core library already reduces any full postcode on the device (`toOutwardCode`).

**Health information:** we deliberately never ask whether someone relies on medical equipment, because that is special category data. The app tells people to contact 105 or their supplier's Priority Services Register instead.

## Request logs and IP addresses

The API does not write IP addresses to logs or to the database. Rate limiting uses a salted hash held in memory only, and the salt changes on every restart. Hosting providers and CDNs will see IP addresses at the network edge; choose providers whose logs are UK or EU hosted and short-lived, and list them as processors.

## Lawful basis (to confirm with a lawyer)

- **Core service** (showing grid status): no personal data is needed.
- **Alerts**: the user asks for them and can turn them off in one tap. Likely legitimate interests or contract; consent under PECR for the device storage is not needed for storage strictly necessary for a service the user requests.
- **No cookies** are used, so no cookie banner is needed. Local storage is used only for settings the user asked for.

## User rights

- **Access:** everything held server-side is shown in Settings → Your privacy.
- **Erasure:** Settings → Delete everything removes device data and deletes the server registration immediately (`DELETE /v1/push/subscriptions/:id`).
- **Objection or restriction:** turning alerts off stops all processing.

## Processors and transfers

| Processor | Purpose | Notes |
|---|---|---|
| Hosting (TBC) | API and static site | Prefer UK or EU regions |
| Browser push services (Google FCM, Mozilla, Apple, Microsoft WNS) | Deliver notifications | Payloads are end-to-end encrypted (RFC 8291); the service sees only timing and size |

## Before launch

- Register with the ICO and pay the data protection fee.
- Publish a privacy notice written from this page.
- Complete a DPIA. Alerts about power loss can matter for vulnerable people, even though we do not collect their details.
- Complete the App Store privacy label and the Google Play data safety form (see [PORTING.md](PORTING.md)).
