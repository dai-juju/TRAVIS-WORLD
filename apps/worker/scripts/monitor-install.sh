#!/bin/bash
# =============================================================================
# TRAVIS Worker — 모니터링 시스템 설치 자동화 스크립트
# =============================================================================
# 작성일: 2026-04-30 (M1.7 Step 0 Substep 0.5)
# 목적: 4개 파일 (monitor.sh, .service, .timer) 를 1줄로 활성화.
#       사용자가 개별 명령 외울 필요 없도록 통합.
#
# -----------------------------------------------------------------------------
# 비전공자용 설명
# -----------------------------------------------------------------------------
# - 이 스크립트 한 줄이면 자동 모니터링 시스템 가동.
# - 실행 방법:
#     sudo bash /opt/travis/apps/worker/scripts/monitor-install.sh
# - 종료 시 다음 실행 시각이 자동 출력됨.
# - 안전: 모든 단계 set -e 로 fail-fast. 어디서 실패했는지 즉시 보임.
# =============================================================================

set -euo pipefail

REPO_ROOT="/opt/travis"
WORKER_DEPLOY="${REPO_ROOT}/apps/worker/deploy"
WORKER_SCRIPTS="${REPO_ROOT}/apps/worker/scripts"
LOG_DIR="/var/log/travis-monitor"
SYSTEMD_DIR="/etc/systemd/system"

echo "============================================================"
echo "TRAVIS Monitor Install"
echo "============================================================"

# 1) 로그 디렉토리 생성 + travis 소유로 권한 설정
echo "[1/6] Creating log directory: ${LOG_DIR}"
mkdir -p "${LOG_DIR}"
chown travis:travis "${LOG_DIR}"
chmod 755 "${LOG_DIR}"

# 2) monitor.sh 실행 권한
echo "[2/6] Setting executable permission on monitor.sh"
chmod +x "${WORKER_SCRIPTS}/monitor.sh"

# 3) systemd unit 파일 복사
echo "[3/6] Copying systemd unit files to ${SYSTEMD_DIR}"
cp "${WORKER_DEPLOY}/travis-monitor.service" "${SYSTEMD_DIR}/travis-monitor.service"
cp "${WORKER_DEPLOY}/travis-monitor.timer" "${SYSTEMD_DIR}/travis-monitor.timer"
chmod 644 "${SYSTEMD_DIR}/travis-monitor.service" "${SYSTEMD_DIR}/travis-monitor.timer"

# 4) systemd reload
echo "[4/6] Reloading systemd daemon"
systemctl daemon-reload

# 5) timer enable + start
echo "[5/6] Enabling and starting timer"
systemctl enable --now travis-monitor.timer

# 6) 검증 출력
echo "[6/6] Verifying"
systemctl is-active travis-monitor.timer || { echo "ERROR: timer not active"; exit 1; }

echo
echo "============================================================"
echo "OK Travis monitor enabled"
echo "============================================================"
echo
echo "다음 실행 시각:"
systemctl list-timers travis-monitor.timer --no-pager | head -3
echo
echo "즉시 1회 수동 테스트 실행 (선택):"
echo "  sudo systemctl start travis-monitor.service"
echo
echo "결과 확인:"
echo "  ls -la ${LOG_DIR}/"
echo "  cat ${LOG_DIR}/\$(date -u '+%Y-%m-%d-%H').log"
echo
echo "24h 후 모든 결과 한 번에 보기:"
echo "  for f in ${LOG_DIR}/*.log; do echo \"=== \$f ===\"; cat \"\$f\"; done | less"
echo
