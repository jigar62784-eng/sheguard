package in.sheguard.controller;

import in.sheguard.service.AlertService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import java.util.TreeMap;

/**
 * POST /api/webhooks/twilio-status — delivery receipts from Twilio.
 * Authenticity: Twilio signs "full URL + sorted POST params" with HMAC-SHA1(auth token) in X-Twilio-Signature.
 * Requests with a bad signature are rejected, so nobody can fake a "delivered" status.
 */
@RestController
public class WebhookController {
    @Value("${sheguard.twilio.auth-token:}") private String authToken;
    @Value("${sheguard.public-base-url:}") private String baseUrl;
    private final AlertService alerts;
    public WebhookController(AlertService alerts) { this.alerts = alerts; }

    @PostMapping("/api/webhooks/twilio-status")
    public ResponseEntity<Void> twilio(HttpServletRequest req, @RequestParam String uid, @RequestParam String alertId, @RequestParam String contactId) {
        if (authToken.isBlank() || baseUrl.isBlank()) return ResponseEntity.status(503).build();
        Map<String, String> params = new TreeMap<>();
        req.getParameterMap().forEach((k, v) -> { if (!k.equals("uid") && !k.equals("alertId") && !k.equals("contactId")) params.put(k, v[0]); });
        // Twilio signs the exact URL it called, including our own query string.
        String url = baseUrl + "/api/webhooks/twilio-status?uid=" + uid + "&alertId=" + alertId + "&contactId=" + contactId;
        if (!validSignature(url, params, req.getHeader("X-Twilio-Signature"), authToken)) return ResponseEntity.status(403).build();
        try { alerts.applyProviderStatus(uid, alertId, contactId, params.getOrDefault("MessageStatus", "")); return ResponseEntity.noContent().build(); }
        catch (Exception e) { return ResponseEntity.status(500).build(); }
    }

    static boolean validSignature(String url, Map<String, String> sortedParams, String header, String token) {
        if (header == null) return false;
        try {
            StringBuilder sb = new StringBuilder(url);
            sortedParams.forEach((k, v) -> sb.append(k).append(v));
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(token.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            String expected = Base64.getEncoder().encodeToString(mac.doFinal(sb.toString().getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), header.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { return false; }
    }
}
