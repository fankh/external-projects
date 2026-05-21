package com.kyra.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.util.Map;

@Getter
public class ValidationException extends AppException {

    private final Map<String, Object> validationErrors;

    public ValidationException(String message) {
        super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
        this.validationErrors = Map.of();
    }

    public ValidationException(String message, Map<String, Object> validationErrors) {
        super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
        this.validationErrors = validationErrors;
    }
}
