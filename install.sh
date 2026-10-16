#!/bin/sh
# Install the current user's CueMol command bundle from GitHub Releases.

main() {
  set -eu
  if [ "${1:-}" = "--help" ]; then
    printf '%s\n' 'Usage: sh install.sh' \
      'CUEMOL_VERSION pins a release (for example, 2.4.0.546).' \
      'CUEMOL_INSTALL_DIR selects the command directory (default: ~/.local/bin).' \
      'CUEMOL_DATA_DIR selects the application directory (default: ~/.local/share/cuemol).'
    return
  fi
  [ "$#" -eq 0 ] || { printf '%s\n' 'Unexpected argument; use --help.' >&2; exit 1; }
  die() { printf 'cuemol: %s\n' "$*" >&2; exit 1; }
  for command in curl tar; do command -v "$command" >/dev/null 2>&1 || die "$command is required"; done
  if command -v sha256sum >/dev/null 2>&1; then
    hash() { sha256sum "$1" | cut -d ' ' -f 1; }
  elif command -v shasum >/dev/null 2>&1; then
    hash() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
  else
    die 'sha256sum or shasum is required'
  fi
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) platform=macOS-arm64 ;;
    Linux-x86_64) platform=Linux-x64 ;;
    *) die 'This installer supports macOS arm64 and Linux x64. Windows users can install the wheel.' ;;
  esac
  base=${CUEMOL_RELEASE_BASE_URL:-https://github.com/CueMol/cuemol2/releases}
  version=${CUEMOL_VERSION:-}
  if [ -z "$version" ]; then
    latest=$(curl -LsSf -o /dev/null -w '%{url_effective}' "$base/latest")
    version=${latest##*/}
  fi
  version=${version#v}
  case "$version" in ''|*[!0-9.]*) die 'Could not resolve a release version' ;; esac
  asset="CueMol3-$version-$platform-Command.tar.gz"
  data=${CUEMOL_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/cuemol}
  bindir=${CUEMOL_INSTALL_DIR:-$HOME/.local/bin}
  mkdir -p "$data" "$bindir"
  data=$(cd "$data" && pwd)
  bindir=$(cd "$bindir" && pwd)
  if [ -e "$bindir/cuemol" ] || [ -L "$bindir/cuemol" ]; then
    [ -L "$bindir/cuemol" ] || die 'A different cuemol command already exists; choose CUEMOL_INSTALL_DIR.'
    case "$(readlink "$bindir/cuemol")" in
      "$data"/*) ;;
      *) die 'The existing cuemol link belongs to another installation.' ;;
    esac
  fi
  lock="$data/.install-lock"
  mkdir "$lock" 2>/dev/null || die "Another installer holds $lock"
  work=
  cleanup() {
    [ -z "$work" ] || rm -rf "$work"
    rm -f "$bindir/.cuemol-link-$$"
    rmdir "$lock"
  }
  trap cleanup 0
  trap 'exit 1' 1 2 15
  work=$(mktemp -d "$data/.install-XXXXXX")
  printf 'Downloading CueMol %s (%s)...\n' "$version" "$platform" >&2
  curl -LsSf "$base/download/v$version/$asset" -o "$work/bundle.tar.gz"
  curl -LsSf "$base/download/v$version/$asset.sha256" -o "$work/checksum"
  expected=$(awk 'NR == 1 { print $1; exit }' "$work/checksum")
  actual=$(hash "$work/bundle.tar.gz")
  [ "$actual" = "$expected" ] || die 'Archive SHA-256 mismatch; the installation was not changed.'
  tar -tzf "$work/bundle.tar.gz" > "$work/entries"
  awk '/^\// || /(^|\/)\.\.(\/|$)/ { exit 1 }' "$work/entries" || die 'Unsafe archive path'
  target="$data/$version-$platform-$(printf '%s' "$actual" | cut -c1-16)"
  if [ ! -d "$target" ]; then
    mkdir "$work/app"
    tar -xzf "$work/bundle.tar.gz" -C "$work/app"
    [ -x "$work/app/bin/cuemol" ] || die 'Archive is missing bin/cuemol'
    printf '%s\n' "$bindir" > "$work/app/.install-bin-dir"
    mv "$work/app" "$target"
  fi
  [ -f "$target/.install-bin-dir" ] || die 'The destination is not a managed CueMol installation'
  ln -s "$target/bin/cuemol" "$bindir/.cuemol-link-$$"
  mv -f "$bindir/.cuemol-link-$$" "$bindir/cuemol"
  printf 'Installed CueMol %s: %s/cuemol\n' "$version" "$bindir"
  case ":$PATH:" in *":$bindir:"*) ;; *) printf 'Add %s to PATH to run cuemol.\n' "$bindir" ;; esac
  printf '%s\n' 'Restart any running CueMol app to use this version.'
}

main "$@"
