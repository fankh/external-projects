/**
 * Injection Defense (L1) - Pattern-based prompt injection detection
 *
 * First defense level: deterministic bilingual (ko/en) ruleset covering
 * jailbreak, system-prompt extraction, role switching, and encoding evasion.
 * Each matched rule contributes to a risk score; the request is blocked when
 * the score reaches BLOCK_THRESHOLD. Matched rule ids are recorded for audit.
 */

const BLOCK_THRESHOLD = 60;

const RULES = [
  // --- Instruction override / jailbreak ---
  { id: 'L1-001', category: 'override', score: 70, pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i },
  { id: 'L1-002', category: 'override', score: 70, pattern: /disregard\s+(all\s+)?(previous|prior|your)\s+(instructions?|rules?|guidelines?)/i },
  { id: 'L1-003', category: 'override', score: 70, pattern: /(이전|위|앞의|기존)\s*(지시|명령|규칙|프롬프트)[^\n]{0,10}(무시|잊어|무효)/ },
  { id: 'L1-004', category: 'override', score: 60, pattern: /(모든|전체)\s*(제한|규칙|필터|검열)[^\n]{0,10}(해제|무시|끄|풀어)/ },
  { id: 'L1-005', category: 'jailbreak', score: 80, pattern: /\b(DAN|do\s+anything\s+now|developer\s+mode|jailbreak|jail\s*break)\b/i },
  { id: 'L1-006', category: 'jailbreak', score: 60, pattern: /(탈옥|제한\s*없는\s*AI|검열\s*없이\s*답변)/ },

  // --- System prompt extraction ---
  { id: 'L1-010', category: 'extraction', score: 80, pattern: /(system\s*prompt|initial\s*instructions?|hidden\s*instructions?)[^\n]{0,30}(reveal|show|print|repeat|output|tell|display)/i },
  { id: 'L1-011', category: 'extraction', score: 80, pattern: /(reveal|show|print|repeat|output|display)[^\n]{0,30}(system\s*prompt|initial\s*instructions?|your\s+instructions)/i },
  { id: 'L1-012', category: 'extraction', score: 80, pattern: /(시스템\s*프롬프트|초기\s*지시|숨겨진\s*지시|사전\s*설정)[^\n]{0,20}(공개|알려|보여|출력|말해|유출)/ },
  { id: 'L1-013', category: 'extraction', score: 60, pattern: /(너의|당신의|네)\s*(지시사항|설정|프롬프트|규칙)[^\n]{0,15}(뭐|무엇|알려|보여|출력)/ },

  // --- Role switching / impersonation ---
  { id: 'L1-020', category: 'role', score: 50, pattern: /\b(you\s+are\s+now|from\s+now\s+on\s+you\s+are|pretend\s+to\s+be|act\s+as\s+if\s+you)\b/i },
  { id: 'L1-021', category: 'role', score: 50, pattern: /(지금부터\s*너는|이제\s*너는|너는\s*이제)[^\n]{0,30}(역할|모드|캐릭터|척)/ },
  { id: 'L1-022', category: 'role', score: 50, pattern: /(역할|페르소나)[^\n]{0,10}(바꿔|변경|전환)[^\n]{0,20}(제한|필터|규칙)/ },

  // --- Encoding / obfuscation evasion ---
  { id: 'L1-030', category: 'encoding', score: 40, pattern: /base64[^\n]{0,20}(decode|디코딩|해석)[^\n]{0,30}(실행|수행|따라)/i },
  { id: 'L1-031', category: 'encoding', score: 40, pattern: /[A-Za-z0-9+/]{120,}={0,2}/ },
  { id: 'L1-032', category: 'encoding', score: 40, pattern: /(rot13|hex\s*decode|유니코드\s*우회)/i },

  // --- Exfiltration staging ---
  { id: 'L1-040', category: 'exfiltration', score: 60, pattern: /(위\s*대화|이\s*대화|전체\s*대화)[^\n]{0,15}(전부|모두|그대로)[^\n]{0,15}(출력|보내|전송|복사)/ },
  { id: 'L1-041', category: 'exfiltration', score: 60, pattern: /(send|post|forward)[^\n]{0,30}(conversation|chat\s*history|this\s+prompt)[^\n]{0,30}(http|url|webhook)/i }
];

class InjectionDefense {
  /**
   * Inspect a prompt against the L1 ruleset.
   *
   * @param {string} text
   * @returns {{ blocked: boolean, riskScore: number, matches: Array<{id: string, category: string, score: number}> }}
   */
  static inspect(text) {
    const matches = [];
    let riskScore = 0;

    for (const rule of RULES) {
      if (rule.pattern.test(text)) {
        matches.push({ id: rule.id, category: rule.category, score: rule.score });
        riskScore += rule.score;
      }
    }

    riskScore = Math.min(riskScore, 100);

    return {
      blocked: riskScore >= BLOCK_THRESHOLD,
      riskScore,
      matches
    };
  }

  static get blockThreshold() {
    return BLOCK_THRESHOLD;
  }
}

module.exports = InjectionDefense;
