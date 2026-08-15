# 📚 Seekurity SIEM 라이선스 증서 시스템 - 문서

## 🎯 빠른 액세스

### **방법 1: HTML 버전 보기** (권장 ⭐)
```
브라우저에서 SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.html 파일을 열면
스타일이 적용된 깔끔한 레이아웃으로 볼 수 있습니다.
```

### **방법 2: 마크다운 원본 보기**
```
SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.md 파일을 보면
완전한 기술 문서를 볼 수 있습니다.
```

### **방법 3: 텍스트 버전 보기**
```
SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.txt 파일을 보면
포맷팅 없는 순수 텍스트 버전입니다.
```

---

## 📋 문서 내용

✅ **개요**
  - 시스템 소개
  - 주요 기능

✅ **시스템 구성**
  - 전체 파일 구조
  - 핵심 컴포넌트

✅ **설치 및 설정**
  - 필수 요구사항
  - 빠른 시작 (3단계)

✅ **사용 방법**
  - 자동 패키징
  - 독립 실행형 스크립트
  - 브라우저 인쇄

✅ **설정 파일**
  - 필수 필드
  - 선택 필드
  - 라이선스 번호 규칙

✅ **예제**
  - KOVAN 프로젝트
  - AIG 프로젝트

✅ **커스터마이징**
  - 색상 변경
  - 로고 변경
  - 폰트 변경

✅ **문제 해결**
  - FAQ (6개 질문)
  - 일반적인 오류

✅ **기술 정보**
  - 의존성
  - 성능
  - 파일 크기

---

## 🚀 빠른 시작 (3단계)

```bash
# 1. 신규 프로젝트 생성
python3 scripts/project.py init {customer}

# 2. 라이선스 정보 입력
vi projects/{customer}/license_certificate_config.json

# 3. 패키징 (증서 자동 생성)
python3 scripts/project.py package {customer}
```

**결과:**
- ✓ {CUSTOMER}_license_certificate.html (생성됨)
- ✓ {CUSTOMER}_license_certificate.pdf (자동 생성됨)
- ✓ {CUSTOMER}_산출물_YYYYMMDD.zip (증서 포함)

---

## 📁 파일 목록

| 파일 | 설명 | 액세스 |
|------|------|--------|
| SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.html | 스타일이 적용된 HTML 버전 | ⭐ 추천 |
| SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.md | 마크다운 원본 | 기술 문서 |
| SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.txt | 순수 텍스트 버전 | 텍스트 에디터 |
| README.md | 본 문서 (네비게이션) | 가이드 |

---

## 🔗 GitHub 링크

- 🌐 **HTML 버전**: blob/main/siem-engineering/docs/SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.html
- 📝 **마크다운**: blob/main/siem-engineering/docs/SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.md
- 📂 **폴더**: tree/main/siem-engineering/docs

---

## ✨ 시스템 특징

✅ 자동 라이선스 번호 생성 (SK-XXX-YYYYMM-XXXX)
✅ 발급일 자동 설정
✅ HTML → PDF 자동 변환
✅ 최종 패키지 자동 포함
✅ JSON 설정으로 쉬운 커스터마이징
✅ 한글 완전 지원
✅ A4 인쇄 최적화

---

## 🧪 테스트 완료

✓ **KOVAN**: SK-KOV-202509-0860 (2025-09-01 ~ 2026-09-01)
✓ **AIG**: SK-AIG-202601-4131 (2026-01-15 ~ 2026-04-15)

---

## 📞 지원

모든 기술 질문은 마크다운 또는 HTML 버전의 FAQ 섹션을 참고하세요.

---

**최종 업데이트**: 2026-05-26  
**상태**: ✅ 프로덕션 준비 완료
