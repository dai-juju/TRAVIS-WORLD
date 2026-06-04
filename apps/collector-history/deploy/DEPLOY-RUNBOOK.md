# Collector-History 배포 런북 (M1.9 Step 3-A / USDM-only)

> **목적**: raw Ubuntu 24.04 서버를 **2번째 Hetzner 서버(별도 IP)** 로 받은 상태에서,
> `apps/collector-history` forward-fill 수집기를 **USDM-only** 로 가동(systemd 24/7)하기까지의 단일 문서.
>
> **작성일**: 2026-06-04 (M1.9 Step 3-A)
> **대상**: Ubuntu 24.04 LTS / 별도 Primary IPv4 / TRAVIS history forward-fill 수집기
> **단일 진실 배경**: `docs/task-record/M1.9-step2-forward-fill.md` §"Step 3 인계" + `docs/ROADMAP.md §M1.9 Step 3`

---

## 비전공자용 설명 (왜 이걸 하나)

- **forward-fill 수집기란?** M1.8.5 가 채워둔 "과거 14일 차트 데이터" 가 2026-05-31 에 멈췄습니다.
  이 수집기는 멈춘 지점부터 **새 봉(캔들)을 계속 이어 채우는** 24시간 백그라운드 일꾼입니다.
  ("가게 재고를 매일 조금씩 다시 채워 넣는 알바" 라고 보면 됩니다.)
- **왜 별도 서버(별도 IP)?** 1번 서버(production worker)와 **같은 IP** 로 이 수집을 돌리면,
  Binance 의 `/futures/data` 전용 요청 한도(IP당 5분에 1000건)가 합산되어 넘쳐 **-1003 (IP 차단)** 을 맞습니다.
  이건 M1.8.5 에서 실제로 당한 사고입니다. 그래서 **반드시 다른 IP 의 별도 서버** 에서 돌립니다.
- **왜 USDM 만 먼저?** 안전하게 USDM(달러마진 선물)만 2~3일 검증한 뒤, 다음 세션에서 COINM(코인마진)을 켭니다.
  이 런북에서는 COINM 을 **켜지 않습니다** (`FORWARD_FILL_COINM` 미설정).

---

## ⚠️ 사전 전제 (배포 전 반드시 충족)

| 전제 | 확인 방법 |
|------|-----------|
| Ubuntu 24.04 LTS | Step ② 의 runtime-setup 이 자동 검사(불일치 시 abort) |
| **별도 Primary IPv4** (1번 서버와 다른 IP) | **Step 0 에서 검증** (아래) — 같으면 ban 위험, 배포 중단 |
| SSH 키 `travis_hetzner` 가 서버 생성 시 등록됨 | `ssh -i ... root@<SERVER_IP>` 접속 가능 |
| Supabase 프로젝트 = 1번 worker 와 동일 | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 동일 값 사용 (Step ③) |

> 이 런북 전체에서 `<SERVER_IP>` 는 **2번째 서버의 IP** 로 치환하세요.
> SSH 키 경로는 1번 서버와 동일한 `travis_hetzner` 를 가정합니다(다르면 `-i` 경로만 교체).

---

## Step 0 — 별도 IP 검증 (가장 먼저, 전제 붕괴 방지)

**무엇을/왜**: 2번째 서버의 IP 가 1번 worker 서버와 **다른지** 먼저 확인합니다.
같으면 Binance `/futures/data` IP quota 가 합산되어 -1003 ban → Step 3 전제 자체가 무너집니다.

```powershell
# (로컬 PowerShell) 두 서버의 공인 IP 를 각각 출력 — 두 값이 달라야 함
ssh -i $env:USERPROFILE\.ssh\travis_hetzner root@<WORKER_IP> "curl -s https://api.ipify.org; echo"
ssh -i $env:USERPROFILE\.ssh\travis_hetzner root@<SERVER_IP> "curl -s https://api.ipify.org; echo"
```

