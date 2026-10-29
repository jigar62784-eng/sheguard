package in.sheguard.notify;

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
import java.util.Base64;

/**
 * SMS through Twilio's documented REST API (POST /2010-04-01/Accounts/{sid}/Messages.json).
 * Credentials come from environment variables only. A 2xx response means Twilio ACCEPTED (queued) the
 * message — not that the phone received it. Delivery is confirmed later by /api/webhooks/twilio-status.
 * Note: sending to Indian numbers requires DLT registration of sender/template under TRAI rules.
 */
@Component
public class TwilioSmsProvider implements NotificationProvider {
    @Value("${sheguard.twilio.account-sid:}") private String sid;
    @Value("${sheguard.twilio.auth-token:}") private String token;
    @Value("${sheguard.twilio.from:}") private String from;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final ObjectMapper mapper = new ObjectMapper();

    @Override public String channel() { return "sms"; }
    @Override public boolean isConfigured() { return !sid.isBlank() && !token.isBlank() && !from.isBlank(); }

    @Override public SendResult send(String to, String body, String callback) {
        if (!isConfigured()) return new SendResult("not_configured", null, "Twilio credentials are not set.");
        String form = "To=" + enc(to) + "&From=" + enc(from) + "&Body=" + enc(body)
                + (callback == null || callback.isBlank() ? "" : "&StatusCallback=" + enc(callback));
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json"))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Basic " + Base64.getEncoder().encodeToString((sid + ":" + token).getBytes(StandardCharsets.UTF_8)))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form)).build();
        try {
            HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode j = mapper.readTree(r.body());
            if (r.statusCode() / 100 == 2) return new SendResult("accepted_by_provider", j.path("sid").asText(null), null);
            return new SendResult("failed", null, "Provider error " + r.statusCode() + ": " + j.path("message").asText("unknown"));
        } catch (Exception e) {
            return new SendResult("failed", null, "Could not reach provider: " + e.getClass().getSimpleName());
        }
    }
    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }
}
