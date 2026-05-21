package com.kyra.security.keys;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class KeyRotationScheduler {

    private final TenantKeyService keyService;

    @Scheduled(cron = "${security.key.reap.cron:0 45 4 * * *}", zone = "UTC")
    public void runReap() {
        int n = keyService.reapExpiredPendingKeys();
        if (n > 0) log.info("key reaper: deactivated {} pending keys", n);
    }
}
