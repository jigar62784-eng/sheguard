package in.sheguard.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

/** Forwards a computeRoutes request to Google Routes API using the SERVER-side key. */
@Service
public class RoutesProxyService {
    /** Only these response fields may be requested through the proxy (controls cost and data exposure). */
    static final Set<String> ALLOWED_FIELDS = Set.of(
            "routes.duration", "routes.staticDuration", "routes.distanceMeters", "routes.description", "routes.routeLabels",
            "routes.polyline.encodedPolyline", "routes.legs.steps.distanceMeters", "routes.legs.steps.navigationInstruction");
    @Value("${sheguard.routes.api-key:}") private String apiKey;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public boolean isConfigured() { return !apiKey.isBlank(); }

    /** True only if every comma-separated field is on the allow-list. */
    public static boolean fieldMaskAllowed(String mask) {
        if (mask == null || mask.isBlank()) return false;
        for (String f : mask.split(",")) if (!ALLOWED_FIELDS.contains(f.trim())) return false;
        return true;
    }

    public HttpResponse<String> compute(String fieldMask, String jsonBody) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
                .header("X-Goog-Api-Key", apiKey).header("X-Goog-FieldMask", fieldMask)
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody)).build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }
}
