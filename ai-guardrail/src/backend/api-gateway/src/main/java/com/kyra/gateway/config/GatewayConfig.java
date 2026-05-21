package com.kyra.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GatewayConfig {

    @Value("${services.auth-service.url:lb://auth-service}")
    private String authServiceUrl;

    @Value("${services.chat-service.url:lb://chat-service}")
    private String chatServiceUrl;

    @Value("${services.rag-service.url:lb://rag-service}")
    private String ragServiceUrl;

    @Value("${services.security-service.url:lb://security-service}")
    private String securityServiceUrl;

    @Value("${services.sso-service.url:http://sso-service:8030}")
    private String ssoServiceUrl;

    @Value("${services.billing-service.url:http://billing-service:8027}")
    private String billingServiceUrl;

    @Value("${services.bookmark-service.url:lb://bookmark-service}")
    private String bookmarkServiceUrl;

    @Value("${services.feedback-service.url:lb://feedback-service}")
    private String feedbackServiceUrl;

    @Value("${services.branching-service.url:lb://branching-service}")
    private String branchingServiceUrl;

    @Value("${services.sharing-service.url:lb://sharing-service}")
    private String sharingServiceUrl;

    @Value("${services.insights-service.url:lb://insights-service}")
    private String insightsServiceUrl;

    @Value("${services.analytics-service.url:lb://analytics-service}")
    private String analyticsServiceUrl;

    @Value("${services.notification-service.url:lb://notification-service}")
    private String notificationServiceUrl;

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                // Admin Users (auth-service)
                .route("admin-users-route", r -> r
                        .path("/api/v1/admin/users/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(authServiceUrl))

                                // Auth Service
                .route("auth-service", r -> r
                        .path("/api/v1/auth/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("authServiceCB")
                                        .setFallbackUri("forward:/fallback/auth"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(authServiceUrl))

                // Chat Service - chat endpoints
                .route("chat-service-chat", r -> r
                        .path("/api/v1/chat/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("chatServiceCB")
                                        .setFallbackUri("forward:/fallback/chat"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(chatServiceUrl))

                // Chat Service - conversations endpoints
                .route("chat-service-conversations", r -> r
                        .path("/api/v1/conversations/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("chatServiceCB")
                                        .setFallbackUri("forward:/fallback/chat"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(chatServiceUrl))

                // RAG Service - rag endpoints
                .route("rag-service-rag", r -> r
                        .path("/api/v1/rag/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("ragServiceCB")
                                        .setFallbackUri("forward:/fallback/rag"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(ragServiceUrl))

                // RAG Service - collections endpoints
                .route("rag-service-collections", r -> r
                        .path("/api/v1/collections/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("ragServiceCB")
                                        .setFallbackUri("forward:/fallback/rag"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(ragServiceUrl))

                // RAG Service - documents endpoints
                .route("rag-service-documents", r -> r
                        .path("/api/v1/documents/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("ragServiceCB")
                                        .setFallbackUri("forward:/fallback/rag"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(ragServiceUrl))

                // Security Service - security endpoints
                .route("security-service-security", r -> r
                        .path("/api/v1/security/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("securityServiceCB")
                                        .setFallbackUri("forward:/fallback/security"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(securityServiceUrl))

                // Security Service - audit endpoints
                .route("security-service-audit", r -> r
                        .path("/api/v1/audit/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("securityServiceCB")
                                        .setFallbackUri("forward:/fallback/security"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(securityServiceUrl))

                // Security Service - privacy (GDPR DSR) endpoints
                .route("security-service-privacy", r -> r
                        .path("/api/v1/privacy/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("securityServiceCB")
                                        .setFallbackUri("forward:/fallback/security"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(securityServiceUrl))

                // Security Service - breach register endpoints
                .route("security-service-breach", r -> r
                        .path("/api/v1/breach/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("securityServiceCB")
                                        .setFallbackUri("forward:/fallback/security"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(securityServiceUrl))

                // Security Service - PHI (HIPAA) endpoints
                .route("security-service-phi", r -> r
                        .path("/api/v1/phi/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("securityServiceCB")
                                        .setFallbackUri("forward:/fallback/security"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(securityServiceUrl))

                // Integration Service - collaboration (Teams/Slack)
                .route("integration-collab", r -> r
                        .path("/api/v1/integrations/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri("http://integration-service:8031"))

                                // Security Service - DLP whitelist
                .route("dlp-whitelist", r -> r
                        .path("/api/v1/dlp/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - feature flags
                .route("security-service-flags", r -> r
                        .path("/api/v1/flags/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - report schedules
                .route("security-service-reports", r -> r
                        .path("/api/v1/reports/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - tenant encryption keys
                .route("security-service-keys", r -> r
                        .path("/api/v1/keys/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - audit search (OpenSearch)
                .route("audit-search", r -> r
                        .path("/api/v1/audit-search/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - compliance status
                .route("compliance-status", r -> r
                        .path("/api/v1/compliance/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - GDPR Art.30 processing register
                .route("security-service-register", r -> r
                        .path("/api/v1/processing-register/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - monitoring (prometheus proxy)
                .route("security-service-monitoring", r -> r
                        .path("/api/v1/monitoring/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Security Service - UBA endpoints
                .route("security-service-uba", r -> r
                        .path("/api/v1/uba/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("securityServiceCB")
                                        .setFallbackUri("forward:/fallback/security"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(securityServiceUrl))

                // Security Service - permission grants / evaluator
                .route("security-service-permissions", r -> r
                        .path("/api/v1/permissions/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("securityServiceCB")
                                        .setFallbackUri("forward:/fallback/security"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(securityServiceUrl))

                // SSO Service
                .route("sso-service-route", r -> r
                        .path("/api/v1/sso/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .retry(retryConfig -> retryConfig
                                        .setRetries(2)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(ssoServiceUrl))

                // Workflow Service - engine
                .route("workflow-engine", r -> r
                        .path("/api/v1/workflows/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri("http://workflow-service:8029"))

                // Security Service - event store
                .route("event-store", r -> r
                        .path("/api/v1/events/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri(securityServiceUrl))

                                // Tenant Service - workspaces/teams
                .route("workspace-route", r -> r
                        .path("/api/v1/workspaces/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri("http://tenant-service:8026"))

                                // Billing Service
                .route("billing-service-route", r -> r
                        .path("/api/v1/billing/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .retry(retryConfig -> retryConfig
                                        .setRetries(2)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(billingServiceUrl))

                // Bookmark Service
                .route("bookmark-service", r -> r
                        .path("/api/v1/bookmarks/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("bookmarkServiceCB")
                                        .setFallbackUri("forward:/fallback/bookmark"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(bookmarkServiceUrl))

                // Feedback Service
                .route("feedback-service", r -> r
                        .path("/api/v1/feedback/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("feedbackServiceCB")
                                        .setFallbackUri("forward:/fallback/feedback"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(feedbackServiceUrl))

                // Branching Service
                .route("branching-service", r -> r
                        .path("/api/v1/conversations/*/branches/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("branchingServiceCB")
                                        .setFallbackUri("forward:/fallback/branching"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(branchingServiceUrl))

                // Sharing Service
                .route("sharing-service", r -> r
                        .path("/api/v1/share/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("sharingServiceCB")
                                        .setFallbackUri("forward:/fallback/sharing"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(sharingServiceUrl))

                // Insights Service
                .route("insights-service", r -> r
                        .path("/api/v1/insights/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("insightsServiceCB")
                                        .setFallbackUri("forward:/fallback/insights"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(insightsServiceUrl))

                // Analytics Service
                .route("analytics-service", r -> r
                        .path("/api/v1/analytics/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("analyticsServiceCB")
                                        .setFallbackUri("forward:/fallback/analytics"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(analyticsServiceUrl))

                // Notification Service
                .route("notification-service", r -> r
                        .path("/api/v1/notifications/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("notificationServiceCB")
                                        .setFallbackUri("forward:/fallback/notification"))
                                .retry(retryConfig -> retryConfig
                                        .setRetries(3)
                                        .setStatuses(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                        .uri(notificationServiceUrl))

                .build();
    }
}
