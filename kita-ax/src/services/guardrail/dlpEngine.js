/**
 * DLP Engine - Financial PII detection and masking
 *
 * Detects Korean financial PII (RRN, card, account, phone, email, credentials)
 * in prompt/response text and returns masked text plus structured findings.
 * Detection is deterministic (regex + checksum) so PoC measurements are reproducible.
 */

/** Luhn checksum for payment card numbers */
function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Plausibility check for Korean resident registration numbers (주민등록번호) */
function rrnPlausible(rrn) {
  const digits = rrn.replace(/-/g, '');
  if (digits.length !== 13) return false;
  const mm = parseInt(digits.slice(2, 4), 10);
  const dd = parseInt(digits.slice(4, 6), 10);
  const genderDigit = digits.charCodeAt(6) - 48;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  if (genderDigit < 1 || genderDigit > 8) return false;
  return true;
}

/** RRN checksum (pre-2020 issuance; post-2020 tails are random so this only raises confidence) */
function rrnChecksumValid(rrn) {
  const digits = rrn.replace(/-/g, '');
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (digits.charCodeAt(i) - 48) * weights[i];
  const check = (11 - (sum % 11)) % 10;
  return check === digits.charCodeAt(12) - 48;
}

/**
 * Detection rules. Each rule yields findings of one category.
 * mask(match) must return a same-purpose masked replacement.
 */
const RULES = [
  {
    category: 'rrn',
    label: '주민등록번호',
    severity: 'critical',
    pattern: /\b(\d{6})[-\s]?([1-8]\d{6})\b/g,
    validate: (m) => rrnPlausible(`${m[1]}${m[2]}`),
    confidence: (m) => (rrnChecksumValid(`${m[1]}${m[2]}`) ? 'high' : 'medium'),
    mask: (m) => `${m[1]}-${m[2][0]}******`
  },
  {
    category: 'card',
    label: '카드번호',
    severity: 'critical',
    pattern: /\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{2,4})\b/g,
    validate: (m) => luhnValid(`${m[1]}${m[2]}${m[3]}${m[4]}`),
    confidence: () => 'high',
    mask: (m) => `${m[1]}-****-****-${m[4].slice(-4).padStart(4, '*')}`
  },
  {
    // Phone runs before the generic account rule so mobile numbers are not
    // misclassified as account numbers.
    category: 'phone',
    label: '전화번호',
    severity: 'high',
    pattern: /\b(01[016789])[-\s]?(\d{3,4})[-\s]?(\d{4})\b/g,
    validate: () => true,
    confidence: () => 'high',
    mask: (m) => `${m[1]}-****-${m[3]}`
  },
  {
    category: 'account',
    label: '계좌번호',
    severity: 'critical',
    // Hyphenated bank account formats (10-14 digits total), or 10-14 digit runs near an account keyword
    pattern: /(계좌|account|입금|출금|송금)[^\n]{0,20}?(\d[\d-]{8,18}\d)|\b(\d{3,6}-\d{2,6}-\d{2,8})\b/g,
    validate: (m) => {
      const digits = (m[2] || m[3] || '').replace(/-/g, '');
      return digits.length >= 10 && digits.length <= 14;
    },
    confidence: (m) => (m[1] ? 'high' : 'medium'),
    mask: (m) => {
      const raw = m[2] || m[3];
      const digits = raw.replace(/-/g, '');
      const maskedTail = `${digits.slice(0, 3)}-***-${digits.slice(-3)}`;
      return m[1] ? `${m[1]} ${maskedTail}` : maskedTail;
    }
  },
  {
    category: 'email',
    label: '이메일',
    severity: 'medium',
    pattern: /\b([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    validate: () => true,
    confidence: () => 'high',
    mask: (m) => `${m[1][0]}***@${m[2]}`
  },
  {
    category: 'credential',
    label: '자격증명',
    severity: 'critical',
    pattern: /\b(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[bap]-[A-Za-z0-9-]{10,})\b/g,
    validate: () => true,
    confidence: () => 'high',
    mask: (m) => `${m[1].slice(0, 6)}***REDACTED***`
  }
];

class DlpEngine {
  /**
   * Scan text for financial PII.
   *
   * @param {string} text
   * @param {object} [options]
   * @param {string[]} [options.allowCategories] categories permitted for this context
   *   (contextual whitelisting, e.g. 재무팀 may be allowed 'account')
   * @returns {{ findings: Array, maskedText: string, categories: string[], maxSeverity: string|null }}
   */
  static scan(text, options = {}) {
    const allow = new Set(options.allowCategories || []);
    const findings = [];
    let maskedText = text;

    for (const rule of RULES) {
      if (allow.has(rule.category)) continue;
      maskedText = maskedText.replace(rule.pattern, (...args) => {
        const match = args.slice(0, -2);
        if (!rule.validate(match)) return match[0];
        findings.push({
          category: rule.category,
          label: rule.label,
          severity: rule.severity,
          confidence: rule.confidence(match)
        });
        return rule.mask(match);
      });
    }

    const severityRank = { critical: 3, high: 2, medium: 1 };
    const maxSeverity = findings.reduce(
      (acc, f) => (severityRank[f.severity] > (severityRank[acc] || 0) ? f.severity : acc),
      null
    );

    return {
      findings,
      maskedText,
      categories: [...new Set(findings.map((f) => f.category))],
      maxSeverity
    };
  }
}

module.exports = DlpEngine;
