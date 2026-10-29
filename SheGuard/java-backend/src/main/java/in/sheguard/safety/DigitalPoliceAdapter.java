package in.sheguard.safety;

import org.springframework.stereotype.Component;

/**
 * Digital Police Portal (https://digitalpolice.gov.in/) — PLACEHOLDER, deliberately not connected.
 * The portal's citizen services and case data sit behind login/CAPTCHA and restricted police systems; we found no
 * documented public API for incident data. This adapter therefore never fetches anything. If an authorised
 * feed is granted to you, implement fetch() here (and only here); the rest of SheGuard needs no change.
 */
@Component
public class DigitalPoliceAdapter implements DataSourceAdapter {
    @Override public String sourceId() { return "digital-police-portal"; }
    @Override public String displayName() { return "Digital Police Portal (not connected)"; }
    @Override public String sourceType() { return "official_incident_feed"; }
    @Override public String coverageDescription() { return "None — no authorised public data access."; }
    @Override public String authorizationRequirement() { return "Authorisation from the data owner (police/MHA) — not publicly available."; }
    @Override public FetchResult fetch() throws SourceNotAuthorizedException {
        throw new SourceNotAuthorizedException("No permitted public API. Request authorised access from the portal owners; scraping or bypassing login is not done.");
    }
}