**성공 판정**: 두 명령의 출력 IP 가 **서로 다름**. (Hetzner Cloud Console 의 Primary IPv4 와도 일치하는지 교차 확인 권장.)
**실패 시**: 같은 IP 이면 **즉시 중단**. 2번째 서버가 별도 Primary IPv4 를 갖도록 재확인 후 재개.

---

## Step ① — bootstrap (서버 하드닝 + travis 유저)

**무엇을/왜**: 방화벽(ufw)·fail2ban·자동보안패치·non-root `travis` 유저·SSH 하드닝·UTC 타임존을 한 번에 설정합니다.
**worker 스크립트 재사용** — 1번 서버와 100% 동일한 `apps/worker/deploy/hetzner-bootstrap.sh` 를 그대로 씁니다(collector 전용 차이 없음).

```bash
# (서버 root SSH 세션) — ssh -i $env:USERPROFILE\.ssh\travis_hetzner root@<SERVER_IP>
cd /tmp
curl -fsSL https://raw.githubusercontent.com/dai-juju/TRAVIS-world/main/apps/worker/deploy/hetzner-bootstrap.sh -o bootstrap.sh
chmod +x bootstrap.sh
./bootstrap.sh
```

**성공 판정**: 마지막에 `✅ Bootstrap complete.` 출력 + `[8/8] Set timezone` 까지 ✅.

> 🔒 **SSH 락아웃 방지 (필수)**: bootstrap 이 끝나도 **이 root 세션을 닫지 마세요.**
> **별도의 새 터미널** 에서 아래 travis 접속이 성공하는 것을 확인한 뒤에만 root 세션을 닫습니다.
> (bootstrap 은 `PermitRootLogin prohibit-password` 까지만 적용 — travis 키 접속 검증 전 root 를 잠그지 않음.)

```powershell
# (로컬 PowerShell, 새 터미널) travis 유저 접속 검증
ssh -i $env:USERPROFILE\.ssh\travis_hetzner travis@<SERVER_IP> "whoami"
```

**성공 판정**: `travis` 출력. 성공하면 root 세션을 닫아도 안전.

---

## Step ② — runtime-setup (Node 22 + pnpm 9 + repo clone + 의존성)

**무엇을/왜**: Node.js 22 + pnpm 9 설치 → repo 를 `/opt/travis` 로 clone → `/etc/travis` 디렉토리 생성 →
workspace 전체 `pnpm install`. collector 의 `node_modules/.bin/tsx` 도 이 단계에서 함께 hoist 됩니다.
**worker 스크립트 재사용** — `apps/worker/deploy/hetzner-runtime-setup.sh` 그대로(monorepo 전체 install 이라 collector 도 포함).

```bash
# (서버 root SSH 세션)
cd /tmp
curl -fsSL https://raw.githubusercontent.com/dai-juju/TRAVIS-world/main/apps/worker/deploy/hetzner-runtime-setup.sh -o runtime-setup.sh
chmod +x runtime-setup.sh
./runtime-setup.sh
```

**성공 판정**: 마지막에 `✅ Runtime setup complete.` + Node `v22.x` / pnpm `9.x` 출력.

> ⚠️ **worker 와의 차이 #1 — env 파일 안내가 다름**: runtime-setup 의 "Next steps" 는 `worker.env` 를 안내하지만,
> **collector 는 `worker.env` 가 아니라 `/etc/travis/collector.env` 를 올립니다(Step ③).** "Next steps" 의 worker.env 문구는 무시하세요.

