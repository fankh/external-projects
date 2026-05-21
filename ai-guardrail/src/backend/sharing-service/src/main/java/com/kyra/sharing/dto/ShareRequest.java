package com.kyra.sharing.dto;

import com.kyra.sharing.model.SharedContent.ShareType;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShareRequest {

    @NotNull
    private UUID messageId;

    @NotNull
    private ShareType shareType;

    private List<String> recipientEmails;
    private String note;
    private Boolean includeOriginalQuestion;
    private Boolean includeFullThread;
    private Boolean includeCitations;
    private Integer expirationDays;
}
