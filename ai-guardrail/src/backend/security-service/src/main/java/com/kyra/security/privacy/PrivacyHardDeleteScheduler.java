package com.kyra.security.privacy;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class PrivacyHardDeleteScheduler {

    private final PrivacyService service;

    // Daily at 03:00 UTC — runs an hour after audit retention to avoid conflicts
    @Scheduled(cron = "${privacy.hard-delete.cron:0 0 3 * * *}", zone = "UTC")
    public void runHardDeletes() {
        log.info("privacy hard-delete sweep starting");
        int processed = service.processOverdueHardDeletes();
        log.info("privacy hard-delete sweep done: processed={}", processed);
    }
}
