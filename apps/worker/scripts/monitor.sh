#!/bin/bash
# =============================================================================
# TRAVIS Worker — 자동 모니터링 스크립트 (6시간 주기)
# =============================================================================
# 작성일: 2026-04-30 (M1.7 Step 0 Substep 0.5)
# 목적: 24h Hetzner 안정성 검증을 위해 사용자가 매번 수동 점검할 필요 없도록
#       6시간마다 systemd timer 가 호출하여 7가지 metric 을 자동 수집/dump.
#
# -----------------------------------------------------------------------------
# 비전공자용 설명
# -----------------------------------------------------------------------------
# - 이 스크립트는 "자동 건강검진" 도구. 6h 마다 한 번씩 자동 실행되어
#   /var/log/travis-monitor/<날짜시간>.log 파일에 결과를 저장.
# - 24h 후에 사용자는 4개 파일 (00시/06시/12시/18시) 만 열어보면 됨.
# - 각 metric 은 [OK] / [WARN] / [HIGH] 라벨이 자동으로 붙어 30초 내 판독 가능.
#
# -----------------------------------------------------------------------------
# 임계값 정의 근거 (backend-infra-specialist 합리적 추정)
# -----------------------------------------------------------------------------
# - Errors (6h):
#     OK ≤ 100 / WARN 101~300 / HIGH > 300
#     근거: 워밍업 + Binance 일시 흔들림 정상 범위. 분당 1건 미만 = OK.
# - Restarts (since boot):
#     OK ≤ 2 / WARN 3~5 / HIGH > 5
#     근거: 정상 운영 시 0~1회. 5회 초과 = rapid-fail 의심.
# - USDM stale events (6h) ⭐ 핵심:
#     OK ≤ 20 / WARN 21~80 / HIGH > 80
#     근거: Windows 환경에선 분당 1회+ 발생. Linux Hetzner 환경에서 빈도 측정 목적.
# - WS reconnects (6h):
#     OK ≤ 30 / WARN 31~100 / HIGH > 100
# - Memory (current MB):
#     OK ≤ 1500 / WARN 1501~2500 / HIGH > 2500 (한도 3072 = MemoryMax 3G)
# - batchPerSymbol fail rate:
#     OK ≤ 5 / WARN 6~30 / HIGH > 30 (per 6h)
# - Supabase staleness (max age in seconds):
#     OK ≤ 60s / WARN 61~300s / HIGH > 300s
#     근거: now_*_ticker 는 매초~분 갱신되어야 정상.
#
# -----------------------------------------------------------------------------
# 7가지 metric 수집 항목
# -----------------------------------------------------------------------------
# 1. journalctl error/fail/warn count (지난 6h)
# 2. systemctl NRestarts (since boot 누적)
# 3. Memory / CPU 현재 값
# 4. ⭐ USDM stale event count (`stale 감지` 로그 grep)
# 5. ⭐ WS reconnect event count (`재연결 예약` 로그 grep)
# 6. batchPerSymbol fail rate (`fail=` 패턴 grep)
# 7. Supabase staleness — now_spot_ticker / now_futures_ticker MAX(now() - updated_at)
#
# -----------------------------------------------------------------------------
# 실행 환경
# -----------------------------------------------------------------------------
# - User: travis (worker.env 의 root:travis 0640 read 가능)
# - Cwd: /opt/travis/apps/worker (불필요 — 절대경로만 사용)
# - 호출자: travis-monitor.timer (6h 주기) 또는 수동 (`systemctl start travis-monitor`)
# =============================================================================

set -uo pipefail
# set -e 는 일부러 OFF — metric 1개 실패해도 나머지는 dump 되어야 함 (graceful)

# -----------------------------------------------------------------------------
# 환경 준비
# -----------------------------------------------------------------------------
TIMESTAMP="$(date -u '+%Y-%m-%d-%H')"
LOG_DIR="/var/log/travis-monitor"
LOG_FILE="${LOG_DIR}/${TIMESTAMP}.log"
WORKER_ENV="/etc/travis/worker.env"
PERIOD_END="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
PERIOD_START="$(date -u -d '6 hours ago' '+%Y-%m-%d %H:%M:%S UTC')"

mkdir -p "${LOG_DIR}"

# stdout 와 LOG_FILE 양쪽에 동시 기록 (tee)
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "============================================================"
echo "TRAVIS Worker 6h Health Check"
echo "Period: ${PERIOD_START} ~ ${PERIOD_END}"
echo "Hostname: $(hostname)"
echo "============================================================"
echo

# -----------------------------------------------------------------------------
# 임계값 분류 헬퍼 — 숫자 + 3개 임계값 받아 [OK]/[WARN]/[HIGH] 라벨 반환
# -----------------------------------------------------------------------------
classify() {
  local value="$1"
  local ok_max="$2"
  local warn_max="$3"
  if [[ "${value}" =~ ^[0-9]+$ ]]; then
    if (( value <= ok_max )); then
      echo "[OK]"
    elif (( value <= warn_max )); then
      echo "[WARN]"
    else
      echo "[HIGH]"
    fi
  else
    echo "[?]"
  fi
}

