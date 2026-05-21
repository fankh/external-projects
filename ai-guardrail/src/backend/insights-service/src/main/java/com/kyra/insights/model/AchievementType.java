package com.kyra.insights.model;

import lombok.Getter;

@Getter
public enum AchievementType {

    POWER_USER("power_user", "Power User", "Submit 100 queries in a month", "zap", 100),
    DOCUMENT_MASTER("document_master", "Document Master", "Upload 50 documents", "file-text", 50),
    EXPLORER("explorer", "Explorer", "Use all available personas", "compass", 0),
    STREAK_MASTER("streak_master", "Streak Master", "Use KYRA for 30 consecutive days", "flame", 30),
    FEEDBACK_CHAMPION("feedback_champion", "Feedback Champion", "Provide 20 feedbacks", "message-circle", 20),
    BOOKMARK_COLLECTOR("bookmark_collector", "Bookmark Collector", "Save 25 bookmarks", "bookmark", 25);

    private final String id;
    private final String title;
    private final String description;
    private final String icon;
    private final int target;

    AchievementType(String id, String title, String description, String icon, int target) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.icon = icon;
        this.target = target;
    }
}
