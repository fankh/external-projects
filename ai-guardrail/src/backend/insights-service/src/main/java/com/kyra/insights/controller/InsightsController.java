package com.kyra.insights.controller;

import com.kyra.insights.config.SecurityConfig;
import com.kyra.insights.config.SecurityConfig.UserContext;
import com.kyra.insights.dto.AchievementDTO;
import com.kyra.insights.dto.TrendsDTO;
import com.kyra.insights.dto.UsageStatsDTO;
import com.kyra.insights.service.AchievementService;
import com.kyra.insights.service.InsightsService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/insights")
@RequiredArgsConstructor
public class InsightsController {

    private final InsightsService insightsService;
    private final AchievementService achievementService;

    @GetMapping("/usage")
    public UsageStatsDTO getUsageStats(
            @RequestParam(defaultValue = "week") String period,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return insightsService.getUsageStats(UUID.fromString(user.getUserId()), period);
    }

    @GetMapping("/trends")
    public TrendsDTO getTrends(
            @RequestParam(defaultValue = "30") int days,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return insightsService.getTrends(UUID.fromString(user.getUserId()), days);
    }

    @GetMapping("/achievements")
    public List<AchievementDTO> getAchievements(HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return achievementService.getAllAchievements(UUID.fromString(user.getUserId()));
    }

    @GetMapping("/summary")
    public Map<String, Object> getDashboardSummary(HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return insightsService.getDashboardSummary(UUID.fromString(user.getUserId()));
    }

    private UserContext getUserContext(HttpServletRequest request) {
        return (UserContext) request.getAttribute(SecurityConfig.USER_CONTEXT_ATTR);
    }
}
