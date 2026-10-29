package in.sheguard.config;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.Map;

/**
 * One-off helper to grant the `admin` custom claim (the ONLY way to become a reviewer).
 *   GRANT_ADMIN_EMAIL=person@example.com mvn spring-boot:run     → then stop the server and unset the variable.
 * The person must sign out and in again (or refresh their token) for the claim to appear.
 */
@Component
public class AdminClaimRunner implements ApplicationRunner {
    @Value("${sheguard.grant-admin-email:}") private String email;
    private final FirebaseAuth auth;
    public AdminClaimRunner(FirebaseAuth auth) { this.auth = auth; }

    @Override public void run(ApplicationArguments args) throws Exception {
        if (email.isBlank()) return;
        UserRecord u = auth.getUserByEmail(email);
        Map<String, Object> claims = new HashMap<>(u.getCustomClaims());
        claims.put("admin", true);
        auth.setCustomUserClaims(u.getUid(), claims);
        System.out.println("Granted admin claim to " + email + " (uid " + u.getUid() + "). Unset GRANT_ADMIN_EMAIL now.");
    }
}
