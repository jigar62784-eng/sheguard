# SheGuard — route comparison, incident reporting and emergency tools

Vanilla HTML/CSS/JS (ES modules) + Firebase (Auth, Firestore, Storage, Analytics) + Google Maps Platform.
An optional Spring Boot backend handles only what cannot be done safely in a browser (SOS dispatch, secret-bearing proxies, official-data import).

> **Status honesty.** Out of the box **no official safety dataset is connected**, no notification provider is configured, and the Firebase/Maps values are placeholders. The app detects this and says so; it never simulates success. The sections below say exactly what you must do to turn each part on.
> The JavaScript was syntax-checked and the geometry/scoring logic was run against synthetic inputs. The Java backend was **not compiled or run** by the author of this package (no JDK/Maven was available) — run `mvn test` first.

## 1. Requirements
- A Firebase project (Blaze plan is required for Storage in new projects and for production use of cross-service rules).
- Node.js 18+ (only for the Firebase CLI: `npm i -g firebase-tools`).
- A Google Cloud project with billing for Maps Platform.
- JDK 17 + Maven 3.9 (only for `java-backend`).
- Any static file server for local testing (`python3 -m http.server 5500`). ES modules do not work from `file://`.

## 2. Firebase setup
1. Firebase console → Add project (or use your existing one) → **Project settings → Your apps → Web app** → copy the config into `js/firebase-config.js`. (`measurementId` is only needed for Analytics.)
2. **Authentication → Sign-in method**: enable **Email/Password** and (optional) **Google**. Under **Settings → Authorized domains** add your hosting domain (`localhost` is there by default).
3. **Firestore Database → Create database** (production mode, choose a region close to users, e.g. `asia-south1`).
4. **Storage → Get started** (same region).
5. **Analytics**: enable Google Analytics for the project if you want it. SheGuard keeps collection **off** until a user ticks the consent box in Settings.
6. Deploy rules and indexes:
   ```bash
   firebase login
   firebase use --add          # pick your project
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
   The first Storage deploy may ask to let Storage rules read Firestore (needed to check report ownership). Accept it.
7. Wait for the `reportOwners` index to finish building (console → Firestore → Indexes) before opening *My reports*.

### Collections created on first use
`users/{uid}` (+ `contacts`, `journeys`, `alerts`), `reports/{reference}`, `reportOwners/{reference}`, `auditLogs`, `safetySources`, `safetyRecords`. Nothing needs to be created by hand.

### Making someone an administrator
Admin = custom claim `admin: true`; never a Firestore field.
```bash
cd java-backend
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json   # Firebase console → Project settings → Service accounts
GRANT_ADMIN_EMAIL=reviewer@example.com mvn spring-boot:run            # stop it after the "Granted admin claim" line
```
The reviewer then logs out and in once. Keep the service-account file out of git and out of the web root.

## 3. Google Maps setup
1. Google Cloud Console → select the project → **Billing** enabled.
2. **APIs & Services → Library**: enable **Maps JavaScript API**, **Places API (New)**, **Routes API**.
3. **Credentials → Create API key**. Restrict **Application** to *Websites* (your domain and `http://localhost:*`) and **API restrictions** to those three APIs. Set daily quotas/budget alerts.
4. Put the key in `js/maps-config.js` (separate from Firebase config).
5. If Routes API rejects browser calls with your restrictions, set `routesMode: "proxy"`, set `GOOGLE_ROUTES_API_KEY` on the backend (restrict that key by server IP + Routes API), and run the backend.

Cycling (`BICYCLE`) is passed through; Google returns an error where it is unsupported and the UI shows it.

## 4. Running
```bash
# frontend
python3 -m http.server 5500          # open http://localhost:5500
# backend (optional but required for SOS and data import)
cd java-backend && mvn test && mvn spring-boot:run
```
Backend environment variables are listed in `java-backend/src/main/resources/application.properties`. Set `ALLOWED_ORIGINS` to your site origin and `backendBaseUrl` in `js/maps-config.js` to the backend URL.

