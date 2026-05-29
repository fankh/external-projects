const Joi = require('joi');

// Custom messages for consistent error responses
const messages = {
  'string.base': '{#label} must be a string',
  'string.email': '{#label} must be a valid email address',
  'string.min': '{#label} must be at least {#limit} characters long',
  'string.max': '{#label} must not exceed {#limit} characters',
  'string.empty': '{#label} cannot be empty',
  'string.pattern.base': '{#label} has an invalid format',
  'any.required': '{#label} is required',
  'any.only': '{#label} must be one of {#valids}',
  'number.base': '{#label} must be a number',
  'number.min': '{#label} must be at least {#limit}',
  'number.max': '{#label} must not exceed {#limit}',
  'date.base': '{#label} must be a valid date',
  'array.base': '{#label} must be an array',
  'array.min': '{#label} must have at least {#limit} items',
};

// ===== Authentication Schemas =====

const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages(messages),
  password: Joi.string()
    .min(6)
    .required()
    .messages(messages),
}).messages(messages);

const twoFactorVerifySchema = Joi.object({
  token: Joi.string()
    .regex(/^\d{6}$/)
    .required()
    .messages({
      ...messages,
      'string.pattern.base': 'Token must be a 6-digit code',
    }),
}).messages(messages);

const twoFactorSetupSchema = Joi.object({
  token: Joi.string()
    .regex(/^\d{6}$/)
    .required()
    .messages({
      ...messages,
      'string.pattern.base': 'Confirmation code must be a 6-digit code',
    }),
  secret: Joi.string()
    .required()
    .messages(messages),
}).messages(messages);

// ===== User Schemas =====

const userCreateSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages(messages),
  name: Joi.string()
    .max(100)
    .optional()
    .messages(messages),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      ...messages,
      'string.pattern.base': 'Password must contain uppercase, lowercase, and numbers',
    }),
  role: Joi.string()
    .valid('admin', 'editor', 'viewer')
    .optional()
    .messages(messages),
}).messages(messages);

const userUpdateSchema = Joi.object({
  email: Joi.string()
    .email()
    .optional()
    .messages(messages),
  name: Joi.string()
    .max(100)
    .optional()
    .messages(messages),
  role: Joi.string()
    .valid('admin', 'editor', 'viewer')
    .optional()
    .messages(messages),
  status: Joi.string()
    .valid('active', 'inactive', 'suspended')
    .optional()
    .messages(messages),
}).messages(messages);

const passwordChangeSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages(messages),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .invalid(Joi.ref('currentPassword'))
    .messages({
      ...messages,
      'any.invalid': 'New password must be different from current password',
      'string.pattern.base': 'Password must contain uppercase, lowercase, and numbers',
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      ...messages,
      'any.only': 'Password confirmation does not match',
    }),
}).messages(messages);

// ===== Document Schemas =====

const documentCreateSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(255)
    .required()
    .messages(messages),
  content: Joi.string()
    .min(1)
    .optional()
    .messages(messages),
  category: Joi.string()
    .max(100)
    .optional()
    .messages(messages),
  tags: Joi.array()
    .items(Joi.string().max(50))
    .optional()
    .messages(messages),
  status: Joi.string()
    .valid('draft', 'published', 'archived')
    .optional()
    .messages(messages),
}).messages(messages);

const documentUpdateSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(255)
    .optional()
    .messages(messages),
  content: Joi.string()
    .min(1)
    .optional()
    .messages(messages),
  category: Joi.string()
    .max(100)
    .optional()
    .messages(messages),
  tags: Joi.array()
    .items(Joi.string().max(50))
    .optional()
    .messages(messages),
  status: Joi.string()
    .valid('draft', 'published', 'archived')
    .optional()
    .messages(messages),
}).messages(messages);

// ===== Query Schemas =====

const paginationSchema = Joi.object({
  page: Joi.number()
    .min(1)
    .optional()
    .messages(messages),
  limit: Joi.number()
    .min(1)
    .max(100)
    .optional()
    .messages(messages),
  sort: Joi.string()
    .optional()
    .messages(messages),
  order: Joi.string()
    .valid('asc', 'desc')
    .optional()
    .messages(messages),
}).messages(messages);

const searchSchema = Joi.object({
  q: Joi.string()
    .max(255)
    .optional()
    .messages(messages),
  ...paginationSchema.describe().keys,
}).messages(messages);

// ===== Settings Schemas =====

const preferencesUpdateSchema = Joi.object({
  theme: Joi.string()
    .valid('light', 'dark', 'auto')
    .optional()
    .messages(messages),
  language: Joi.string()
    .valid('en', 'ko', 'ja', 'zh')
    .optional()
    .messages(messages),
  timezone: Joi.string()
    .optional()
    .messages(messages),
  notifications: Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
    sms: Joi.boolean().optional(),
  }).optional()
    .messages(messages),
}).messages(messages);

// ===== OAuth Schemas =====

const oauthCallbackSchema = Joi.object({
  code: Joi.string()
    .required()
    .messages(messages),
  state: Joi.string()
    .required()
    .messages(messages),
}).messages(messages);

module.exports = {
  // Auth
  loginSchema,
  twoFactorVerifySchema,
  twoFactorSetupSchema,

  // User
  userCreateSchema,
  userUpdateSchema,
  passwordChangeSchema,

  // Document
  documentCreateSchema,
  documentUpdateSchema,

  // Query
  paginationSchema,
  searchSchema,

  // Settings
  preferencesUpdateSchema,

  // OAuth
  oauthCallbackSchema,
};
