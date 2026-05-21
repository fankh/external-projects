package com.kyra.auth.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PersonaSelectionRequest {

    @NotEmpty(message = "At least one persona must be selected")
    private List<String> selectedPersonas;
}
