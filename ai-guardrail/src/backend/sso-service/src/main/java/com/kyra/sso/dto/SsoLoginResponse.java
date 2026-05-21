package com.kyra.sso.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SsoLoginResponse {

    private String redirectUrl;
    private String email;
    private String name;
    private String subjectId;
    private String provider;
    private List<String> groups;
    private Map<String, Object> attributes;
    private boolean userCreated;
    private boolean authenticated;
    private String error;
}
