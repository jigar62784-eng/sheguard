package in.sheguard.controller;

import in.sheguard.service.SafetyIngestionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/** Admin-only (enforced by FirebaseAuthFilter for /api/admin/**). */
@RestController
public class AdminSafetyController {
    private final SafetyIngestionService svc;
    public AdminSafetyController(SafetyIngestionService svc) { this.svc = svc; }

    @PostMapping("/api/admin/safety/register")
    public ResponseEntity<Map<String, Object>> register() throws Exception {
        return ResponseEntity.ok(Map.of("message", svc.registerAll() + " source adapter(s) registered."));
    }

    @PostMapping("/api/admin/safety/refresh/{sourceId}")
    public ResponseEntity<Map<String, Object>> refresh(@PathVariable String sourceId, HttpServletRequest req) throws Exception {
        if (!sourceId.matches("^[A-Za-z0-9_.-]{1,80}$")) return ResponseEntity.badRequest().body(Map.of("message", "Invalid source id."));
        return ResponseEntity.ok(svc.refresh(sourceId, (String) req.getAttribute("uid")));
    }
}
