package in.sheguard.safety;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Open Government Data Platform India (data.gov.in) adapter — official, documented API:
 *   GET https://api.data.gov.in/resource/{resource-id}?api-key=KEY&format=json&offset=0&limit=100
 * Facts this adapter respects (verified against the platform's public catalogue/docs):
 *  - An API key (free account) is required.
 *  - Only catalogue entries that expose an API work; many NCRB entries state "API does not exist" or are PDFs.
 *    So YOU must pick a resource id that has an API and map its column names in application.properties.
 *  - NCRB "Crime in India" tables are ANNUAL AGGREGATES by state / metropolitan city. They contain no
 *    coordinates, no individual incidents and no real-time alerts. They are stored as such
 *    (geographicPrecision = state/district, lat/lng = null) and are NOT drawn onto routes.
 */
@Component
public class DataGovInAdapter implements DataSourceAdapter {
    @Value("${sheguard.datagovin.api-key:}") private String apiKey;
    @Value("${sheguard.datagovin.resource-id:}") private String resourceId;
    @Value("${sheguard.datagovin.catalog-url:}") private String catalogUrl;
    @Value("${sheguard.datagovin.dataset-name:data.gov.in dataset}") private String datasetName;
    @Value("${sheguard.datagovin.coverage-description:}") private String coverage;
    @Value("${sheguard.datagovin.geographic-precision:state}") private String precision;
    @Value("${sheguard.datagovin.field-area:state_ut}") private String fArea;
    @Value("${sheguard.datagovin.field-category:crime_head}") private String fCategory;
    @Value("${sheguard.datagovin.field-period:year}") private String fPeriod;
    @Value("${sheguard.datagovin.field-count:cases}") private String fCount;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper mapper = new ObjectMapper();
    private static final int PAGE = 100, MAX_PAGES = 50;

    @Override public String sourceId() { return "datagovin-" + (resourceId.isBlank() ? "unconfigured" : resourceId); }
    @Override public String displayName() { return datasetName; }
    @Override public String sourceType() { return "official_aggregate_statistics"; }
    @Override public String coverageDescription() { return coverage; }
    @Override public String authorizationRequirement() { return "Free data.gov.in account → API key; dataset must expose an API."; }

    @Override public FetchResult fetch() throws Exception {
        if (apiKey.isBlank() || resourceId.isBlank()) throw new SourceNotConfiguredException("Set DATAGOVIN_API_KEY and DATAGOVIN_RESOURCE_ID.");
        List<SafetyRecord> all = new ArrayList<>();
        String published = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            String url = "https://api.data.gov.in/resource/" + resourceId + "?api-key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8)
                    + "&format=json&limit=" + PAGE + "&offset=" + (page * PAGE);
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30)).GET().build(), HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() == 401 || r.statusCode() == 403) throw new SourceNotAuthorizedException("data.gov.in rejected the API key (HTTP " + r.statusCode() + ").");
            if (r.statusCode() / 100 != 2) throw new SourceFormatException("data.gov.in returned HTTP " + r.statusCode());
            Parsed p = parse(r.body(), Instant.now().toString());
            if (published == null) published = p.updated;
            all.addAll(p.records);
            if (p.rawCount < PAGE) break;
        }
        return new FetchResult(all, published, all.size() + " rows retrieved");
    }

    record Parsed(List<SafetyRecord> records, int rawCount, String updated) {}

    /** Validates structure and normalises rows. Package-private so unit tests can feed it fixtures. */
    Parsed parse(String json, String retrievedAt) throws SourceFormatException {
        JsonNode root;
        try { root = mapper.readTree(json); } catch (Exception e) { throw new SourceFormatException("Response is not valid JSON."); }
        JsonNode rows = root.path("records");
        if (!rows.isArray()) throw new SourceFormatException("Response has no 'records' array — the API format may have changed.");
        String updated = root.hasNonNull("updated_date") ? root.get("updated_date").asText() : null;
        List<SafetyRecord> out = new ArrayList<>();
        for (JsonNode row : rows) {
            String area = text(row, fArea), cat = text(row, fCategory), period = text(row, fPeriod);
            Long count = parseLong(text(row, fCount));
            if (area == null && cat == null && count == null) continue;   // skip unusable rows; never invent values
            out.add(new SafetyRecord(sourceId(), displayName(), sourceType(), cat, null, null, area, null, updated, retrievedAt,
                    "official_publication", period == null ? null : "annual statistics for " + period, precision,
                    catalogUrl.isBlank() ? null : catalogUrl, count, period));
        }
        return new Parsed(out, rows.size(), updated);
    }

    private static String text(JsonNode n, String f) { JsonNode v = n.get(f); return v == null || v.isNull() || v.asText().isBlank() ? null : v.asText().trim(); }
    private static Long parseLong(String s) { try { return s == null ? null : Long.parseLong(s.replace(",", "")); } catch (NumberFormatException e) { return null; } }
}
