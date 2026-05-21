package com.kyra.auth.dto;

import jakarta.validation.constraints.Email;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class InviteTeamRequest {

    private List<@Email(message = "Each email must be valid") String> emails;

    private String role = "user";

    private String personalMessage;
}
