package com.kyra.common.exception;

import org.springframework.http.HttpStatus;

public class NotFoundException extends AppException {

    public NotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }

    public NotFoundException(String resourceType, String resourceId) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND",
                "%s not found with id: %s".formatted(resourceType, resourceId));
    }
}
