#!/usr/bin/env bash
# FLL Sim — set up from a blank Debian/Ubuntu machine (also WSL2 with WSLg) and start it.
#
#   curl -fsSL https://raw.githubusercontent.com/martijas/fll-sim/main/setup.sh | bash
#   or, in a checkout:  ./setup.sh
#
# Installs the system libraries Electron needs (apt, asks for your password once), Node.js 22 and
# pnpm in ~/.local/node (no sudo), gets the code (~/fll-sim unless run inside a checkout),
# installs the dependencies, builds the app, adds an "FLL Sim" launcher to the app menu and
# starts it. Safe to run again: it skips what is already there and updates the code.
#
# Options: --no-launch (don't start the app at the end), --dir <path> (where to put the code).

set -euo pipefail

REPO_URL="https://github.com/martijas/fll-sim.git"
NODE_MAJOR=22
PNPM_VERSION=12.6.0
NODE_HOME="$HOME/.local/node"
LAUNCH=1
DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --no-launch) LAUNCH=0 ;;
    --dir) DIR="$2"; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

step() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Linux ] || die "FLL Sim's setup script is for Linux (Debian/Ubuntu, or WSL2 on Windows)."
command -v apt-get >/dev/null || die "This script needs a Debian/Ubuntu system (apt-get). On other distributions install git, curl, and Electron's libraries (GTK 3, NSS, ALSA, GBM) yourself, then run it again."

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

# ---- 1. system packages ------------------------------------------------------------------------
step "System packages"
PKGS=(git curl ca-certificates xz-utils libgtk-3-0 libnss3 libxss1 libgbm1 libxshmfence1 libdrm2 libasound2 libnotify4 xdg-utils)
installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "ok installed"; }
MISSING=()
for p in "${PKGS[@]}"; do
  # (Ubuntu 24.04+ / Debian 13 renamed some libraries with a "t64" suffix)
  if installed "$p" || installed "${p}t64"; then continue; fi
  if apt-cache show "${p}t64" >/dev/null 2>&1; then MISSING+=("${p}t64"); else MISSING+=("$p"); fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Installing: ${MISSING[*]}"
  $SUDO apt-get update
  $SUDO apt-get install -y "${MISSING[@]}"
else
  echo "All present."
fi

# ---- 2. Node.js + pnpm (in ~/.local/node, no sudo) -------------------------------------------------
step "Node.js $NODE_MAJOR and pnpm"
export PATH="$NODE_HOME/bin:$PATH"
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]; }
if node_ok; then
  echo "Node.js $(node -v) found."
else
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "Unsupported CPU: $(uname -m)" ;;
  esac
  BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  TARBALL=$(curl -fsSL "$BASE/SHASUMS256.txt" | awk '{print $2}' | grep "linux-$ARCH.tar.xz$" | head -1)
  [ -n "$TARBALL" ] || die "Couldn't find a Node.js $NODE_MAJOR download for linux-$ARCH."
  echo "Downloading $TARBALL…"
  TMP=$(mktemp -d)
  curl -fsSL "$BASE/$TARBALL" -o "$TMP/$TARBALL"
  (cd "$TMP" && curl -fsSL "$BASE/SHASUMS256.txt" | grep " $TARBALL\$" | sha256sum -c -)
  rm -rf "$NODE_HOME"
  mkdir -p "$NODE_HOME"
  tar -xJf "$TMP/$TARBALL" -C "$NODE_HOME" --strip-components=1
  rm -rf "$TMP"
  node_ok || die "Node.js install failed."
  echo "Installed Node.js $(node -v) in $NODE_HOME"
fi
if ! command -v pnpm >/dev/null || [ "$(pnpm -v)" != "$PNPM_VERSION" ]; then
  npm install -g --prefix "$NODE_HOME" "pnpm@$PNPM_VERSION"
fi
echo "pnpm $(pnpm -v)"
# make node/pnpm available in new terminals too
if ! grep -q "$NODE_HOME/bin" "$HOME/.profile" 2>/dev/null; then
  printf '\n# Node.js for FLL Sim\nexport PATH="%s/bin:$PATH"\n' "$NODE_HOME" >> "$HOME/.profile"
fi

# ---- 3. the code -------------------------------------------------------------------------------
step "FLL Sim source"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -z "$DIR" ] && [ -n "$HERE" ] && [ -f "$HERE/pnpm-workspace.yaml" ] && [ -d "$HERE/apps/desktop" ]; then
  DIR="$HERE" # run from a checkout
fi
DIR="${DIR:-$HOME/fll-sim}"
if [ -d "$DIR/.git" ]; then
  echo "Using $DIR"
  if [ -z "$(git -C "$DIR" status --porcelain --untracked-files=no)" ]; then
    git -C "$DIR" pull --ff-only || echo "(couldn't update: continuing with the code as it is)"
  else
    echo "(local changes: not updating the code)"
  fi
else
  git clone "$REPO_URL" "$DIR"
fi
cd "$DIR"

# ---- 4. dependencies + build ---------------------------------------------------------------------
step "Dependencies (a few minutes the first time)"
pnpm install --frozen-lockfile
step "Building the app"
pnpm build

# ---- 5. launcher ------------------------------------------------------------------------------
step "App menu launcher"
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
cat > "$HOME/.local/bin/fll-sim" <<EOF
#!/usr/bin/env bash
# Start FLL Sim from its source checkout (made by setup.sh)
export PATH="$NODE_HOME/bin:\$PATH"
cd "$DIR/apps/desktop" && exec pnpm exec electron-vite preview "\$@"
EOF
chmod +x "$HOME/.local/bin/fll-sim"
ICON="$DIR/apps/desktop/build/icon.png"
cat > "$HOME/.local/share/applications/fll-sim.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=FLL Sim
Comment=Simulate SPIKE Prime robots on the FIRST LEGO League field
Exec=$HOME/.local/bin/fll-sim
Icon=$ICON
Categories=Education;
Terminal=false
EOF
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
echo "Start it later from the app menu (FLL Sim) or with: ~/.local/bin/fll-sim"

# ---- 6. first launch ---------------------------------------------------------------------------
if grep -qi microsoft /proc/version 2>/dev/null && [ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then
  echo "WSL without a display: update WSL (wsl --update in Windows) so WSLg can show Linux apps."
  LAUNCH=0
fi
if [ "$LAUNCH" = 1 ]; then
  step "Starting FLL Sim"
  exec "$HOME/.local/bin/fll-sim"
fi
step "Done"
