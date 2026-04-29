#!/usr/bin/env bash
# =============================================================================
# TRAVIS Hetzner Bootstrap Script (v1)
# -----------------------------------------------------------------------------
# Purpose : Initial hardening of a fresh Hetzner Cloud Ubuntu 24.04 LTS server
#           for the TRAVIS Linux worker (M1.7 Step 0 / Substep 0.2).
# Target  : Ubuntu 24.04 LTS (Noble) — CPX22 (2 vCPU AMD / 4GB / 80GB / Nuremberg DE)
#           (2026-04-30 라인업 갱신 반영: 당초 결정 CPX21 / Falkenstein 이
#            Hetzner 단종·일시 포화로 자연 대체. CPX21 / Falkenstein 또는
#            Plan B (Contabo VPS S Nuremberg) 모두 Ubuntu 24.04 LTS 만
#            보장되면 본 스크립트 그대로 호환.)
# Created : 2026-04-30
# Author  : TRAVIS backend-infra-specialist (Claude Code)
# Aligns  : docs/task-record/M1.7-step0-hetzner-migration.md §Substep 0.2 §📋
#
# What this script does (all idempotent — safe to re-run):
#   1) System update           : apt update && upgrade (non-interactive)
#   2) Install packages        : ufw, fail2ban, unattended-upgrades, curl, git,
#                                htop, ca-certificates
#   3) Firewall (ufw)          : default deny incoming, allow 22/tcp, enable
#   4) fail2ban                : sshd jail (maxretry=5, bantime=3600, findtime=600)
#   5) Auto security upgrades  : unattended-upgrades enable (20auto-upgrades)
#   6) non-root user `travis`  : sudo group, copy root's authorized_keys
#   7) SSH hardening (drop-in) : PermitRootLogin=prohibit-password,
#                                PasswordAuthentication=no
#   8) Timezone                : UTC (worker log consistency)
#
# Lockout safety guarantees:
#   - PermitRootLogin is set to `prohibit-password` (NOT `no`) — root with the
#     SSH key still works. Full disablement is left for the user to do manually
#     AFTER verifying travis@<IP> SSH access.
#   - ufw rule for 22/tcp is added BEFORE `ufw enable`.
#   - The travis user gets the same authorized_keys as root, so the same
#     ed25519 key (travis_hetzner) works for both accounts.
#   - Script aborts immediately on any error (set -euo pipefail).
#
# Usage (run as root, in the fresh Hetzner server):
#   cd /tmp
#   curl -fsSL https://raw.githubusercontent.com/dai-juju/TRAVIS-world/main/apps/worker/deploy/hetzner-bootstrap.sh -o bootstrap.sh
#   chmod +x bootstrap.sh
#   ./bootstrap.sh
#
# After the script finishes, DO NOT close the root SSH session until you have
# verified that `ssh travis@<IP>` works in a separate terminal.
# =============================================================================

set -euo pipefail

# 비대화형 apt/dpkg 환경 (prompt 회피)
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# ----- 출력 헬퍼 (비전공자 친화 진행 표시) -----------------------------------
TOTAL_STEPS=8
section() {
  # $1 = step number, $2 = title
  echo ""
  echo "------------------------------------------------------------"
  echo "[${1}/${TOTAL_STEPS}] ${2}"
  echo "------------------------------------------------------------"
}
ok()   { echo "  ✅ ${1}"; }
warn() { echo "  ⚠️  ${1}"; }
fail() { echo "  ❌ ${1}"; }

# 어떤 섹션에서 실패했는지 표시 (set -e 와 함께 동작)
CURRENT_SECTION="(initialization)"
on_error() {
  local exit_code=$?
  echo ""
  echo "============================================================"
  fail "Bootstrap FAILED in section: ${CURRENT_SECTION}"
  echo "    Exit code: ${exit_code}"
  echo "    Last command may have left the system partially configured."
  echo "    You can safely re-run this script (idempotent), or recreate"
  echo "    the Hetzner instance from Console (€0.02 per attempt)."
  echo "============================================================"
  exit "${exit_code}"
}
trap on_error ERR