**collector tsx hoist 검증** (worker 와의 차이 #4 — ExecStart 경로가 collector 디렉토리인지 사전 확인):

```bash
# (서버 root 또는 travis) collector 워크스페이스에 tsx 가 hoist 됐는지 확인
ls -la /opt/travis/apps/collector-history/node_modules/.bin/tsx
```

**성공 판정**: 파일이 존재(symlink). 이 경로가 systemd unit 의 `ExecStart` 와 일치합니다.
**실패 시**: 없으면 `sudo -u travis -i bash -lc 'cd /opt/travis && pnpm install --frozen-lockfile'` 재실행.

---

## Step ③ — collector.env 작성 · scp · chmod (worker 와의 핵심 차이)

**무엇을/왜**: 수집기가 Supabase 에 쓸 인증값(service_role 키)을 담은 환경파일을 만들고 서버로 안전하게 올립니다.
**service_role 키는 1번 worker 와 동일 값** 을 씁니다 — 같은 Supabase 프로젝트이고, service_role 은 RLS 를 우회하는
서버 전용 키라 동일 프로젝트면 같은 키가 정상입니다(키는 프로젝트 단위, 서버 단위가 아님).

> ⚠️ **worker 와의 차이 #1 (재확인)**: 파일명·경로가 `worker.env` 가 아니라 **`/etc/travis/collector.env`** 입니다.
> **USDM-only 명시**: `FORWARD_FILL_COINM` 을 **넣지 않습니다**. COINM 은 다음 세션 `[8-31]` 합산 req/min 재확인 후.

```powershell
# (로컬 PowerShell) 템플릿 복사 후 값 채우기
cd C:\TRAVIS-world\apps\collector-history\deploy
Copy-Item collector.env.example collector.env
notepad collector.env
#   → SUPABASE_URL = (1번 worker 와 동일)
#   → SUPABASE_SERVICE_ROLE_KEY = (1번 worker 와 동일, service_role secret)
#   → FORWARD_FILL_COINM 은 추가하지 말 것 (USDM-only)
#   → FORWARD_FILL_REQ_PER_MIN 은 주석 그대로 둠 (코드 기본값 150 사용)
```

```powershell
# (로컬 PowerShell) 서버로 업로드
scp -i $env:USERPROFILE\.ssh\travis_hetzner collector.env root@<SERVER_IP>:/etc/travis/collector.env
```

```bash
# (서버 root) 권한 설정 — root 만 write, travis 그룹만 read (0640)
chown root:travis /etc/travis/collector.env && chmod 0640 /etc/travis/collector.env
ls -la /etc/travis/collector.env
```

**성공 판정**: `-rw-r----- 1 root travis` 권한으로 표시.
**중요**: 로컬의 `collector.env` 는 git 에 commit 금지(`.gitignore` 가 `.env*` 차단하지만 수동 확인).

---

## Step ④ — systemd unit scp · daemon-reload (worker 와 별개 서비스)

**무엇을/왜**: 수집기를 "서버 재부팅 후 자동 시작 + 죽으면 자동 재시작" 되는 시스템 서비스로 등록합니다.
**worker 와의 차이 #2**: 별도 unit `travis-collector-history.service`(EnvironmentFile=`/etc/travis/collector.env`,
WorkingDirectory=`/opt/travis/apps/collector-history`, MemoryMax=1G — WS 연결이 없어 worker 3G 보다 낮음).

```powershell
# (로컬 PowerShell) unit 파일 업로드
scp -i $env:USERPROFILE\.ssh\travis_hetzner `
  C:\TRAVIS-world\apps\collector-history\deploy\travis-collector-history.service `
  root@<SERVER_IP>:/tmp/
```

```bash
# (서버 root) system 디렉토리로 복사 + 권한 + reload
sudo cp /tmp/travis-collector-history.service /etc/systemd/system/travis-collector-history.service
sudo chmod 644 /etc/systemd/system/travis-collector-history.service
sudo systemctl daemon-reload
```

**성공 판정**: 에러 없이 프롬프트 복귀. `systemctl cat travis-collector-history` 로 내용 확인 가능.

---

## Step ⑤ — enable --now (서비스 활성화 + 즉시 시작)

**무엇을/왜**: 부팅 자동시작 등록 + 지금 바로 가동.

```bash
# (서버 root)
sudo systemctl enable --now travis-collector-history
systemctl status travis-collector-history --no-pager
```

**성공 판정**: `Active: active (running)` 표시.
**실패 시**: `Active: failed` 또는 즉시 재시작 반복이면 Step ⑥ 로그로 원인 파악
(흔한 원인: `/etc/travis/collector.env` 누락·권한 / tsx 경로 불일치).

---

