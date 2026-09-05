# GitHub Pages로 공개하기

이 사이트는 **빌드 스텝이 없습니다.** 폴더를 그대로 올리면 그게 곧 배포입니다.
GitHub Actions도, 별도 설정 파일도 필요 없습니다.

목표 주소:

```
https://databetter25.github.io/dist/
```

아래 세 가지 방법 중 **하나만** 하시면 됩니다. 터미널이 익숙하지 않으시면 A를 권합니다.

---

## A. 웹브라우저만으로 (터미널 없이)

### 1. 리포지토리 만들기

1. https://github.com/new 접속
2. **Repository name** 에 `distribution` 입력 — 이 이름이 주소의 마지막 칸이 됩니다
3. **Public** 선택 (Private이면 Pages가 무료 플랜에서 동작하지 않습니다)
4. `Add a README file` **체크 해제** — 우리 README를 올릴 것이므로
5. **Create repository**

### 2. 파일 올리기

1. 받으신 `distribution.zip` 의 압축을 풉니다
2. 방금 만든 리포 화면에서 **uploading an existing file** 링크 클릭
   (또는 `Add file` → `Upload files`)
3. 압축을 푼 `distribution` 폴더 **안의 내용물 전부**를 드래그해 놓습니다

   > **폴더 자체가 아니라 그 안의 것들**입니다.
   > `index.html`, `css/`, `js/`, `data/`, `vendor/` … 이 최상단에 와야 합니다.
   > `distribution/index.html` 처럼 한 겹 더 들어가면 주소가 어긋납니다.

4. 업로드가 끝나면 아래 **Commit changes** 클릭

   > 파일이 80개라 업로드에 1~2분 걸립니다. `vendor/katex/fonts/` 까지 다 올라갔는지
   > 커밋 후 파일 목록에서 한 번 확인하세요. 이게 빠지면 수식이 안 나옵니다.

### 3. Pages 켜기

1. 리포 상단 **Settings** → 왼쪽 메뉴 **Pages**
2. **Source** 를 `Deploy from a branch` 로
3. **Branch** 를 `main`, 폴더는 `/ (root)` 로 두고 **Save**
4. 1~2분 뒤 같은 화면 위쪽에 초록색으로 주소가 뜹니다

---

## B. 터미널에서 (git)

압축을 푼 폴더에서:

```bash
cd distribution
git init -b main
git add .
git commit -m "확률분포 관계 탐색기"
git remote add origin https://github.com/databetter25/distribution.git
git push -u origin main
```

리포지토리는 미리 https://github.com/new 에서 `distribution` 이라는 이름으로,
**README 없이 비어 있는 상태**로 만들어 두어야 합니다.
푸시한 다음 위 **A-3. Pages 켜기** 를 하면 끝입니다.

> 비밀번호를 물으면 GitHub 계정 비밀번호가 아니라
> **Personal Access Token** 이 필요합니다 (Settings → Developer settings →
> Personal access tokens → Tokens (classic) → `repo` 권한).
> `gh` CLI가 설치돼 있다면 `gh auth login` 한 번으로 이 과정을 건너뛸 수 있습니다.

### gh CLI가 있다면 더 짧게

```bash
cd distribution
git init -b main && git add . && git commit -m "확률분포 관계 탐색기"
gh repo create distribution --public --source=. --push
gh api -X POST repos/databetter25/dist/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

마지막 줄이 Pages까지 켜 줍니다.

---

## C. 이후 수정할 때

파일을 고치고 다시 올리면 **1~2분 뒤 자동으로 반영**됩니다.

```bash
git add .
git commit -m "무엇을 고쳤는지"
git push
```

웹으로 하셨다면 같은 파일을 다시 업로드하면 덮어써집니다.

---

## 배포 후 확인 (3분)

실제 주소에서 아래만 보시면 됩니다. 전체 절차는 `CHECK.md` 에 있습니다.

| 확인 | 어긋나면 |
|---|---|
| https://databetter25.github.io/distribution/ 에 관계도가 뜬다 | 파일이 한 겹 더 들어갔을 가능성. 리포 최상단에 `index.html` 이 보여야 합니다 |
| 수식이 `\frac{...}` 이 아니라 제대로 나온다 | `vendor/katex/` 가 덜 올라간 것입니다 |
| 상단 메뉴 `이산 관계도` · `중심극한정리` 가 열린다 | 페이지 파일 누락 |
| `.../test/numeric.html` 이 전 항목 PASS | 배포본 자체 검증입니다 |

> `.nojekyll` 파일이 이미 들어 있습니다. 이게 없으면 GitHub가 `vendor/` 같은 폴더를
> 임의로 걸러낼 수 있으므로, 업로드할 때 **숨김 파일이라고 빼놓지 마세요.**
> macOS Finder에서는 `⌘ + Shift + .` 로 숨김 파일을 보이게 할 수 있습니다.

---

## 참고

- **주소를 바꾸고 싶다면** 리포지토리 이름을 바꾸면 됩니다.
  `databetter25.github.io` 라는 이름으로 만들면 `https://databetter25.github.io/` 최상단이 됩니다.
- **비공개로 두고 싶다면** GitHub Pages 대신 파일을 그대로 나눠 주고
  `python3 -m http.server` 로 열게 하는 방법이 있습니다. 인터넷 없이도 전 기능이 동작합니다.
- **학생에게 링크만 주면 됩니다.** 설치할 것도, 로그인할 것도 없습니다.