## 5. Data sources — what is actually connected
| Source | Access found | Status in this package |
|---|---|---|
| data.gov.in (OGD India) | Free account + API key; REST `GET api.data.gov.in/resource/{id}`. Only some catalogue entries expose an API; several NCRB entries state the API does not exist or are PDF-only. | **Adapter implemented, not connected.** Needs `DATAGOVIN_API_KEY` + a resource id with an API + column mapping. Status becomes `ok` only after a successful fetch and validation. |
| NCRB "Crime in India" | Published as annual tables by state / metropolitan city (via data.gov.in or ncrb.gov.in PDFs). | Aggregate statistics only: no coordinates, no individual incidents, not real time. Stored with `geographicPrecision = state/district` and never drawn on a route. |
| Digital Police portal (digitalpolice.gov.in) | No documented public incident API found; services sit behind login/CAPTCHA. | **Not connected.** `DigitalPoliceAdapter` is a placeholder that refuses to fetch. Scraping or bypassing login is not done. Obtain authorisation, then implement `fetch()` there. |
| State / district police portals | Vary by state; none verified. | Not connected. Add a `DataSourceAdapter` per source after reading its terms. |
| Google Maps/Places | Used for nearby police stations, hospitals, fire stations. | Connected once you add a key. These are **map listings, not verified by SheGuard**, and the UI says so. |
| National helplines (112, 1091, 181, 1930, 108) | Published by the government; static list in `js/data/official-contacts.js` with source links. | Static reference; confirm locally. |

Before enabling any source, re-read its terms, publication date, precision and permitted use. Imported records store source name, publication date, coverage description, retrieval time and status (`safetySources`, `safetyRecords`). Refresh is manual (Admin → Refresh) unless you set `SAFETY_SCHEDULED_REFRESH=true` after confirming automated refresh is allowed (default monthly cron).

## 6. Route comparison and its limits
- Routes come from the Routes API response (geometry, distance, durations, steps). Driving uses `TRAFFIC_AWARE`.
- **Recorded-incident density** (`js/safety/scoring.js`) counts stored point/street/locality-level records inside a corridor (default 150 m) around each route, de-duplicated, weighted by `0.5^(age/half-life)` for dated records only (half-life 365 days, ignore older than 3 years — adjustable assumptions, not research findings), divided by route km. Every category counts equally; no arbitrary weights.
- It returns **"Insufficient safety data"** when there are no usable records, fewer than 10 matches across the candidate routes, or a route leaves the source's declared coverage (`coverageBox` on the `safetySources` document, which only point-level adapters should set). With only aggregate sources connected, you will always see this message — that is correct.
- Fewer records ≠ safe; more records ≠ dangerous (reporting rates differ). Nothing is ever labelled safe.

## 7. Reports and SOS
- A report is saved to Firestore; "submitted to an agency" and "acknowledged" stay **no** until a real integration sets them (reviewers cannot set them either — see rules).
- "Hide my identity from reviewers": the report document holds no user id; the link lives in `reportOwners/{ref}`, which reviewers cannot read when anonymous. Evidence paths contain only the reference. The UI says reviewers cannot see identity; note that Firebase project owners with console access can still read all data.
- SOS: browser creates `users/{uid}/alerts/{id}` (`requested`) → backend dispatches via Twilio → per-recipient status `accepted_by_provider` → `delivered` only after a **signed** Twilio webhook (`PUBLIC_BASE_URL` must be public https). Email is **not implemented**. For Indian SMS, Twilio/TRAI DLT sender registration applies. Without credentials, status is `not_configured` and the user is told nobody was notified.

## 8. Security and privacy notes
- Authorization is enforced by `firestore.rules` / `storage.rules`; UI checks are convenience only. Review them with the Rules Playground and the emulator before launch.
- No server secrets in the frontend. Firebase web config and a referrer-restricted Maps key are public by design.
- Location is read only after an explicit click and browser permission; report coordinates are rounded to ~1 km.
- Audit entries for reviewer actions are written from the admin's browser (rules force `actorUid` = their uid and block edits/deletes); backend actions write their own entries via the Admin SDK.
- Add Firebase App Check and a Content-Security-Policy header at your host for production hardening.

## 9. Testing real failures
- Wrong Maps key → `gm_authFailure` message; remove billing → Routes `403`; set a tiny quota → `429` message; type nonsense places → "Pick … from the suggestions"; deny location → permission-denied message; offline devtools → network messages.
- Stop the backend → SOS shows "Nobody has been notified" with Retry. Leave Twilio unset → `not_configured`.
- Rules: sign in as user B and try `getDoc(reports/<A's ref>)` → `permission-denied`. `cd java-backend && mvn test` covers source parsing, rate limiting and the routes-proxy field allow-list.

## 10. Files
`index/login/register/dashboard/safe-routes/report-incident/my-reports/emergency-services/trusted-contacts/settings/admin-dashboard.html` · `css/styles.css` · `js/` (`firebase-config.js`, `maps-config.js`, `firebase.js`, `auth.js`, `db.js`, `guard.js`, `ui.js`, `maps-loader.js`, `safety/{geo,scoring,routes-api,support}.js`, `pages/*.js`, `data/official-contacts.js`) · `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` · `java-backend/` (Spring Boot).
