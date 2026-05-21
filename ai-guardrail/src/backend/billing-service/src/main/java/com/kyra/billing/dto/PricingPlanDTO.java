package com.kyra.billing.dto;

import com.kyra.billing.model.PricingPlan;
import lombok.*;

import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PricingPlanDTO {

    private String id;
    private String name;
    private String description;
    private Integer amountCents;
    private String currency;
    private String interval;
    private Map<String, Object> features;
    private Map<String, Object> limits;
    private Integer displayOrder;

    public static PricingPlanDTO fromEntity(PricingPlan plan) {
        return PricingPlanDTO.builder()
                .id(plan.getId())
                .name(plan.getName())
                .description(plan.getDescription())
                .amountCents(plan.getAmountCents())
                .currency(plan.getCurrency())
                .interval(plan.getInterval())
                .features(plan.getFeatures())
                .limits(plan.getLimits())
                .displayOrder(plan.getDisplayOrder())
                .build();
    }
}
