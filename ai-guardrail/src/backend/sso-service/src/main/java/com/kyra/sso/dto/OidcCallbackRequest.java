package com.kyra.sso.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OidcCallbackRequest {

    private String code;
    private String state;
    private String error;
    private String errorDescription;
}
