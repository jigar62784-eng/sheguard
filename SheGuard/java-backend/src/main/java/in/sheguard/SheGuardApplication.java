package in.sheguard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Entry point. Only operations that need secrets or admin rights live here; everything else stays in the browser. */
@SpringBootApplication
@EnableScheduling
public class SheGuardApplication {
    public static void main(String[] args) { SpringApplication.run(SheGuardApplication.class, args); }
}
