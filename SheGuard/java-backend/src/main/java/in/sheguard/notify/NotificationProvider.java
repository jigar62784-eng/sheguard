package in.sheguard.notify;

/** A channel (SMS, e-mail…) that can send an alert. Implementations must NEVER report success unless the provider accepted the message. */
public interface NotificationProvider {
    String channel();                 // "sms"
    boolean isConfigured();           // credentials present?
    SendResult send(String to, String body, String statusCallbackUrl);

    /** status: accepted_by_provider | failed | not_configured. Delivery ("delivered") only arrives later via webhook. */
    record SendResult(String status, String providerMessageId, String error) {}
}
