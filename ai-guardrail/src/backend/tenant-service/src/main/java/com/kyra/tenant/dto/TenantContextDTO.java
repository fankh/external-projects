package com.kyra.tenant.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TenantContextDTO {

    private UUID tenantId;
    private String slug;
    private String tier;
    private String status;
    private Map<String, Object> features;
    private Map<String, Object> limits;
}
