#!/usr/bin/env bash
# =============================================================================
# TRAVIS Hetzner Runtime Setup Script (v1)
# -----------------------------------------------------------------------------
# Purpose : Install Node.js 22 LTS + pnpm 9 + clone TRAVIS repo + prepare
#           /etc/travis directory for the worker (M1.7 Step 0 / Substep 0.3).
# Target  : Ubuntu 24.04 LTS (Noble) — already hardened by hetzner-bootstrap.sh
#           (Substep 0.2: ufw + fail2ban + non-root user `travis` + SSH).
# Created : 2026-04-30
# Author  : TRAVIS backend-infra-specialist (Claude Code)
# Aligns  : docs/task-record/M1.7-step0-hetzner-migration.md §Substep 0.3 §📋
#
# What this script does (all idempotent — safe to re-run):
#   1) Pre-flight checks       : root, Ubuntu 24.04, travis user exists
#   2) Node.js 22 LTS          : NodeSource repo + apt install + version verify
#   3) pnpm 9                  : corepack enable + prepare (npm fallback if needed)
#   4) Build toolchain         : build-essential + python3 (native node-gyp deps)
#   5) /opt/travis directory   : mkdir + chown travis:travis (clone target)
#   6) Repo clone (public)     : git clone https://github.com/dai-juju/TRAVIS-world
#   7) /etc/travis directory   : mkdir + chown root:travis 0755 (env file home)
#   8) pnpm install            : --frozen-lockfile in /opt/travis (5~10 min)
#
# Idempotency guarantees:
#   - Node/pnpm install steps detect existing versions and skip apt/corepack
#     when the expected major version is already present.
#   - Repo clone detects /opt/travis/.git and skips (with `git pull` hint).
#   - pnpm install with --frozen-lockfile is naturally idempotent.
#   - Script aborts immediately on any error (set -euo pipefail).
#
# Usage (run as root, in the Hetzner server AFTER Substep 0.2 finished):
#   cd /tmp
#   curl -fsSL https://raw.githubusercontent.com/dai-juju/TRAVIS-world/main/apps/worker/deploy/hetzner-runtime-setup.sh -o runtime-setup.sh
#   chmod +x runtime-setup.sh
#   ./runtime-setup.sh
#
# After the script finishes, you still need to upload /etc/travis/worker.env
# (template at apps/worker/deploy/worker.env.example). The script does NOT
# create it — see the "Next steps" section printed at the end.
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
  fail "Runtime setup FAILED in section: ${CURRENT_SECTION}"
  echo "    Exit code: ${exit_code}"
  echo "    Last command may have left the system partially configured."
  echo "    You can safely re-run this script (idempotent)."
  echo "    If the failure is in step [8/8] pnpm install, you can also"
  echo "    re-run only that step manually:"
  echo "        sudo -u travis -i bash -c 'cd /opt/travis && pnpm install --frozen-lockfile'"
  echo "============================================================"
  exit "${exit_code}"
}
trap on_error ERR

# ----- 시작 배너 -------------------------------------------------------------
echo "============================================================"
echo "=== TRAVIS Hetzner Runtime Setup (v1) ==="
echo "    Target: Ubuntu 24.04 LTS / Node 22 / pnpm 9 / /opt/travis"
echo "    Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# =============================================================================
# [1/8] 사전 검증 — root, Ubuntu 24.04, travis user
# =============================================================================
CURRENT_SECTION="1/8 Pre-flight checks"
section 1 "Pre-flight checks (root + Ubuntu 24.04 + travis user)"

# root 확인 (Substep 0.2 동일 가드 패턴)
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  fail "This script must be run as root."
  echo "    Hint: ssh -i ~/.ssh/travis_hetzner root@<IP>  →  ./runtime-setup.sh"
  exit 1
fi
ok "Running as root."

# Ubuntu 24.04 확인 (mismatch 시 abort — Node 22 NodeSource repo 가 OS 버전 의존)
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
    fail "Detected ${ID:-unknown} ${VERSION_ID:-unknown} (expected ubuntu 24.04)."
    echo "    NodeSource setup_22.x targets Ubuntu 24.04 specifically."
    echo "    Recreate the Hetzner instance with Ubuntu 24.04 LTS image."
    exit 1
  fi
  ok "OS: Ubuntu 24.04 LTS confirmed."
else
  fail "/etc/os-release not readable — cannot verify OS version."
  exit 1
fi

# travis user 존재 확인 (Substep 0.2 가 생성했어야 함)
if ! id -u travis >/dev/null 2>&1; then
  fail "User 'travis' does not exist."
  echo "    Did you run hetzner-bootstrap.sh (Substep 0.2) first?"
  echo "    The bootstrap script creates the non-root 'travis' user."
  exit 1
