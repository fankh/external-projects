package com.kyra.sharing.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShareAnalyticsDTO {

    private UUID shareId;
    private Integer viewCount;
    private List<AccessLogEntry> accessLog;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AccessLogEntry {
        private String accessedBy;
        private String accessedByEmail;
        private LocalDateTime accessedAt;
        private String ipAddress;
        private String userAgent;
    }
}
