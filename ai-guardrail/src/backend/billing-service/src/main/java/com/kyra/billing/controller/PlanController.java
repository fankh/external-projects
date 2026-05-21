package com.kyra.billing.controller;

import com.kyra.billing.dto.PricingPlanDTO;
import com.kyra.billing.repository.PricingPlanRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/v1/billing/plans")
@RequiredArgsConstructor
@Slf4j
public class PlanController {

    private final PricingPlanRepository pricingPlanRepository;

    @GetMapping
    public ResponseEntity<List<PricingPlanDTO>> listPlans() {
        log.info("Listing active pricing plans");
        List<PricingPlanDTO> plans = pricingPlanRepository.findByIsActiveTrueOrderByDisplayOrderAsc()
                .stream()
                .map(PricingPlanDTO::fromEntity)
                .toList();
        return ResponseEntity.ok(plans);
    }
}
