package in.sheguard.security;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Authentication + authorization gate for /api/**.
 *  - Requires "Authorization: Bearer <Firebase ID token>" (verified with the Admin SDK).
 *  - /api/admin/** additionally requires the custom claim admin=true and re-checks token revocation.
 *  - /api/health and the provider webhook (which has its own signature check) are public.
 *  - Applies a per-user / per-IP rate limit.
 * Verified identity is exposed to controllers as request attributes "uid" and "admin".
 */
@Component
public class FirebaseAuthFilter extends OncePerRequestFilter {
    private final FirebaseAuth auth;
    private final RateLimiter limiter;
    public FirebaseAuthFilter(FirebaseAuth auth, RateLimiter limiter) { this.auth = auth; this.limiter = limiter; }

    @Override protected boolean shouldNotFilter(HttpServletRequest r) {
        String p = r.getRequestURI();
        return !p.startsWith("/api/") || p.equals("/api/health") || p.startsWith("/api/webhooks/") || "OPTIONS".equals(r.getMethod());
    }

    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) { deny(res, 401, "Missing bearer token."); return; }
        boolean adminPath = req.getRequestURI().startsWith("/api/admin/");
        try {
            FirebaseToken t = auth.verifyIdToken(header.substring(7), adminPath); // revocation check only for admin calls
            boolean admin = Boolean.TRUE.equals(t.getClaims().get("admin"));
            if (adminPath && !admin) { deny(res, 403, "Administrator role required."); return; }
            if (!limiter.allow("u:" + t.getUid(), 60, 60_000)) { deny(res, 429, "Too many requests. Try again in a minute."); return; }
            req.setAttribute("uid", t.getUid());
            req.setAttribute("admin", admin);
            chain.doFilter(req, res);
        } catch (FirebaseAuthException | IllegalArgumentException e) {
            deny(res, 401, "Invalid or expired token.");   // no internal detail leaked
        }
    }

    private void deny(HttpServletResponse res, int status, String msg) throws IOException {
        res.setStatus(status); res.setContentType("application/json");
        res.getWriter().write("{\"message\":\"" + msg + "\"}");
    }
}
