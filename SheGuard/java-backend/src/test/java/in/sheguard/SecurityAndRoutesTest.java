package in.sheguard;

import in.sheguard.security.RateLimiter;
import in.sheguard.service.RoutesProxyService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SecurityAndRoutesTest {
    @Test void rateLimiterBlocksAfterMax() {
        RateLimiter l = new RateLimiter();
        assertTrue(l.allow("k", 2, 60_000)); assertTrue(l.allow("k", 2, 60_000)); assertFalse(l.allow("k", 2, 60_000));
        assertTrue(l.allow("other", 2, 60_000));
    }
    @Test void fieldMaskAllowListRejectsUnknownFields() {
        assertTrue(RoutesProxyService.fieldMaskAllowed("routes.duration,routes.distanceMeters"));
        assertFalse(RoutesProxyService.fieldMaskAllowed("routes.duration,routes.travelAdvisory"));
        assertFalse(RoutesProxyService.fieldMaskAllowed(""));
    }
}
