package com.kyra.billing.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateSubscriptionRequest {

    @NotNull(message = "Tenant ID must not be null")
    private UUID tenantId;

    @NotBlank(message = "Plan ID must not be blank")
    private String planId;

    @NotBlank(message = "Payment method ID must not be blank")
    private String paymentMethodId;

    private String email;
    private String name;
}
