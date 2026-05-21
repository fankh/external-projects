package com.kyra.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CompanyProfileRequest {

    private String companyName;
    private String industry;
    private String companySize;
    private String primaryUseCase;
}
