/**
 * Unit Tests for DLP Engine
 */

const DlpEngine = require('../../../../src/services/guardrail/dlpEngine');

describe('DlpEngine', () => {
  describe('resident registration number (주민등록번호)', () => {
    it('detects and masks a plausible RRN', () => {
      const r = DlpEngine.scan('제 주민번호는 900101-1234567 입니다');
      expect(r.categories).toContain('rrn');
      expect(r.maskedText).toContain('900101-1******');
      expect(r.maskedText).not.toContain('1234567');
    });

    it('ignores an implausible RRN (invalid month)', () => {
      const r = DlpEngine.scan('숫자 991501-1234567');
      expect(r.categories).not.toContain('rrn');
    });
  });

  describe('card number', () => {
    it('detects a Luhn-valid card and masks the middle', () => {
      const r = DlpEngine.scan('카드 4111-1111-1111-1111 결제');
      expect(r.categories).toContain('card');
      expect(r.maskedText).toContain('4111-****-****-1111');
    });

    it('ignores a Luhn-invalid 16-digit run', () => {
      const r = DlpEngine.scan('참조번호 1234-5678-9012-3456');
      expect(r.categories).not.toContain('card');
    });
  });

  describe('other categories', () => {
    it('detects phone numbers', () => {
      const r = DlpEngine.scan('연락처 010-1234-5678');
      expect(r.categories).toContain('phone');
      expect(r.maskedText).toContain('010-****-5678');
    });

    it('detects email', () => {
      const r = DlpEngine.scan('메일 hong@bnk.co.kr 로 회신');
      expect(r.categories).toContain('email');
      expect(r.maskedText).toContain('h***@bnk.co.kr');
    });

    it('detects API-key style credentials', () => {
      const r = DlpEngine.scan('key sk-abcdefghijklmnopqrstuvwx');
      expect(r.categories).toContain('credential');
      expect(r.maskedText).toContain('REDACTED');
    });
  });

  describe('contextual whitelisting', () => {
    it('does not mask whitelisted categories', () => {
      const r = DlpEngine.scan('계좌 123-45-678901 확인', { allowCategories: ['account'] });
      expect(r.categories).not.toContain('account');
      expect(r.maskedText).toContain('123-45-678901');
    });
  });

  describe('clean text', () => {
    it('returns no findings and unchanged text for normal business prompts', () => {
      const text = '여신 심사 보고서 요약해줘. 담보 비율과 상환 계획 중심으로.';
      const r = DlpEngine.scan(text);
      expect(r.findings).toHaveLength(0);
      expect(r.maskedText).toBe(text);
      expect(r.maxSeverity).toBeNull();
    });
  });
});
