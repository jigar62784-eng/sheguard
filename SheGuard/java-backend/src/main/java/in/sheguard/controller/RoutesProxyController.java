package in.sheguard.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.sheguard.service.RoutesProxyService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** POST /api/routes/compute  body: {"fieldMask": "...", "request": {computeRoutes body}} — authenticated users only. */
@RestController
public class RoutesProxyController {
    private final RoutesProxyService svc; private final ObjectMapper mapper = new ObjectMapper();
    public RoutesProxyController(RoutesProxyService svc) { this.svc = svc; }

    @PostMapping("/api/routes/compute")
    public ResponseEntity<String> compute(@RequestBody JsonNode body) {
        if (!svc.isConfigured()) return ResponseEntity.status(503).contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"message\":\"Routes proxy key (GOOGLE_ROUTES_API_KEY) is not configured.\"}}");
        String mask = body.path("fieldMask").asText("");
        if (!RoutesProxyService.fieldMaskAllowed(mask) || !body.path("request").isObject())
            return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"message\":\"Invalid request.\"}}");
        try {
            var r = svc.compute(mask, mapper.writeValueAsString(body.get("request")));
            return ResponseEntity.status(r.statusCode()).contentType(MediaType.APPLICATION_JSON).body(r.body());
        } catch (Exception e) { return ResponseEntity.status(502).contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"message\":\"Routing service unreachable.\"}}"); }
    }
}
