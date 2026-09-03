import { headers } from 'next/headers'

/** 인쇄용 문서의 툴바(인쇄·닫기) — 버튼 마크업과 그 동작을 한 곳에서 만든다.
 *
 *  그전에는 열 개 문서 라우트가 저마다 `onclick="window.print()"` 를 적고 있었다. CSP 를 세운
 *  뒤(script-src 에 unsafe-inline 없음) 브라우저가 인라인 이벤트 핸들러를 차단하면서 그 버튼들이
 *  전부 죽었다 — 화면은 멀쩡히 그려지고 버튼도 보이는데 누르면 아무 일도 일어나지 않는다.
 *  인쇄용이라 이름 붙인 문서에서 인쇄가 안 되는 상태였고, 스위트는 이 라우트들을 브라우저로
 *  열지 않아 초록이었다.
 *
 *  고침은 unsafe-inline 을 되돌리는 쪽이 아니라 인라인 핸들러를 없애는 쪽이다. 미들웨어가
 *  요청마다 만든 nonce 를 x-nonce 요청 헤더로 넘겨 주므로, 그 nonce 를 단 <script> 에서
 *  addEventListener 로 붙인다. CSP 는 그대로 엄격하게 둔다. */
export async function printToolbar(caption: string): Promise<string> {
  const nonce = (await headers()).get('x-nonce') ?? ''
  return `<div class="toolbar">
    <button class="pri" id="doc-print">인쇄</button>
    <button id="doc-close">닫기</button>
    <span class="cap">${caption}</span>
  </div>
<script nonce="${nonce}">
document.getElementById('doc-print').addEventListener('click', () => window.print())
document.getElementById('doc-close').addEventListener('click', () => window.close())
</script>`
}
