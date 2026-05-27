const { validate, schemas } = require('../schemas/validation');
const serializers = require('../schemas/serializers');

function validateRequest(schemaKey) {
  return (req, res, next) => {
    if (!schemas[schemaKey]) {
      return res.status(500).json(serializers.errorResponse('Validation schema not found', 'SCHEMA_NOT_FOUND'));
    }

    const schema = schemas[schemaKey];
    const validation = validate(req.body, schema);

    if (!validation.valid) {
      return res.status(400).json(serializers.validationErrorResponse(validation.errors));
    }

    next();
  };
}

function validateQuery(querySchema) {
  return (req, res, next) => {
    const validation = validate(req.query, querySchema);

    if (!validation.valid) {
      return res.status(400).json(serializers.validationErrorResponse(validation.errors));
    }

    next();
  };
}

function validatePagination(req, res, next) {
  const { page, pageSize } = req.query;
  const errors = [];

  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      errors.push({ field: 'page', message: 'page must be a positive number' });
    }
  }

  if (pageSize !== undefined) {
    const size = parseInt(pageSize);
    if (isNaN(size) || size < 1 || size > 100) {
      errors.push({ field: 'pageSize', message: 'pageSize must be between 1 and 100' });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json(serializers.validationErrorResponse(errors));
  }

  next();
}

module.exports = {
  validateRequest,
  validateQuery,
  validatePagination
};
