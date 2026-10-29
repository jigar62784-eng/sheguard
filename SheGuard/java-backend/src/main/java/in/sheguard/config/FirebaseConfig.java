package in.sheguard.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.cloud.FirestoreClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.FileInputStream;
import java.io.IOException;

/** Initialises the Firebase Admin SDK (server credentials never reach the browser) and CORS. */
@Configuration
public class FirebaseConfig implements WebMvcConfigurer {
    @Value("${sheguard.firebase.credentials-path:}") private String credentialsPath;
    @Value("${sheguard.firebase.project-id:}") private String projectId;
    @Value("${sheguard.allowed-origins}") private String[] allowedOrigins;

    @Bean
    public FirebaseApp firebaseApp() throws IOException {
        if (!FirebaseApp.getApps().isEmpty()) return FirebaseApp.getInstance();
        GoogleCredentials creds = credentialsPath.isBlank()
                ? GoogleCredentials.getApplicationDefault()
                : GoogleCredentials.fromStream(new FileInputStream(credentialsPath));
        FirebaseOptions.Builder b = FirebaseOptions.builder().setCredentials(creds);
        if (!projectId.isBlank()) b.setProjectId(projectId);
        return FirebaseApp.initializeApp(b.build());
    }
    @Bean public FirebaseAuth firebaseAuth(FirebaseApp app) { return FirebaseAuth.getInstance(app); }
    @Bean public Firestore firestore(FirebaseApp app) { return FirestoreClient.getFirestore(app); }

    @Override public void addCorsMappings(CorsRegistry r) {
        r.addMapping("/api/**").allowedOrigins(allowedOrigins).allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type").maxAge(3600);
    }
}
