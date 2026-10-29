package in.sheguard.controller;

import in.sheguard.security.RateLimiter;
import in.sheguard.service.AlertService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.regex.Pattern;

/** POST /api/alerts/{alertId}/dispatch — owner-only (uid from the verified token). */
@RestController
public class AlertController {
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9]{10,40}$");
    private final AlertService alerts; private final RateLimiter limiter;
    public AlertController(AlertService alerts, RateLimiter limiter) { this.alerts = alerts; this.limiter = limiter; }

    @PostMapping("/api/alerts/{alertId}/dispatch")
    public ResponseEntity<Map<String, Object>> dispatch(@PathVariable String alertId, HttpServletRequest req) {
        String uid = (String) req.getAttribute("uid");
        if (!ID.matcher(alertId).matches()) return ResponseEntity.badRequest().body(Map.of("message", "Invalid alert id."));
        if (!limiter.allow("sos:" + uid, 5, 3_600_000)) return ResponseEntity.status(429).body(Map.of("message", "SOS limit reached (5 per hour)."));
        try { return ResponseEntity.ok(alerts.dispatch(uid, alertId)); }
        catch (Exception e) { return ResponseEntity.status(500).body(Map.of("message", "Could not dispatch the alert.")); } // details stay in server logs
    }
}