# ----- 시작 배너 -------------------------------------------------------------
echo "============================================================"
echo "=== TRAVIS Hetzner Bootstrap (v1) ==="
echo "    Target: Ubuntu 24.04 LTS / CPX22 / Nuremberg"
echo "    Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# ----- root 확인 (사전 게이트) -----------------------------------------------
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  fail "This script must be run as root."
  echo "    Hint: ssh -i ~/.ssh/travis_hetzner root@<IP>  →  ./bootstrap.sh"
  exit 1
fi

# OS 가 Ubuntu 24.04 인지 가벼운 sanity check (실패해도 abort 하지는 않음)
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
    warn "Detected ${ID:-unknown} ${VERSION_ID:-unknown} (expected ubuntu 24.04)."
    warn "Proceeding anyway, but compatibility is not guaranteed."
  fi
fi

# =============================================================================
# [1/8] 시스템 최신화
# =============================================================================
CURRENT_SECTION="1/8 System update"
section 1 "System update (apt update && apt upgrade)"
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
ok "System packages up to date."

# =============================================================================
# [2/8] 필수 패키지 설치
# =============================================================================
CURRENT_SECTION="2/8 Install packages"
section 2 "Install packages (ufw, fail2ban, unattended-upgrades, curl, git, htop, ca-certificates)"
apt-get install -y \
  ufw \
  fail2ban \
  unattended-upgrades \
  curl \
  git \
  htop \
  ca-certificates
ok "Required packages installed."

# =============================================================================
# [3/8] 방화벽 (ufw)  — SSH 22/tcp 룰 사전 추가 후 enable (락아웃 방지)
# =============================================================================
CURRENT_SECTION="3/8 Configure ufw firewall"
section 3 "Configure ufw firewall (deny incoming, allow 22/tcp, enable)"
ufw --force reset >/dev/null   # 멱등성: 기존 룰 깨끗이 비우고 다시 구성
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'OpenSSH'
ufw --force enable
ok "ufw is active. Status:"
ufw status verbose | sed 's/^/    /'

# =============================================================================
# [4/8] fail2ban (sshd jail)
# =============================================================================
CURRENT_SECTION="4/8 Enable fail2ban"
section 4 "Enable fail2ban (sshd jail: maxretry=5, bantime=3600s, findtime=600s)"
# 기존 jail.local 이 있으면 백업 후 덮어쓰기 (멱등성 + 추적성)
JAIL_LOCAL="/etc/fail2ban/jail.local"
if [ -f "${JAIL_LOCAL}" ]; then
  cp -f "${JAIL_LOCAL}" "${JAIL_LOCAL}.bak.$(date -u +%Y%m%d%H%M%S)"
fi
cat > "${JAIL_LOCAL}" <<'EOF'
# TRAVIS Hetzner bootstrap — sshd jail
# Reference: docs/task-record/M1.7-step0-hetzner-migration.md §Substep 0.2
[DEFAULT]
# 동일 IP 가 findtime 안에 maxretry 회 실패하면 bantime 초만큼 차단
findtime = 600
maxretry = 5
bantime  = 3600
backend  = systemd

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable --now fail2ban
# 잠깐 기다렸다가 jail status 확인 (시작 시 약간 지연될 수 있음)
sleep 1
if fail2ban-client status sshd >/dev/null 2>&1; then
  ok "fail2ban sshd jail active."
else
  warn "fail2ban started, but sshd jail status check failed. Run 'fail2ban-client status sshd' to inspect."
fi

# =============================================================================
# [5/8] unattended-upgrades (자동 보안 패치)
# =============================================================================
CURRENT_SECTION="5/8 Enable unattended-upgrades"
section 5 "Enable unattended-upgrades (auto security patches)"
# /etc/apt/apt.conf.d/20auto-upgrades 직접 작성 — dpkg-reconfigure 의 비대화형 결과와 동일
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
ok "unattended-upgrades enabled (daily security patches)."

# =============================================================================
# [6/8] non-root user `travis` 생성 + SSH 키 복사
# =============================================================================
CURRENT_SECTION="6/8 Create non-root user 'travis'"
section 6 "Create non-root user 'travis' (sudo group, copy authorized_keys)"
if id -u travis >/dev/null 2>&1; then
  ok "User 'travis' already exists (skip useradd)."
