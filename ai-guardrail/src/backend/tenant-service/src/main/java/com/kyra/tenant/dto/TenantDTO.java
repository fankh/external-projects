package com.kyra.tenant.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TenantDTO {

    private UUID id;
    private String slug;
    private String name;
    private String tier;
    private String status;
    private String isolationLevel;
    private UUID ownerId;
    private Map<String, Object> settings;
    private Map<String, Object> features;
    private Map<String, Object> limits;
    private Map<String, Object> branding;
    private String customDomain;
    private Instant trialEndsAt;
    private Instant createdAt;
    private Instant updatedAt;
}
