package in.sheguard.safety;

import java.util.List;

/**
 * Adapter contract for every official data source (spec §11). To add a future police integration,
 * implement this interface and register it as a Spring @Component — route planning needs no change,
 * because it only reads normalised records from Firestore.
 *
 * An implementation MUST: retrieve data only through a permitted method; validate the response format;
 * normalise only fields the source really provides; stamp retrievedAt; never fabricate records;
 * and throw SourceNotConfigured / SourceNotAuthorized instead of faking success.
 */
public interface DataSourceAdapter {
    /** Stable id, used as the Firestore document id in safetySources. */
    String sourceId();
    String displayName();
    String sourceType();
    /** Human description of coverage ("Annual state-level statistics…"). */
    String coverageDescription();
    /** What access this source needs ("API key from data.gov.in", "authorised police access"). */
    String authorizationRequirement();
    /** Fetch + validate + normalise. */
    FetchResult fetch() throws Exception;

    record FetchResult(List<SafetyRecord> records, String publishedAt, String detail) {}

    /** Credentials/config missing → status "not_configured". */
    class SourceNotConfiguredException extends Exception { public SourceNotConfiguredException(String m) { super(m); } }
    /** No permitted public access exists → status "requires_authorization". */
    class SourceNotAuthorizedException extends Exception { public SourceNotAuthorizedException(String m) { super(m); } }
    /** Response did not match the expected structure → status "error". */
    class SourceFormatException extends Exception { public SourceFormatException(String m) { super(m); } }
}
