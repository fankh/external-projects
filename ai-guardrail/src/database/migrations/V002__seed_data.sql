-- ============================================================
-- KYRA AI Guardrail - Seed Data
-- ============================================================

-- Default Roles
INSERT INTO roles (id, name, description, permissions, level, is_system) VALUES
    ('00000000-0000-0000-0000-000000000001', 'user', 'Standard user', '["chat:read", "chat:write", "rag:read", "rag:upload", "bookmark:manage", "profile:manage"]', 0, TRUE),
    ('00000000-0000-0000-0000-000000000002', 'power_user', 'Power user with extended quotas', '["chat:read", "chat:write", "rag:read", "rag:upload", "rag:manage", "bookmark:manage", "profile:manage", "report:read"]', 1, TRUE),
    ('00000000-0000-0000-0000-000000000003', 'manager', 'Team manager with oversight', '["chat:read", "chat:write", "rag:read", "rag:upload", "rag:manage", "bookmark:manage", "profile:manage", "report:read", "report:create", "team:read", "team:manage"]', 2, TRUE),
    ('00000000-0000-0000-0000-000000000004', 'admin', 'System administrator', '["*"]', 3, TRUE);

-- Default Quota Tiers
INSERT INTO quota_tiers (id, name, description, queries_per_hour, queries_per_day, tokens_per_query, tokens_per_day, rag_queries_per_day, document_uploads_per_day, is_default) VALUES
    ('00000000-0000-0000-0000-000000000010', 'basic', 'Basic tier for standard users', 50, 200, 4096, 100000, 20, 5, TRUE),
    ('00000000-0000-0000-0000-000000000011', 'standard', 'Standard tier for regular usage', 100, 500, 8192, 250000, 50, 10, FALSE),
    ('00000000-0000-0000-0000-000000000012', 'power', 'Power tier for heavy usage', 300, 1500, 16384, 500000, 100, 25, FALSE),
    ('00000000-0000-0000-0000-000000000013', 'unlimited', 'Unlimited tier for admins', -1, -1, 32768, -1, -1, -1, FALSE);