# -----------------------------------------------------------------------------
# 1. journalctl error/fail/warn count (지난 6h)
# -----------------------------------------------------------------------------
echo "--- [1] journalctl error/warn count (last 6h) ---"
ERRORS=$(journalctl -u travis-worker --since "6 hours ago" --no-pager 2>/dev/null | grep -ciE 'error|fail|exception' || echo 0)
WARNS=$(journalctl -u travis-worker --since "6 hours ago" --no-pager 2>/dev/null | grep -ciE 'warn|warning' || echo 0)
ERR_LABEL=$(classify "${ERRORS}" 100 300)
echo "Errors: ${ERRORS} ${ERR_LABEL}"
echo "Warns:  ${WARNS}"
echo

# -----------------------------------------------------------------------------
# 2. systemctl NRestarts (since boot 누적)
# -----------------------------------------------------------------------------
echo "--- [2] systemd restart count (since boot) ---"
RESTARTS=$(systemctl show travis-worker --property=NRestarts --value 2>/dev/null || echo 0)
RESTARTS="${RESTARTS:-0}"
RESTART_LABEL=$(classify "${RESTARTS}" 2 5)
echo "NRestarts: ${RESTARTS} ${RESTART_LABEL}"
ACTIVE_STATE=$(systemctl show travis-worker --property=ActiveState --value 2>/dev/null || echo "unknown")
SUB_STATE=$(systemctl show travis-worker --property=SubState --value 2>/dev/null || echo "unknown")
echo "ActiveState: ${ACTIVE_STATE} / ${SUB_STATE}"
echo

# -----------------------------------------------------------------------------
# 3. Memory / CPU 현재 값 (systemctl 기반)
# -----------------------------------------------------------------------------
echo "--- [3] Memory / CPU current ---"
# MemoryCurrent 는 byte 단위 — MB 변환
MEM_BYTES=$(systemctl show travis-worker --property=MemoryCurrent --value 2>/dev/null || echo 0)
if [[ "${MEM_BYTES}" =~ ^[0-9]+$ ]] && (( MEM_BYTES > 0 )); then
  MEM_MB=$(( MEM_BYTES / 1024 / 1024 ))
else
  MEM_MB=0
fi
MEM_LABEL=$(classify "${MEM_MB}" 1500 2500)
echo "Memory: ${MEM_MB} MB / 3072 MB ${MEM_LABEL}"

# CPU 사용 시간 (누적 ns) — 단순 정보 표시 (임계값 X)
CPU_NS=$(systemctl show travis-worker --property=CPUUsageNSec --value 2>/dev/null || echo 0)
if [[ "${CPU_NS}" =~ ^[0-9]+$ ]] && (( CPU_NS > 0 )); then
  CPU_SEC=$(( CPU_NS / 1000000000 ))
  echo "CPU usage (cumulative): ${CPU_SEC}s"
fi
echo

# -----------------------------------------------------------------------------
# 4. ⭐ USDM stale event count (지난 6h) — 가장 중요한 metric
# -----------------------------------------------------------------------------
echo "--- [4] USDM stale events (last 6h) ⭐ KEY METRIC ---"
USDM_STALE=$(journalctl -u travis-worker --since "6 hours ago" --no-pager 2>/dev/null | grep -c 'stale 감지' || echo 0)
USDM_LABEL=$(classify "${USDM_STALE}" 20 80)
echo "USDM stale events: ${USDM_STALE} ${USDM_LABEL}"
# 가장 최근 5건 샘플 (디버깅용)
echo "Recent stale samples (latest 5):"
journalctl -u travis-worker --since "6 hours ago" --no-pager 2>/dev/null | grep 'stale 감지' | tail -5 || echo "(none)"
echo

# -----------------------------------------------------------------------------
# 5. ⭐ WS reconnect event count (지난 6h)
# -----------------------------------------------------------------------------
echo "--- [5] WS reconnect events (last 6h) ⭐ ---"
# "재연결 예약" 또는 "강제 재연결" 또는 "connected" 직전의 "closed" 패턴 모두 포착
WS_RECONNECT=$(journalctl -u travis-worker --since "6 hours ago" --no-pager 2>/dev/null | grep -cE '재연결 예약|강제 재연결' || echo 0)
WS_LABEL=$(classify "${WS_RECONNECT}" 30 100)
echo "WS reconnects: ${WS_RECONNECT} ${WS_LABEL}"
echo

