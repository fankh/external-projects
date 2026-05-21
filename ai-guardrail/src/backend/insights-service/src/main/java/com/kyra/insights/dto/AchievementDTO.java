package com.kyra.insights.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AchievementDTO {

    private String id;
    private String title;
    private String description;
    private String icon;
    private Integer progress;
    private Integer target;
    private Boolean unlocked;
    private LocalDateTime unlockedAt;
}
