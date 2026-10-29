package in.sheguard;

import in.sheguard.safety.DataGovInAdapter;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

/** Parsing tests use a SMALL SYNTHETIC FIXTURE that mimics the OGD response shape. It is test data only — never imported into the app. */
class DataGovInAdapterTest {
    private DataGovInAdapter adapter() {
        DataGovInAdapter a = new DataGovInAdapter();
        ReflectionTestUtils.setField(a, "resourceId", "test-resource");
        ReflectionTestUtils.setField(a, "datasetName", "Test dataset");
        ReflectionTestUtils.setField(a, "catalogUrl", "");
        ReflectionTestUtils.setField(a, "coverage", "test");
        ReflectionTestUtils.setField(a, "precision", "state");
        ReflectionTestUtils.setField(a, "fArea", "state_ut"); ReflectionTestUtils.setField(a, "fCategory", "crime_head");
        ReflectionTestUtils.setField(a, "fPeriod", "year"); ReflectionTestUtils.setField(a, "fCount", "cases");
        return a;
    }
    private static final String FIXTURE = "{\"updated_date\":\"2024-01-01\",\"records\":[" +
            "{\"state_ut\":\"State A\",\"crime_head\":\"Head X\",\"year\":\"2022\",\"cases\":\"1,234\"}," +
            "{\"state_ut\":\"State A\",\"crime_head\":\"Head X\",\"year\":\"2022\",\"cases\":\"1,234\"}," +
            "{\"state_ut\":\"\",\"crime_head\":\"\",\"year\":\"2022\",\"cases\":\"NA\"}]}";

    @Test void normalisesRowsWithoutInventingCoordinates() throws Exception {
        var parsed = ReflectionTestUtils.invokeMethod(adapter(), "parse", FIXTURE, "2026-01-01T00:00:00Z");
        @SuppressWarnings("unchecked") var records = (java.util.List<in.sheguard.safety.SafetyRecord>) ReflectionTestUtils.invokeMethod(parsed, "records");
        assertEquals(2, records.size(), "the empty row must be skipped");
        var r = records.get(0);
        assertNull(r.latitude()); assertNull(r.longitude()); assertNull(r.occurredAt());
        assertEquals(1234L, r.count()); assertEquals("state", r.geographicPrecision());
        assertEquals(records.get(0).dedupeId(), records.get(1).dedupeId(), "identical rows share an id so they are not duplicated");
    }

    @Test void rejectsUnexpectedFormat() {
        assertThrows(DataGovInAdapter.SourceFormatException.class, () -> {
            try { ReflectionTestUtils.invokeMethod(adapter(), "parse", "{\"nope\":1}", "now"); }
            catch (Exception e) { throw e.getCause() instanceof Exception c ? c : e; }
        });
    }
}