# -----------------------------------------------------------------------------
# 6. batchPerSymbol fail rate (지난 6h)
# -----------------------------------------------------------------------------
echo "--- [6] batchPerSymbol fail count (last 6h) ---"
BATCH_FAIL=$(journalctl -u travis-worker --since "6 hours ago" --no-pager 2>/dev/null | grep -cE 'fail=[1-9]' || echo 0)
BATCH_LABEL=$(classify "${BATCH_FAIL}" 5 30)
echo "Batch fail events: ${BATCH_FAIL} ${BATCH_LABEL}"
echo

# -----------------------------------------------------------------------------
# 7. Supabase staleness — now_spot_ticker / now_futures_ticker
# -----------------------------------------------------------------------------
echo "--- [7] Supabase staleness (most recent updated_at) ---"

# worker.env 에서 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 안전하게 읽기
# (export 없이 단순 파싱 — env 파일 syntax 만 추출)
if [[ -r "${WORKER_ENV}" ]]; then
  SUPABASE_URL=$(grep -E '^SUPABASE_URL=' "${WORKER_ENV}" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  SUPABASE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "${WORKER_ENV}" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
else
  echo "WARN: ${WORKER_ENV} not readable by user $(whoami)"
  SUPABASE_URL=""
  SUPABASE_KEY=""
fi

# Supabase REST API 로 가장 최근 updated_at 1건 조회 → bash 에서 시각 차이 계산
check_staleness() {
  local table="$1"
  if [[ -z "${SUPABASE_URL}" || -z "${SUPABASE_KEY}" ]]; then
    echo "${table}: SKIP (env vars missing)"
    return
  fi

  # Supabase REST: 가장 최근 updated_at 1건만 가져옴 (limit=1, order desc)
  local response
  response=$(curl -s --max-time 10 \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    "${SUPABASE_URL}/rest/v1/${table}?select=updated_at&order=updated_at.desc&limit=1" 2>/dev/null || echo "[]")

  # response 예: [{"updated_at":"2026-04-30T17:43:11.123456+00:00"}]
  local latest
  latest=$(echo "${response}" | grep -oE '"updated_at":"[^"]+"' | head -1 | cut -d'"' -f4)

  if [[ -z "${latest}" ]]; then
    echo "${table}: NO_DATA (response: ${response:0:80})"
    return
  fi

  # ISO 8601 → epoch 변환 후 차이 계산
  local latest_epoch now_epoch diff_sec label
  latest_epoch=$(date -u -d "${latest}" '+%s' 2>/dev/null || echo 0)
  now_epoch=$(date -u '+%s')
  if (( latest_epoch == 0 )); then
    echo "${table}: PARSE_ERR (raw: ${latest})"
    return
  fi
  diff_sec=$(( now_epoch - latest_epoch ))
  label=$(classify "${diff_sec}" 60 300)
  echo "${table}: ${diff_sec}s ago ${label} (latest=${latest})"
}

check_staleness "now_spot_ticker"
check_staleness "now_futures_ticker"
echo

# -----------------------------------------------------------------------------
# Worker uptime (참고)
# -----------------------------------------------------------------------------
echo "--- [Info] Worker uptime ---"
ACTIVE_SINCE=$(systemctl show travis-worker --property=ActiveEnterTimestamp --value 2>/dev/null || echo "")
if [[ -n "${ACTIVE_SINCE}" ]]; then
  echo "Active since: ${ACTIVE_SINCE}"
fi
echo

# -----------------------------------------------------------------------------
# === SUMMARY === (사람이 30초 내 판독 가능한 압축 요약)
# -----------------------------------------------------------------------------
echo "============================================================"
echo "=== SUMMARY ==="
echo "============================================================"
echo "- Period:              ${PERIOD_START} ~ ${PERIOD_END}"
echo "- Worker state:        ${ACTIVE_STATE} / ${SUB_STATE}"
echo "- Restarts:            ${RESTARTS} ${RESTART_LABEL}"
echo "- Errors (6h):         ${ERRORS} ${ERR_LABEL}"
echo "- USDM stale events:   ${USDM_STALE} ${USDM_LABEL}  ⭐"
echo "- WS reconnects:       ${WS_RECONNECT} ${WS_LABEL}"
echo "- Batch fails:         ${BATCH_FAIL} ${BATCH_LABEL}"
echo "- Memory:              ${MEM_MB} MB / 3072 MB ${MEM_LABEL}"
echo "- Spot staleness:      $(check_staleness now_spot_ticker | head -1)"
echo "- USDM staleness:      $(check_staleness now_futures_ticker | head -1)"
echo "============================================================"
echo

# -----------------------------------------------------------------------------
# 알림(미래 확장) — Slack/Discord webhook 추가 위치
# -----------------------------------------------------------------------------
# 향후 [HIGH] 라벨 발생 시 알림 보내려면 이 위치에 1줄 추가:
# [[ "${USDM_LABEL}" == "[HIGH]" ]] && curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"USDM stale HIGH: ${USDM_STALE}/6h\"}" "${SLACK_WEBHOOK_URL}"

exit 0