else
  useradd -m -s /bin/bash travis
  ok "User 'travis' created."
fi

# sudo 그룹 (NOPASSWD 는 부여 X — 기본 보안 유지)
usermod -aG sudo travis
ok "User 'travis' added to sudo group (password required for sudo)."

# 비밀번호 자체를 잠가둔다 (key-only 로그인 강제). 이미 잠겨있어도 문제 없음.
passwd -l travis >/dev/null 2>&1 || true

# ~/.ssh 준비
TRAVIS_SSH_DIR="/home/travis/.ssh"
mkdir -p "${TRAVIS_SSH_DIR}"
chmod 700 "${TRAVIS_SSH_DIR}"

# root 의 authorized_keys 를 travis 로 복사 (없으면 즉시 실패)
ROOT_AUTH="/root/.ssh/authorized_keys"
TRAVIS_AUTH="${TRAVIS_SSH_DIR}/authorized_keys"
if [ ! -s "${ROOT_AUTH}" ]; then
  fail "/root/.ssh/authorized_keys is missing or empty."
  echo "    Cannot copy SSH key to travis — that would lock you out after SSH hardening."
  echo "    Did you create the Hetzner instance with the 'travis_hetzner' SSH key selected?"
  exit 1
fi
cp -f "${ROOT_AUTH}" "${TRAVIS_AUTH}"
chmod 600 "${TRAVIS_AUTH}"
chown -R travis:travis "${TRAVIS_SSH_DIR}"
ok "SSH key copied to /home/travis/.ssh/authorized_keys (chmod 600, owner travis:travis)."

# =============================================================================
# [7/8] SSH hardening (drop-in)  — root 키 접속은 유지, 비밀번호 로그인 차단
# =============================================================================
CURRENT_SECTION="7/8 SSH hardening (drop-in config)"
section 7 "SSH hardening (drop-in /etc/ssh/sshd_config.d/99-travis-hardening.conf)"
SSHD_DROPIN="/etc/ssh/sshd_config.d/99-travis-hardening.conf"
cat > "${SSHD_DROPIN}" <<'EOF'
# TRAVIS Hetzner bootstrap — SSH hardening (drop-in)
# 본 스크립트는 락아웃 방지를 위해 PermitRootLogin = prohibit-password 까지만 적용.
# 사용자가 travis@<IP> 접속을 검증한 뒤, 이 파일에서 PermitRootLogin no 로 수동 변경 권장.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
chmod 644 "${SSHD_DROPIN}"

# sshd config 문법 검사 후 reload (실패 시 abort — 잘못된 config 로 재시작되어 락아웃 방지)
if sshd -t; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  ok "sshd reloaded with hardened drop-in config."
else
  fail "sshd config validation failed. Removing drop-in to keep SSH usable."
  rm -f "${SSHD_DROPIN}"
  exit 1
fi

# =============================================================================
# [8/8] Timezone
# =============================================================================
CURRENT_SECTION="8/8 Set timezone"
section 8 "Set timezone (UTC for worker log consistency)"
timedatectl set-timezone UTC
ok "Timezone set to $(timedatectl show -p Timezone --value)."

# =============================================================================
# 완료 메시지
# =============================================================================
CURRENT_SECTION="(post-completion)"
echo ""
echo "====================================================="
echo "✅ Bootstrap complete."
echo ""
echo "Next steps (run from your local Windows PowerShell):"
echo ""
echo "  1. Verify travis user SSH access:"
echo "     ssh -i \$env:USERPROFILE\\.ssh\\travis_hetzner travis@<IP>"
echo ""
echo "  2. If step 1 succeeds, you may close this root session."
echo ""
echo "  3. Proceed to Substep 0.3 (Node 22 + pnpm + repo clone)."
echo ""
echo "⚠️  DO NOT close this root session until you confirm step 1 works,"
echo "    otherwise you may lock yourself out."
echo "====================================================="
echo ""
echo "❗ Verify travis@<IP> SSH access BEFORE closing this root session"