fi
ok "User 'travis' exists (uid=$(id -u travis), gid=$(id -g travis))."

# =============================================================================
# [2/8] Node.js 22 LTS 설치 (NodeSource repo)
# =============================================================================
CURRENT_SECTION="2/8 Install Node.js 22 LTS"
section 2 "Install Node.js 22 LTS (via NodeSource repo)"

# 이미 Node 22 가 깔려있으면 skip — version 검증만 수행
if command -v node >/dev/null 2>&1; then
  EXISTING_NODE_MAJOR="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "${EXISTING_NODE_MAJOR}" = "22" ]; then
    ok "Node.js $(node --version) already installed (skip)."
  else
    warn "Node.js v${EXISTING_NODE_MAJOR}.x detected — replacing with v22.x via NodeSource."
    apt-get remove -y nodejs >/dev/null 2>&1 || true
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
    ok "Node.js $(node --version) installed."
  fi
else
  # NodeSource setup script — apt source 추가 + GPG key + apt update
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  ok "Node.js $(node --version) installed."
fi

# 최종 검증 — 반드시 v22.x 여야 함
NODE_MAJOR="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [ "${NODE_MAJOR}" != "22" ]; then
  fail "Expected Node 22.x but got $(node --version)."
  exit 1
fi
ok "Node.js version verified: $(node --version)."
ok "npm version: $(npm --version)."

# =============================================================================
# [3/8] pnpm 9 설치 (corepack 권장 경로)
# =============================================================================
CURRENT_SECTION="3/8 Install pnpm 9"
section 3 "Install pnpm 9 (via corepack)"

# 이미 pnpm 9 가 활성화돼 있으면 skip
if command -v pnpm >/dev/null 2>&1; then
  EXISTING_PNPM_MAJOR="$(pnpm --version | cut -d. -f1)"
  if [ "${EXISTING_PNPM_MAJOR}" = "9" ]; then
    ok "pnpm $(pnpm --version) already active (skip)."
  else
    warn "pnpm v${EXISTING_PNPM_MAJOR}.x detected — switching to v9 via corepack."
    EXISTING_PNPM_MAJOR=""
  fi
fi

# corepack enable + prepare. 실패하면 npm install -g 로 fallback.
if ! command -v pnpm >/dev/null 2>&1 || [ -z "${EXISTING_PNPM_MAJOR:-}" ]; then
  if corepack enable 2>/dev/null && corepack prepare pnpm@9 --activate 2>/dev/null; then
    ok "pnpm 9 activated via corepack."
  else
    warn "corepack path failed — falling back to 'npm install -g pnpm@9'."
    npm install -g pnpm@9
    ok "pnpm 9 installed via npm global."
  fi
fi

# 최종 검증
PNPM_MAJOR="$(pnpm --version | cut -d. -f1)"
if [ "${PNPM_MAJOR}" != "9" ]; then
  fail "Expected pnpm 9.x but got $(pnpm --version)."
  exit 1
fi
ok "pnpm version verified: $(pnpm --version)."

# =============================================================================
# [4/8] 빌드 툴체인 (native module 컴파일 의존성)
# =============================================================================
CURRENT_SECTION="4/8 Install build toolchain"
section 4 "Install build toolchain (build-essential + python3 for node-gyp)"

# 일부 npm 패키지(better-sqlite3, bufferutil 등)는 native 빌드에 필요
apt-get install -y \
  build-essential \
  python3
ok "build-essential ($(dpkg-query -W -f='${Version}' build-essential 2>/dev/null || echo n/a)) installed."
ok "python3 ($(python3 --version 2>&1 | awk '{print $2}')) installed."

# =============================================================================
# [5/8] /opt/travis 디렉토리 준비 (clone target)
# =============================================================================
CURRENT_SECTION="5/8 Prepare /opt/travis directory"
section 5 "Prepare /opt/travis directory (owned by travis user)"

mkdir -p /opt/travis
chown travis:travis /opt/travis
chmod 755 /opt/travis
ok "/opt/travis ready (owner=travis:travis, perms=0755)."

# =============================================================================
# [6/8] Repo clone (public, https — Deploy Key 불필요)
# =============================================================================
CURRENT_SECTION="6/8 Clone TRAVIS repo"
section 6 "Clone TRAVIS repo (public, https)"

REPO_URL="https://github.com/dai-juju/TRAVIS-world.git"
REPO_DIR="/opt/travis"

# 이미 .git 이 있으면 skip (git pull 안내만)
if [ -d "${REPO_DIR}/.git" ]; then
  ok "Repo already cloned at ${REPO_DIR} (skip)."
  echo "    To update later: sudo -u travis -i bash -c 'cd /opt/travis && git pull'"