## Step ⑥ — journalctl 첫 cycle 확인 (수집기가 실제로 도는지)

**무엇을/왜**: 부팅 로그와 첫 forward-fill cycle 이 정상인지 실시간 확인합니다.

```bash
# (서버 root) 최근 로그 + 실시간 follow
journalctl -u travis-collector-history -n 80 --no-pager
journalctl -u travis-collector-history -f
```

**성공 판정 (순서대로 보여야 함)**:
1. `[collector-history] TRAVIS forward-fill 수집기 부팅...`
2. `[collector-history] 심볼 로드: futures_usdm=<숫자>` (수백 개; 0 이면 Supabase 연결 의심)
3. `[collector-history] forward-fill markets=[futures_usdm] tasks=3` ← **반드시 `[futures_usdm]` 단독 + `tasks=3`** (COINM 꺼짐 확인)
4. `[collector-history] 정상 부팅 완료`
5. 수 분 내 `[forwardFill:usdm-short] 5m ✓ rows=<숫자> failed=0 ...` 류의 cycle 성공 로그

**경고 신호**: `failed=` 가 계속 0 보다 크거나, `예외(graceful...)` 가 반복되면 IP ban(-1003) 또는 env 문제.
`journalctl` 에서 `-1003` / `banned` 문자열 검색:
```bash
journalctl -u travis-collector-history --no-pager | grep -iE "1003|banned|429" | tail -20
```
**성공 판정**: 위 grep 결과가 **비어 있음**(ban 없음).

---

## Step ⑦ — 신규 INSERT 확인 (DB 에 새 봉이 실제로 들어가는지) — G1 검증

**무엇을/왜**: 수집기가 멈춰있던 지점(2026-05-31) **이후의 새 row** 를 실제로 Supabase 에 쓰고 있는지 SQL 로 확인합니다.
첫 cycle(short 그룹)이 한 바퀴 돈 뒤(~수 분), Supabase Dashboard → SQL Editor 에서 실행:

```sql
SELECT interval, count(*) AS new_rows, max(recorded_at) AS newest
FROM history_futures_indicator
WHERE market_type='futures_usdm' AND recorded_at > '2026-05-31 12:05:00+00'
GROUP BY interval ORDER BY interval;
```

**성공 판정**:
- `new_rows` 가 5m/15m/30m 부터 0 보다 큼(첫 cycle 은 단기 그룹부터).
- `newest` 가 **현재 시각에 가까운 최근 시각**(2026-05-31 보다 한참 이후).
- mid/long 그룹은 휴식 주기(~1h / ~12h)가 길어 잠시 뒤 채워짐 — 단기부터 확인되면 정상.

**멱등성 재확인(권장)**: 수 분 뒤 같은 SQL 을 다시 실행 — `new_rows` 가 폭증하지 않고 자연 증가만 함
(자연키 5축 onConflict + lookback 2봉 재수집이 중복을 흡수). 중복 폭증이면 onConflict 키 의심.

---

## 검증 요약 (Step 3-A 완료 게이트)

| # | 검증 | 통과 기준 |
|---|------|-----------|
| 0 | 별도 IP | 2번째 서버 IP ≠ 1번 worker IP |
| G1 | 신규 INSERT | 위 SQL 의 `new_rows>0` + `newest` 최근 |
| - | ban 없음 | journalctl 에 `-1003`/`banned`/`429` 미검출 |
| - | USDM-only | 부팅 로그 `markets=[futures_usdm] tasks=3` |
| - | service active | `systemctl status` = `active (running)` |

> **24~48h 후속(이 세션 범위 밖)**: site=DB 대조(5m~1h 봉을 Binance USDM 사이트와 비교) + 첫 1d 봉 1개 확인.
> **다음 세션**: `[8-31]` COINM 합산 req/min 재확인 후 `FORWARD_FILL_COINM=1` 추가 → COINM ON.

---

## 롤백 (1줄)

```bash
sudo systemctl disable --now travis-collector-history   # 즉시 정지 + 부팅 자동시작 해제 (데이터 손실 없음, reversible)
```
