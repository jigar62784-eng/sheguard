package in.sheguard.security;

import org.springframework.stereotype.Component;
import java.util.concurrent.ConcurrentHashMap;

/** Fixed-window in-memory rate limiter (per key). Enough for one instance; use a shared store if you scale out. */
@Component
public class RateLimiter {
    private record Window(long start, int count) {}
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    /** @return true if the call is allowed. */
    public boolean allow(String key, int maxPerWindow, long windowMillis) { return allow(key, maxPerWindow, windowMillis, System.currentTimeMillis()); }

    boolean allow(String key, int max, long windowMillis, long now) {
        boolean[] ok = {false};
        windows.compute(key, (k, w) -> {
            if (w == null || now - w.start >= windowMillis) { ok[0] = true; return new Window(now, 1); }
            if (w.count < max) { ok[0] = true; return new Window(w.start, w.count + 1); }
            return w;
        });
        return ok[0];
    }
}