else
  # /opt/travis 가 비어있어야 git clone 이 가능 (mkdir 만 한 상태면 OK)
  if [ -n "$(ls -A "${REPO_DIR}" 2>/dev/null)" ]; then
    fail "${REPO_DIR} is not empty but has no .git directory."
    echo "    Manually inspect and remove its contents, then re-run this script."
    exit 1
  fi
  # travis user 로 clone (소유권 깨끗하게 시작)
  sudo -u travis git clone "${REPO_URL}" "${REPO_DIR}"
  ok "Repo cloned to ${REPO_DIR} (HEAD = $(sudo -u travis git -C "${REPO_DIR}" rev-parse --short HEAD))."
fi

# =============================================================================
# [7/8] /etc/travis 디렉토리 준비 (worker.env 가 들어갈 자리)
# =============================================================================
CURRENT_SECTION="7/8 Prepare /etc/travis directory"
section 7 "Prepare /etc/travis directory (worker.env home — upload separately)"

mkdir -p /etc/travis
chown root:travis /etc/travis
chmod 755 /etc/travis
ok "/etc/travis ready (owner=root:travis, perms=0755)."
echo ""
echo "  ℹ️  worker.env is NOT created by this script."
echo "      You must upload it separately via scp from your local machine:"
echo "          1) Copy worker.env.example → worker.env locally and fill values."
echo "          2) scp worker.env root@<IP>:/etc/travis/worker.env"
echo "          3) ssh root@<IP> 'chown root:travis /etc/travis/worker.env && chmod 0640 /etc/travis/worker.env'"
echo "      See: apps/worker/deploy/worker.env.example"

# =============================================================================
# [8/8] pnpm install --frozen-lockfile (모노레포 전체 의존성)
# =============================================================================
CURRENT_SECTION="8/8 pnpm install --frozen-lockfile"
section 8 "pnpm install --frozen-lockfile (this may take 5~10 minutes...)"

# travis 로 실행 — /opt/travis 소유권이 travis 이므로 root 로 실행하면 권한 꼬임
echo "  ⏳ Installing dependencies for the entire pnpm workspace..."
echo "     (CPX22: 2 vCPU / 4GB → expect 5~10 min depending on network)"
sudo -u travis -i bash -lc 'cd /opt/travis && pnpm install --frozen-lockfile'
ok "pnpm install completed."

# 설치 결과 가벼운 검증 — apps/worker 의 node_modules 가 있는지
if [ -d "/opt/travis/apps/worker/node_modules" ] || [ -d "/opt/travis/node_modules" ]; then
  ok "node_modules detected (workspace install successful)."
else
  warn "node_modules not found in expected paths — pnpm install may have hoisted differently."
  warn "Run 'sudo -u travis -i pnpm -C /opt/travis ls --depth 0' to inspect."
fi

# =============================================================================
# 완료 메시지
# =============================================================================
CURRENT_SECTION="(post-completion)"
echo ""
echo "====================================================="
echo "✅ Runtime setup complete."
echo ""
echo "Installed versions:"
echo "    • Node.js : $(node --version)"
echo "    • npm     : $(npm --version)"
echo "    • pnpm    : $(pnpm --version)"
echo "    • git     : $(git --version | awk '{print $3}')"
echo ""
echo "Filesystem layout:"
echo "    • /opt/travis    — TRAVIS repo (owner: travis:travis)"
echo "    • /etc/travis    — env file home (owner: root:travis, 0755)"
echo "                       worker.env NOT yet uploaded (see next steps)."
echo ""
echo "Next steps (run from your local Windows PowerShell):"
echo ""
echo "  1. On your local machine, copy the env template and fill values:"
echo "       cd C:\\TRAVIS-world\\apps\\worker\\deploy"
echo "       cp worker.env.example worker.env"
echo "       notepad worker.env       # fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "  2. Upload worker.env to the server (replace <IP> with this server's IP):"
echo "       scp -i \$env:USERPROFILE\\.ssh\\travis_hetzner worker.env root@<IP>:/etc/travis/worker.env"
echo ""
echo "  3. Set strict permissions on the uploaded file (root-write, travis-read):"
echo "       ssh -i \$env:USERPROFILE\\.ssh\\travis_hetzner root@<IP> \\"
echo "         'chown root:travis /etc/travis/worker.env && chmod 0640 /etc/travis/worker.env'"
echo ""
echo "  4. Smoke test the worker build (TypeScript compile):"
echo "       ssh -i \$env:USERPROFILE\\.ssh\\travis_hetzner travis@<IP> \\"
echo "         'cd /opt/travis && pnpm -F @travis/worker build'"
echo ""
echo "  5. Proceed to Substep 0.4 (systemd unit + worker boot smoke test)."
echo "====================================================="
