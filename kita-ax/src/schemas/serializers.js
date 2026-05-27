// Response serializers for consistent API output format

const serializers = {
  user: (user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    status: user.status,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt
  }),

  document: (doc) => ({
    id: doc.id,
    title: doc.title,
    classification: doc.classification,
    owner: doc.owner,
    uploadedAt: doc.uploadedAt,
    accessCount: doc.accessCount,
    size: doc.size
  }),

  role: (role) => ({
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    userCount: role.userCount
  }),

  abacRule: (rule) => ({
    name: rule.name,
    condition: rule.condition,
    effect: rule.effect,
    resources: rule.resources,
    status: rule.status
  }),

  policy: (policy) => ({
    name: policy.name,
    type: policy.type,
    target: policy.target,
    status: policy.status,
    createdAt: policy.createdAt
  }),

  auditLog: (log) => ({
    timestamp: log.timestamp,
    eventType: log.eventType,
    user: log.user,
    resource: log.resource,
    action: log.action,
    status: log.status,
    ipAddress: log.ipAddress
  }),

  agent: (agent) => ({
    name: agent.name,
    type: agent.type,
    status: agent.status,
    apiKey: agent.apiKey,
    lastSeen: agent.lastSeen,
    requests24h: agent.requests24h
  }),

  agentGroup: (group) => ({
    name: group.name,
    type: group.type,
    description: group.description,
    agentCount: group.agentCount,
    permissions: group.permissions
  }),

  model: (model) => ({
    name: model.name,
    version: model.version,
    provider: model.provider,
    maxTokens: model.maxTokens,
    costPer1k: model.costPer1k,
    status: model.status
  }),

  paginatedResponse: (data, serializer, pagination) => ({
    data: Array.isArray(data) ? data.map(serializer) : serializer(data),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      totalPages: pagination.totalPages,
      hasNext: pagination.hasNext,
      hasPrev: pagination.hasPrev
    }
  }),

  successResponse: (data, serializer = null) => ({
    success: true,
    data: serializer ? (Array.isArray(data) ? data.map(serializer) : serializer(data)) : data,
    timestamp: new Date().toISOString()
  }),

  errorResponse: (error, code = 'UNKNOWN_ERROR') => ({
    success: false,
    error: {
      message: typeof error === 'string' ? error : error.message,
      code: code,
      timestamp: new Date().toISOString()
    }
  }),

  validationErrorResponse: (errors) => ({
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors,
      timestamp: new Date().toISOString()
    }
  })
};

module.exports = serializers;