-- Default Admin User (password: admin123 - CHANGE IN PRODUCTION)
INSERT INTO users (id, email, password_hash, name, role_id, quota_tier_id, status) VALUES
    ('00000000-0000-0000-0000-000000000100', 'admin@kyra.local', '$2a$12$LJ3m4ys3ez/4tLVFiDYle.EKqDz5ILz6zcGLz1bTRHOFHMoImy3Lm', 'System Admin', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000013', 'active');

-- 12 AI Personas
INSERT INTO personas (id, name, description, icon, color, category, system_prompt, guardrails, is_default, display_order) VALUES
    ('general', 'General Assistant', 'Versatile AI assistant for everyday tasks', 'Bot', '#3B82F6', 'general',
     'You are KYRA, a helpful and knowledgeable AI assistant. Provide clear, accurate, and well-structured responses. Always cite sources when available.',
     '{"allowedTopics": ["*"], "temperature": 0.7, "maxTokens": 4096}', TRUE, 1),

    ('legal', 'Legal Advisor', 'Legal research and compliance guidance', 'Scale', '#8B5CF6', 'professional',
     'You are KYRA Legal Advisor. Provide legal information and guidance. Always include disclaimers that your responses do not constitute legal advice. Cite relevant laws, regulations, and case precedents.',
     '{"allowedTopics": ["law", "compliance", "regulation", "contract"], "restrictedTopics": ["medical_advice"], "requireCitations": true, "temperature": 0.3, "maxTokens": 8192}', FALSE, 2),

    ('finance', 'Financial Analyst', 'Financial analysis and reporting', 'TrendingUp', '#10B981', 'professional',
     'You are KYRA Financial Analyst. Provide financial analysis, market insights, and data interpretation. Use data-driven reasoning and always note assumptions.',
     '{"allowedTopics": ["finance", "accounting", "market", "investment"], "requireCitations": true, "temperature": 0.3, "maxTokens": 8192}', FALSE, 3),

    ('hr', 'HR Specialist', 'Human resources and people operations', 'Users', '#F59E0B', 'professional',
     'You are KYRA HR Specialist. Assist with HR policies, employee relations, recruitment, and organizational development. Maintain strict confidentiality.',
     '{"allowedTopics": ["hr", "recruitment", "policy", "employee_relations"], "restrictedTopics": ["salary_specifics", "termination_details"], "temperature": 0.5, "maxTokens": 4096}', FALSE, 4),

    ('engineering', 'Software Engineer', 'Software development and technical guidance', 'Code', '#EF4444', 'technical',
     'You are KYRA Engineering Assistant. Help with software development, code review, architecture decisions, and debugging. Provide code examples in appropriate languages.',
     '{"allowedTopics": ["programming", "architecture", "devops", "databases"], "allowExternalLinks": false, "temperature": 0.4, "maxTokens": 8192}', FALSE, 5),

    ('security', 'Security Analyst', 'Cybersecurity and risk assessment', 'Shield', '#DC2626', 'technical',
     'You are KYRA Security Analyst. Provide cybersecurity guidance, threat analysis, and security best practices. Never provide information that could be used for malicious purposes.',
     '{"allowedTopics": ["cybersecurity", "risk", "compliance", "incident_response"], "restrictedTopics": ["exploit_creation", "hacking_tools"], "requireCitations": true, "temperature": 0.3, "maxTokens": 4096}', FALSE, 6),

    ('data', 'Data Scientist', 'Data analysis, ML, and statistical insights', 'BarChart', '#6366F1', 'technical',
     'You are KYRA Data Scientist. Help with data analysis, machine learning, statistical modeling, and data visualization. Explain methodologies and assumptions clearly.',
     '{"allowedTopics": ["data_science", "machine_learning", "statistics", "visualization"], "temperature": 0.4, "maxTokens": 8192}', FALSE, 7),

    ('marketing', 'Marketing Strategist', 'Marketing campaigns and brand strategy', 'Megaphone', '#EC4899', 'business',
     'You are KYRA Marketing Strategist. Assist with marketing campaigns, content strategy, brand positioning, and market analysis. Be creative yet data-driven.',
     '{"allowedTopics": ["marketing", "branding", "content", "advertising"], "temperature": 0.8, "maxTokens": 4096}', FALSE, 8),

    ('operations', 'Operations Manager', 'Process optimization and project management', 'Settings', '#14B8A6', 'business',
     'You are KYRA Operations Manager. Help optimize processes, manage projects, and improve operational efficiency. Focus on actionable recommendations.',
     '{"allowedTopics": ["operations", "project_management", "process_optimization"], "temperature": 0.5, "maxTokens": 4096}', FALSE, 9),

    ('research', 'Research Analyst', 'In-depth research and analysis', 'Search', '#F97316', 'professional',
     'You are KYRA Research Analyst. Conduct thorough analysis and synthesize information from multiple sources. Always cite sources and note limitations.',
     '{"allowedTopics": ["*"], "requireCitations": true, "temperature": 0.4, "maxTokens": 8192}', FALSE, 10),

    ('creative', 'Creative Writer', 'Content creation and copywriting', 'PenTool', '#A855F7', 'creative',
     'You are KYRA Creative Writer. Help with content creation, copywriting, storytelling, and creative ideation. Adapt tone and style to the audience.',
     '{"allowedTopics": ["writing", "content", "creativity", "storytelling"], "temperature": 0.9, "maxTokens": 4096}', FALSE, 11),

    ('support', 'Customer Support', 'Customer service and communication', 'HeadphonesIcon', '#0EA5E9', 'business',
     'You are KYRA Customer Support Specialist. Help craft professional customer responses, analyze customer feedback, and develop support documentation.',
     '{"allowedTopics": ["customer_service", "communication", "feedback"], "temperature": 0.5, "maxTokens": 4096}', FALSE, 12);

-- Default Purposes
INSERT INTO purposes (id, name, description, icon, category, prompt_template, output_format, display_order) VALUES
    ('summarize', 'Summarize', 'Create concise summaries of text or documents', 'FileText', 'analysis',
     'Please provide a comprehensive summary of the following content. Include key points, main arguments, and conclusions:\n\n{{content}}', 'markdown', 1),
    ('analyze', 'Analyze', 'Perform in-depth analysis', 'BarChart', 'analysis',
     'Please analyze the following content in detail. Identify patterns, insights, strengths, and areas for improvement:\n\n{{content}}', 'markdown', 2),
    ('draft', 'Draft', 'Draft documents, emails, and communications', 'Edit', 'creation',
     'Please draft the following based on the given context and requirements:\n\nType: {{type}}\nTone: {{tone}}\nContext: {{content}}', 'text', 3),
    ('translate', 'Translate', 'Translate text between languages', 'Languages', 'utility',
     'Please translate the following text from {{source_language}} to {{target_language}}:\n\n{{content}}', 'text', 4),
    ('code-review', 'Code Review', 'Review and improve code quality', 'Code', 'technical',
     'Please review the following code for quality, security, performance, and best practices:\n\n```{{language}}\n{{content}}\n```', 'markdown', 5),
    ('brainstorm', 'Brainstorm', 'Generate creative ideas and solutions', 'Lightbulb', 'creation',
     'Please brainstorm ideas for the following topic or challenge:\n\n{{content}}\n\nGenerate at least 5 creative and diverse ideas.', 'markdown', 6),
    ('explain', 'Explain', 'Explain complex concepts simply', 'BookOpen', 'education',
     'Please explain the following concept in clear, simple terms. Use analogies and examples where helpful:\n\n{{content}}', 'markdown', 7),
    ('compare', 'Compare', 'Compare and contrast options', 'GitCompare', 'analysis',
     'Please compare and contrast the following options. Create a structured comparison with pros, cons, and recommendations:\n\n{{content}}', 'markdown', 8);

-- Default DLP Patterns
INSERT INTO dlp_patterns (name, description, category, pattern, severity, action) VALUES
    ('SSN', 'US Social Security Number', 'pii', '\b\d{3}-\d{2}-\d{4}\b', 'critical', 'block'),
    ('Credit Card', 'Credit card numbers (Visa, MC, Amex)', 'financial', '\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b', 'critical', 'block'),
    ('Email Address', 'Email addresses', 'pii', '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', 'medium', 'redact'),
    ('Phone Number', 'US phone numbers', 'pii', '\b(?:\+1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b', 'medium', 'redact'),
    ('AWS Access Key', 'AWS access key IDs', 'credentials', '(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}', 'critical', 'block'),
    ('Private Key', 'Private key headers', 'credentials', '-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----', 'critical', 'block'),
    ('API Key Generic', 'Generic API key patterns', 'credentials', '(?:api[_-]?key|apikey|access[_-]?token)\s*[:=]\s*["\x27]?[a-zA-Z0-9_-]{20,}', 'high', 'block'),
    ('JWT Token', 'JSON Web Tokens', 'credentials', 'eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*', 'high', 'redact'),
    ('Medical Record', 'Medical record numbers', 'healthcare', '(?:MRN|medical record)\s*(?:number|no|#)?:?\s*[A-Z0-9]{6,12}', 'critical', 'block'),
    ('Bank Account', 'Bank account numbers', 'financial', 'account\s*(?:number|no|#)?:?\s*\d{8,17}', 'high', 'block'),
    ('Confidential Marker', 'Confidentiality markers', 'intellectual_property', '(?:CONFIDENTIAL|PROPRIETARY|INTERNAL\s+ONLY|DO\s+NOT\s+DISTRIBUTE)', 'high', 'log');

-- System Configuration
INSERT INTO system_config (key, value, description, category) VALUES
    ('security.max_login_attempts', '5', 'Maximum failed login attempts before lockout', 'security'),
    ('security.lockout_duration_minutes', '30', 'Account lockout duration in minutes', 'security'),
    ('security.session_timeout_minutes', '60', 'Session inactivity timeout', 'security'),
    ('security.max_concurrent_sessions', '5', 'Maximum concurrent sessions per user', 'security'),
    ('features.rag_enabled', 'true', 'Enable RAG document retrieval', 'features'),
    ('features.memory_enabled', 'true', 'Enable conversation memory', 'features'),
    ('features.streaming_enabled', 'true', 'Enable streaming responses', 'features'),
    ('features.multimodal_enabled', 'true', 'Enable multi-modal support', 'features'),
    ('limits.max_file_size_mb', '50', 'Maximum file upload size in MB', 'limits'),
    ('limits.max_message_length', '32000', 'Maximum message character length', 'limits');
