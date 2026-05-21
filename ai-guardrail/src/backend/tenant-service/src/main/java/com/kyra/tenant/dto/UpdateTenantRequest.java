package com.kyra.tenant.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UpdateTenantRequest {

    private String name;
    private String tier;
    private Map<String, Object> settings;
    private Map<String, Object> features;
    private Map<String, Object> limits;
    private Map<String, Object> branding;
    private String customDomain;
}
