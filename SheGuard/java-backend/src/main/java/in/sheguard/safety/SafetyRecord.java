package in.sheguard.safety;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Common safety-data structure (spec §3). Fields the source does not supply stay null — never guessed.
 * `count` and `reportingPeriod` are extra fields used for aggregate statistics (one record = one table row,
 * NOT one incident). Aggregates have null coordinates and precision "state"/"district", so the route
 * scorer ignores them.
 */
public record SafetyRecord(
        String sourceId, String sourceName,
        String sourceType,            // official_aggregate_statistics | official_incident_feed | official_directory
        String incidentCategory, Double latitude, Double longitude, String area,
        String occurredAt,            // ISO-8601 or null (aggregates have only a reportingPeriod)
        String publishedAt,           // ISO date of the dataset publication, or null
        String retrievedAt,
        String verificationStatus,    // "official_publication" | null
        String dataFreshness,         // e.g. "annual statistics for 2022"
        String geographicPrecision,   // point | street | locality | district | state | national
        String sourceUrl,
        Long count, String reportingPeriod) {

    /** Deterministic id → re-importing the same row overwrites instead of duplicating. */
    public String dedupeId() {
        String key = String.join("|", sourceId, String.valueOf(area), String.valueOf(incidentCategory), String.valueOf(reportingPeriod),
                String.valueOf(latitude), String.valueOf(longitude), String.valueOf(occurredAt));
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8))).substring(0, 40); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sourceId", sourceId); m.put("sourceName", sourceName); m.put("sourceType", sourceType);
        m.put("incidentCategory", incidentCategory); m.put("latitude", latitude); m.put("longitude", longitude); m.put("area", area);
        m.put("occurredAt", occurredAt); m.put("publishedAt", publishedAt); m.put("retrievedAt", retrievedAt);
        m.put("verificationStatus", verificationStatus); m.put("dataFreshness", dataFreshness);
        m.put("geographicPrecision", geographicPrecision); m.put("sourceUrl", sourceUrl);
        m.put("count", count); m.put("reportingPeriod", reportingPeriod);
        return m;
    }
}
