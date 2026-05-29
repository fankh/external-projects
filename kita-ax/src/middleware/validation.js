const Joi = require('joi');
const LoggingService = require('../services/loggingService');
const ErrorTrackingService = require('../services/errorTrackingService');

// Format validation errors for response
function formatValidationErrors(details) {
  const errors = {};
  const messages = [];

  details.forEach((detail) => {
    const field = detail.path.join('.');
    const message = detail.message;

    errors[field] = message;
    messages.push(`${field}: ${message}`);
  });

  return { errors, messages };
}

// Validation middleware factory
function validateRequest(schema, options = {}) {
  return (req, res, next) => {
    const { abortEarly = false, stripUnknown = true } = options;

    // Determine what to validate
    let dataToValidate = {};
    if (options.body !== false) {
      dataToValidate = { ...dataToValidate, ...req.body };
    }
    if (options.query !== false) {
      dataToValidate = { ...dataToValidate, ...req.query };
    }
    if (options.params !== false) {
      dataToValidate = { ...dataToValidate, ...req.params };
    }

    // Validate data against schema
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly,
      stripUnknown,
    });

    if (error) {
      const { errors, messages } = formatValidationErrors(error.details);

      LoggingService.warn('Validation error', {
        correlationId: req.correlationId,
        path: req.path,
        method: req.method,
        errors,
      });

      ErrorTrackingService.captureValidationError(
        Object.keys(errors)[0],
        messages[0],
        { correlationId: req.correlationId, errors }
      );

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    // Attach validated data to request
    req.validatedData = value;
    next();
  };
}

// Validate request body only
function validateBody(schema) {
  return validateRequest(schema, { body: true, query: false, params: false });
}

// Validate query parameters only
function validateQuery(schema) {
  return validateRequest(schema, { body: false, query: true, params: false });
}

// Validate path parameters only
function validateParams(schema) {
  return validateRequest(schema, { body: false, query: false, params: true });
}

// Validate all (body, query, params)
function validateAll(schema) {
  return validateRequest(schema, { body: true, query: true, params: true });
}

// Custom validators
const validators = {
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  url: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  uuid: (value) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  phone: (value) => {
    const phoneRegex = /^\+?[\d\s\-()]{7,}$/;
    return phoneRegex.test(value);
  },

  postalCode: (value) => {
    const usZipRegex = /^\d{5}(-\d{4})?$/;
    const caPostalRegex = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
    return usZipRegex.test(value) || caPostalRegex.test(value);
  },
};

module.exports = {
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  validateAll,
  validators,
  formatValidationErrors,
};
