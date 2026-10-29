package in.sheguard.controller;

import in.sheguard.notify.NotificationProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;

/** Public status endpoint: tells operators which optional integrations are actually configured. */
@RestController
public class HealthController {
    private final List<NotificationProvider> providers;
    public HealthController(List<NotificationProvider> providers) { this.providers = providers; }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("status", "up", "notificationProviders",
                providers.stream().collect(java.util.stream.Collectors.toMap(NotificationProvider::channel, NotificationProvider::isConfigured)));
    }
}
