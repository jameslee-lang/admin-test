# 어드민 워크스루 (admin-walkthrough)

실제 Shoplive 어드민 화면 위에 단계별 안내를 얹어, 고객사가 **직접 클릭하며** 방송을 만들어 보게 하는 도구입니다.
설치·확장프로그램·빌드 없이, 북마클릿(북마크에 저장하는 자바스크립트 링크)만으로 동작합니다.

## 무엇인지
- 어드민 소스에 손대지 않고, 브라우저에서 북마클릿을 눌러 안내 오버레이를 띄웁니다.
- 안내는 `flows/*.json`에 정의합니다. 각 단계가 화면의 특정 요소를 강조하고, 사용자가 그 요소를
  실제로 클릭/입력하면 자동으로 다음 단계로 넘어갑니다. (읽기만 하는 교육이 아니라 "직접 해보는" 교육)
- 새로고침하거나 페이지가 바뀌어도 `localStorage`에 진행 위치가 남아 이어서 진행됩니다.

## 두 개의 북마클릿
1. **워크스루 실행** — 선택한 플로우(`flows/<id>.json`)를 불러와 단계별 안내를 시작합니다.
2. **요소 선택기** — 마우스를 올린 요소를 강조하고, 클릭하면 그 요소의 **CSS 선택자 + 태그/텍스트**를
   화면 패널에 잡아 줍니다. 복사 버튼으로 바로 가져올 수 있습니다.
   실제 어드민 DOM을 프로그램으로 열어볼 수 없기 때문에, 플로우에 넣을 선택자는 이 도구로 직접 클릭해 모읍니다.

두 북마클릿 링크는 `index.html`에서 자동 생성됩니다. 그 페이지를 열어 링크를 북마크바로 드래그하세요.

## 선택기 출력 → 플로우 스텝으로 옮기기
1. 어드민 화면에서 **요소 선택기** 북마클릿을 누릅니다.
2. 워크스루에서 강조하고 싶은 요소(예: '방송 추가' 버튼)에 마우스를 올리고 클릭합니다.
3. 패널의 **CSS Selector** 칸에 선택자가 잡힙니다. `선택자 복사` 또는 `스텝 JSON 복사`를 누릅니다.
   - `스텝 JSON 복사`는 아래 형태의 스텝 하나를 통째로 복사해 줍니다:
     ```json
     {
       "selector": "button[data-testid=\"broadcast-add\"]",
       "title": "제목을 입력하세요",
       "description": "설명을 입력하세요",
       "waitFor": { "type": "click" }
     }
     ```
4. 복사한 값을 해당 플로우 JSON의 `steps` 배열 안에서 원하는 스텝의 `selector`에 붙여 넣고,
   `title`/`description`/`waitFor`를 상황에 맞게 채웁니다.
5. `broadcast-register.json`의 `TODO_SELECTOR_1` 같은 자리표시자를 이렇게 실제 선택자로 하나씩 교체합니다.

## 플로우 작성 방법 (스키마)
`flows/<id>.json`:

```json
{
  "id": "broadcast-register",
  "title": "화면에 보일 플로우 이름",
  "steps": [
    {
      "selector": null,
      "title": "정보 전용 단계",
      "description": "selector 가 없으면 특정 요소 없이 안내만 보이고, '다음' 버튼으로 넘어갑니다."
    },
    {
      "selector": "button[data-testid=\"broadcast-add\"]",
      "title": "방송 추가",
      "description": "이 버튼을 눌러 방송을 만듭니다.",
      "waitFor": { "type": "click" }
    }
  ]
}
```

스텝 필드:
- `selector` (string | null): 강조할 요소의 CSS 선택자. `null`이면 요소 없이 안내만 표시하는 정보 전용 단계.
- `title` (string): 안내 제목.
- `description` (string): 안내 본문.
- `waitFor` (object, 선택): 이 값이 있으면 "다음" 버튼 없이, 사용자가 지정 동작을 하면 자동으로 넘어갑니다.
  - `{ "type": "click" }` — 강조된 요소를 클릭하면.
  - `{ "type": "input", "value": "선택" }` — 입력이 발생하면 (`value` 있으면 그 값과 일치하거나 값이 채워졌을 때).
  - `{ "type": "urlChange", "value": "/broadcast/edit" }` — URL이 바뀌면 (`value` 있으면 그 문자열을 포함하게 되면).
  - `waitFor`가 없으면 수동 "다음" 버튼이 나옵니다 (맥락만 짚는 단계에 적합).

새 플로우를 추가하면 `index.html`의 `<select id="flow">`에 `<option>`을 하나 더 넣어 주세요.

## jsDelivr 캐싱 / 버전 관리 (`?v=` 올리기)
- 북마클릿은 `engine.js`를 jsDelivr GitHub CDN에서 불러옵니다:
  `https://cdn.jsdelivr.net/gh/<user>/<repo>@main/admin-walkthrough/engine.js?v1`
- jsDelivr는 파일을 캐시하므로, 레포를 고쳐도 바로 반영 안 될 수 있습니다.
- `index.html`의 `VERSION` 값을 `v1` → `v2` … 로 **올릴 때마다** 캐시가 무효화되어 최신 코드가 로드됩니다.
  릴리스(엔진/스타일 변경) 때마다 이 값을 올리고 북마클릿을 다시 저장(또는 재드래그)하세요.
- `Date.now()`/`Math.random()`을 쓰지 않는 이유: 파일이 오프라인에서 작성·커밋되므로, 커밋된 파일 안에는
  실행 시점 값이 아니라 정적인 버전 문자열만 두어야 재현 가능합니다.

## 알려진 제약 (CSP)
일부 사이트는 **Content-Security-Policy(CSP)** 헤더로 외부 `<script src>` 주입을 막습니다.
이 경우 북마클릿이 `engine.js`를 원격 로드하지 못할 수 있습니다.
- 증상: 북마클릿을 눌러도 오버레이가 안 뜨고, 콘솔에 CSP 위반 오류가 보임.
- 대체 방법(현재 미구현, 문서로만 안내): `engine.js` 코드 전체를 북마클릿 본문에 직접 넣어(원격 로드 없이)
  실행하는 방식으로 우회할 수 있습니다. 필요해지면 그때 인라인 빌드본을 만들면 됩니다.

## 폴더 구조
```
admin-walkthrough/
  engine.js                    런타임 전체 (워크스루 모드 + 선택기 모드)
  index.html                   북마클릿 생성 + 사용 안내 랜딩 페이지
  flows/
    broadcast-register.json    방송 등록 플로우 (선택자는 아직 자리표시자)
  README.md                    이 문서
```
