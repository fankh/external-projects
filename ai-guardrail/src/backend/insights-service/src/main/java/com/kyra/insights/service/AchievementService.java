package com.kyra.insights.service;

import com.kyra.insights.dto.AchievementDTO;
import com.kyra.insights.model.AchievementType;
import com.kyra.insights.model.UserAchievement;
import com.kyra.insights.repository.UserAchievementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AchievementService {

    private final UserAchievementRepository achievementRepository;

    public List<AchievementDTO> getAllAchievements(UUID userId) {
        List<UserAchievement> userAchievements = achievementRepository.findByUserId(userId);
        Map<String, UserAchievement> achievementMap = userAchievements.stream()
                .collect(Collectors.toMap(UserAchievement::getAchievementId, a -> a));

        List<AchievementDTO> result = new ArrayList<>();
        for (AchievementType type : AchievementType.values()) {
            UserAchievement ua = achievementMap.get(type.getId());
            AchievementDTO dto = AchievementDTO.builder()
                    .id(type.getId())
                    .title(type.getTitle())
                    .description(type.getDescription())
                    .icon(type.getIcon())
                    .progress(ua != null ? ua.getProgress() : 0)
                    .target(type.getTarget())
                    .unlocked(ua != null && ua.getUnlockedAt() != null)
                    .unlockedAt(ua != null ? ua.getUnlockedAt() : null)
                    .build();
            result.add(dto);
        }
        return result;
    }

    @Transactional
    public void updateProgress(UUID userId, String achievementId, int progress) {
        AchievementType type = Arrays.stream(AchievementType.values())
                .filter(t -> t.getId().equals(achievementId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Unknown achievement: " + achievementId));

        UserAchievement achievement = achievementRepository
                .findByUserIdAndAchievementId(userId, achievementId)
                .orElse(UserAchievement.builder()
                        .userId(userId)
                        .achievementId(achievementId)
                        .progress(0)
                        .target(type.getTarget())
                        .build());

        achievement.setProgress(progress);

        // Check if newly unlocked
        if (achievement.getUnlockedAt() == null && progress >= type.getTarget()) {
            achievement.setUnlockedAt(LocalDateTime.now());
            log.info("Achievement {} unlocked for user {}", achievementId, userId);
        }

        achievementRepository.save(achievement);
    }

    @Transactional
    public void incrementProgress(UUID userId, String achievementId, int increment) {
        AchievementType type = Arrays.stream(AchievementType.values())
                .filter(t -> t.getId().equals(achievementId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Unknown achievement: " + achievementId));

        UserAchievement achievement = achievementRepository
                .findByUserIdAndAchievementId(userId, achievementId)
                .orElse(UserAchievement.builder()
                        .userId(userId)
                        .achievementId(achievementId)
                        .progress(0)
                        .target(type.getTarget())
                        .build());

        int newProgress = achievement.getProgress() + increment;
        achievement.setProgress(newProgress);

        // Check if newly unlocked
        if (achievement.getUnlockedAt() == null && newProgress >= type.getTarget()) {
            achievement.setUnlockedAt(LocalDateTime.now());
            log.info("Achievement {} unlocked for user {}", achievementId, userId);
        }

        achievementRepository.save(achievement);
    }
}
