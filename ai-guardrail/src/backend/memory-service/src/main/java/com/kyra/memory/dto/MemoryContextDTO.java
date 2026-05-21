package com.kyra.memory.dto;

import lombok.*;

import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemoryContextDTO {

    private List<MemoryDTO> memories;
    private String summary;
    private Map<String, Object> userPreferences;
}
