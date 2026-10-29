package in.sheguard.service;

import com.google.cloud.Timestamp;
import com.google.cloud.firestore.*;
import in.sheguard.safety.DataSourceAdapter;
import in.sheguard.safety.DataSourceAdapter.*;
import in.sheguard.safety.SafetyRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Registers adapters in safetySources and imports their records into safetyRecords.
 * Status values written for each source: never_fetched | ok | not_configured | requires_authorization | error.
 * "ok" is written ONLY after a successful fetch + validation. On failure, older records are left untouched.
 */
@Service
public class SafetyIngestionService {
    private final Firestore db; private final List<DataSourceAdapter> adapters; private final AuditService audit;
    @Value("${sheguard.safety.scheduled-refresh:false}") private boolean scheduled;

    public SafetyIngestionService(Firestore db, List<DataSourceAdapter> adapters, AuditService audit) { this.db = db; this.adapters = adapters; this.audit = audit; }

    public int registerAll() throws Exception {
        for (DataSourceAdapter a : adapters) {
            DocumentReference ref = db.collection("safetySources").document(a.sourceId());
            Map<String, Object> m = new HashMap<>();
            m.put("name", a.displayName()); m.put("sourceType", a.sourceType()); m.put("coverageDescription", a.coverageDescription());
            m.put("authorizationRequirement", a.authorizationRequirement());
            if (!ref.get().get().exists()) { m.put("status", "never_fetched"); m.put("recordCount", 0); }
            ref.set(m, SetOptions.merge()).get();
        }
        return adapters.size();
    }

    public Map<String, Object> refresh(String sourceId, String actorUid) throws Exception {
        DataSourceAdapter a = adapters.stream().filter(x -> x.sourceId().equals(sourceId)).findFirst().orElse(null);
        if (a == null) return Map.of("status", "unknown_source", "message", "No adapter with that id.");
        DocumentReference src = db.collection("safetySources").document(sourceId);
        try {
            FetchResult r = a.fetch();
            WriteBatch batch = db.batch(); int n = 0;
            for (SafetyRecord rec : r.records()) {           // deterministic ids → duplicates overwrite, never multiply
                batch.set(db.collection("safetyRecords").document(rec.dedupeId()), rec.toMap());
                if (++n % 400 == 0) { batch.commit().get(); batch = db.batch(); }
            }
            batch.commit().get();
            src.set(Map.of("status", "ok", "statusDetail", r.detail(), "recordCount", n, "publishedAt", r.publishedAt() == null ? "" : r.publishedAt(),
                    "retrievedAt", Timestamp.now()), SetOptions.merge()).get();
            audit.log(actorUid, "safety.refresh", sourceId, Map.of("records", n));
            return Map.of("status", "ok", "message", n + " records imported from " + a.displayName() + ".");
        } catch (SourceNotConfiguredException e) { return fail(src, "not_configured", e.getMessage()); }
        catch (SourceNotAuthorizedException e) { return fail(src, "requires_authorization", e.getMessage()); }
        catch (SourceFormatException e) { return fail(src, "error", e.getMessage()); }
        catch (Exception e) { return fail(src, "error", "Unexpected error while fetching (" + e.getClass().getSimpleName() + ")."); }
    }

    private Map<String, Object> fail(DocumentReference src, String status, String detail) throws Exception {
        src.set(Map.of("status", status, "statusDetail", detail, "lastAttemptAt", Timestamp.now()), SetOptions.merge()).get();
        return Map.of("status", status, "message", detail);
    }

    /** Runs only when SAFETY_SCHEDULED_REFRESH=true (set it after confirming the source terms permit automated refresh). */
    @Scheduled(cron = "${sheguard.safety.refresh-cron:0 0 3 1 * *}")
    public void scheduledRefresh() throws Exception {
        if (!scheduled) return;
        for (DataSourceAdapter a : adapters) refresh(a.sourceId(), "system:scheduler");
    }
}
