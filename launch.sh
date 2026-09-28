#!/usr/bin/env bash
# FLL Sim launcher (what ~/.local/bin/fll-sim runs): choose the graphics driver, then start the app.
#
# In a terminal it lists what can draw the 3D field — the GPUs WSL passes through (Mesa's D3D12
# driver, one entry per Windows GPU), the default driver, or no hardware acceleration — and
# remembers the choice in ~/.config/fll-sim/graphics.env. From the app menu (no terminal) the
# remembered choice is used without asking.
#
#   fll-sim               in a terminal: ask (Enter keeps the last choice), then start
#   fll-sim --last        start with the last choice without asking
#   fll-sim --graphics    ask (needs a terminal)
#
# The choice is a set of environment variables: GALLIUM_DRIVER / MESA_D3D12_DEFAULT_ADAPTER_NAME
# pick a GPU through Mesa's D3D12 driver on WSL; FLLSIM_NO_GPU=1 turns hardware acceleration off.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/fll-sim"
CONF="$CONF_DIR/graphics.env"
[ -d "$HOME/.local/node/bin" ] && export PATH="$HOME/.local/node/bin:$PATH"

ASK=auto
ARGS=()
for a in "$@"; do
  case "$a" in
    --graphics) ASK=yes ;;
    --last) ASK=no ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) ARGS+=("$a") ;;
  esac
done
# Ask when a terminal is attached (also under `curl … | bash`, whose stdin is the pipe): the
# answer is read from /dev/tty. From the app menu there is no terminal, so the last choice is used.
if [ "$ASK" = auto ]; then
  if [ -t 1 ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then ASK=yes; else ASK=no; fi
fi

# Every option is a label plus the KEY=VALUE lines (newline-separated) it sets.
LABELS=()
VARS=()
add() { LABELS+=("$1"); VARS+=("$2"); }
have_label() { local l; for l in ${LABELS[@]+"${LABELS[@]}"}; do [ "$l" = "$1" ] && return 0; done; return 1; }
# "OpenGL renderer string" of a driver, e.g. "llvmpipe (LLVM 19.1.7, 256 bits)" (the CPU) or
# "D3D12 (NVIDIA GeForce RTX 5090)" (a GPU through WSL). Arguments: KEY=VALUE settings to try.
renderer() { env "$@" timeout 15 glxinfo -B 2>/dev/null | sed -n 's/^OpenGL renderer string: //p' | head -1; }

if [ "$ASK" = yes ]; then
  echo "FLL Sim — graphics for the 3D field"
  if command -v glxinfo >/dev/null; then
    echo "(looking at the graphics drivers…)"
    DEF=$(renderer || true)
    case "$DEF" in
      "") add "Default driver: unknown (glxinfo failed; is a display available?)" "" ;;
      *llvmpipe*|*softpipe*|*SwiftShader*|*software*) add "Default driver: $DEF — the CPU draws, slow" "" ;;
      *) add "Default driver: $DEF" "" ;;
    esac
    if [ -e /dev/dxg ]; then
      # WSL2 with GPU passthrough. Windows knows the GPU names (Device Manager); each one that
      # Mesa's D3D12 driver accepts becomes an option.
      NAMES=$(powershell.exe -NoProfile -Command 'Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }' 2>/dev/null | tr -d '\r' || true)
      [ -n "$NAMES" ] || NAMES=$'NVIDIA\nAMD\nIntel'
      while IFS= read -r name; do
        [ -n "$name" ] || continue
        r=$(renderer GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME="$name" || true)
        case "$r" in
          D3D12*) have_label "GPU: $r" || add "GPU: $r" "GALLIUM_DRIVER=d3d12"$'\n'"MESA_D3D12_DEFAULT_ADAPTER_NAME=$name" ;;
        esac
      done <<< "$NAMES"
    fi
  else
    add "Default driver (install mesa-utils to see which GPUs are available)" ""
  fi
  add "No hardware acceleration — software rendering only" "FLLSIM_NO_GPU=1"

  # the remembered choice is the default
  SAVED=$( [ -f "$CONF" ] && sed -n 's/^# label: //p' "$CONF" || true)
  DEFI=1
  for i in "${!LABELS[@]}"; do [ "${LABELS[$i]}" = "$SAVED" ] && DEFI=$((i + 1)); done
  for i in "${!LABELS[@]}"; do
    mark=" "; [ $((i + 1)) = "$DEFI" ] && mark="*"
    printf ' %s %d) %s\n' "$mark" $((i + 1)) "${LABELS[$i]}"
  done
  while :; do
    read -r -p "Choose [$DEFI]: " c </dev/tty || c=""
    c=${c:-$DEFI}
    [[ "$c" =~ ^[0-9]+$ ]] && [ "$c" -ge 1 ] && [ "$c" -le "${#LABELS[@]}" ] && break
    echo "Please enter a number from 1 to ${#LABELS[@]}."
  done
  i=$((c - 1))
  mkdir -p "$CONF_DIR"
  {
    echo "# FLL Sim graphics choice (run fll-sim in a terminal, or fll-sim --graphics, to change)"
    echo "# label: ${LABELS[$i]}"
    while IFS= read -r kv; do [ -n "$kv" ] && printf '%s=%q\n' "${kv%%=*}" "${kv#*=}"; done <<< "${VARS[$i]}"
  } > "$CONF"
fi

if [ -f "$CONF" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$CONF"
  set +a
  echo "Graphics: $(sed -n 's/^# label: //p' "$CONF")"
fi

cd "$HERE/apps/desktop" && exec pnpm exec electron-vite preview ${ARGS[@]+"${ARGS[@]}"}
