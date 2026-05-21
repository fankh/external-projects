package com.kyra.billing.repository;

import com.kyra.billing.model.PricingPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PricingPlanRepository extends JpaRepository<PricingPlan, String> {

    List<PricingPlan> findByIsActiveTrueOrderByDisplayOrderAsc();
}
