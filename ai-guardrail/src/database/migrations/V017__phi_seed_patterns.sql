-- V017: Seed HIPAA Safe-Harbor PHI detection patterns (regex-based)
-- Categories map to the 18 HIPAA identifiers; focus on the machine-detectable ones.

-- Helper: ensure enum has HEALTHCARE (already seeded but safe)
INSERT INTO dlp_patterns (id, name, description, category, pattern_type, pattern, severity, action, active, created_at, updated_at)
SELECT gen_random_uuid(), v.name, v.description, v.category::dlp_category, 'regex', v.pattern, v.severity::dlp_severity, 'redact'::dlp_action, TRUE, NOW(), NOW()
FROM (VALUES
  ('PHI: SSN', 'US Social Security Number (HIPAA identifier #7)', 'HEALTHCARE', '\\b\\d{3}-\\d{2}-\\d{4}\\b', 'CRITICAL'),
  ('PHI: MRN', 'Medical Record Number (HIPAA identifier #6)', 'HEALTHCARE', '\\b(?:MRN|mrn)[-:# ]*\\d{6,10}\\b', 'HIGH'),
  ('PHI: DOB', 'Date of Birth (HIPAA identifier #3)', 'HEALTHCARE', '\\b(?:0[1-9]|1[0-2])[\\/\\-.](?:0[1-9]|[12]\\d|3[01])[\\/\\-.](?:19|20)\\d{2}\\b', 'HIGH'),
  ('PHI: NPI', 'National Provider Identifier (10-digit)', 'HEALTHCARE', '\\bNPI[-: ]*\\d{10}\\b', 'MEDIUM'),
  ('PHI: ICD-10', 'ICD-10 diagnosis code', 'HEALTHCARE', '\\b[A-TV-Z][0-9][0-9AB](?:\\.[0-9A-TV-Z]{1,4})?\\b', 'MEDIUM'),
  ('PHI: Insurance', 'US insurance member id', 'HEALTHCARE', '\\b(?:Member|Policy)[-:# ]*[A-Z0-9]{6,15}\\b', 'HIGH'),
  ('PHI: Phone', 'US phone number (HIPAA identifier #4)', 'HEALTHCARE', '\\b(?:\\(?\\d{3}\\)?[-.\\s]?)\\d{3}[-.\\s]?\\d{4}\\b', 'MEDIUM'),
  ('PHI: Email', 'Email (HIPAA identifier #5)', 'HEALTHCARE', '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b', 'MEDIUM'),
  ('PHI: IP Address', 'IPv4 address (HIPAA identifier #18)', 'HEALTHCARE', '\\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}\\b', 'LOW')
) AS v(name, description, category, pattern, severity)
WHERE NOT EXISTS (SELECT 1 FROM dlp_patterns WHERE dlp_patterns.name = v.name);
