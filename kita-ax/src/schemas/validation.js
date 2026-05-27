// Request validation schemas using simple object shape validation

const schemas = {
  user: {
    create: {
      email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      role: { type: 'string', required: true, enum: ['admin', 'editor', 'viewer'] }
    },
    update: {
      email: { type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      role: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
      status: { type: 'string', enum: ['active', 'inactive'] }
    }
  },

  document: {
    create: {
      title: { type: 'string', required: true, minLength: 1, maxLength: 255 },
      classification: {
        type: 'string',
        required: true,
        enum: ['public', 'internal', 'confidential', 'secret']
      },
      owner: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
    },
    update: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      classification: {
        type: 'string',
        enum: ['public', 'internal', 'confidential', 'secret']
      },
      owner: { type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
    }
  },

  role: {
    create: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 50 },
      description: { type: 'string', required: true, minLength: 1, maxLength: 500 },
      permissions: { type: 'array', required: true, minItems: 1 }
    }
  },

  abacRule: {
    create: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
      condition: { type: 'string', required: true, minLength: 1 },
      effect: { type: 'string', required: true, enum: ['allow', 'deny'] },
      resources: { type: 'array', required: true, minItems: 1 }
    }
  },

  policy: {
    create: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
      type: { type: 'string', required: true, enum: ['rbac', 'abac'] },
      target: { type: 'string', required: true, minLength: 1, maxLength: 100 }
    }
  },

  agent: {
    create: {
      name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
      type: { type: 'string', required: true, enum: ['analysis', 'automation'] }
    }
  },

  pagination: {
    page: { type: 'number', min: 1 },
    pageSize: { type: 'number', min: 1, max: 100 }
  }
};

function validate(data, schema) {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({ field, message: `${field} is required` });
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push({ field, message: `${field} must be a string` });
      continue;
    }

    if (rules.type === 'number' && typeof value !== 'number') {
      errors.push({ field, message: `${field} must be a number` });
      continue;
    }

    if (rules.type === 'array' && !Array.isArray(value)) {
      errors.push({ field, message: `${field} must be an array` });
      continue;
    }

    if (rules.pattern && !rules.pattern.test(String(value))) {
      errors.push({ field, message: `${field} is invalid` });
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}` });
    }

    if (rules.minLength && String(value).length < rules.minLength) {
      errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
    }

    if (rules.maxLength && String(value).length > rules.maxLength) {
      errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters` });
    }

    if (rules.min && value < rules.min) {
      errors.push({ field, message: `${field} must be at least ${rules.min}` });
    }

    if (rules.max && value > rules.max) {
      errors.push({ field, message: `${field} must be at most ${rules.max}` });
    }

    if (rules.minItems && Array.isArray(value) && value.length < rules.minItems) {
      errors.push({ field, message: `${field} must have at least ${rules.minItems} items` });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  schemas,
  validate
};
