#!/usr/bin/env bash
set -euo pipefail

revision=c60730422e758ef1cebe7aeddf2dda31c996bf04
root=$(cd "$(dirname "$0")/.." && pwd -P)
verify=0
if [ "${1:-}" = "--verify" ]; then verify=1; shift; fi
if [ "$#" -gt 1 ]; then echo "Usage: bash solver/build.sh [--verify] [source-cache]" >&2; exit 2; fi
case "${1:-}" in --*) echo "Unsupported build option" >&2; exit 2;; esac
source_cache=${1:-"$root/.solver-src"}
for tool in git tar emcc em++ emar shasum; do command -v "$tool" >/dev/null; done

# This cache stores immutable Git objects only. Never check out/reset user files.
if [ ! -e "$source_cache" ]; then
  git clone --no-checkout https://github.com/arminbiere/cadical.git "$source_cache"
fi
origin=$(git -C "$source_cache" remote get-url origin)
case "$origin" in
  https://github.com/arminbiere/cadical|https://github.com/arminbiere/cadical.git|git@github.com:arminbiere/cadical.git) ;;
  *) echo "Unexpected CaDiCaL origin" >&2; exit 1;;
esac
git -C "$source_cache" fetch origin "$revision"
actual=$(git -C "$source_cache" rev-parse "$revision^{commit}")
test "$actual" = "$revision"

scratch=$(mktemp -d "${TMPDIR:-/tmp}/cadical-clean.XXXXXX")
# Emscripten's relative system-library paths must agree with macOS /var aliases.
scratch=$(cd "$scratch" && pwd -P)
trap 'rm -rf "$scratch"' EXIT
source_dir="$scratch/source"
build_dir="$scratch/objects"
output_dir="$scratch/output"
mkdir -p "$source_dir" "$build_dir" "$output_dir"
git -C "$source_cache" archive "$revision" | tar -x -C "$source_dir"
# Neither repository dirt nor old .solver-build objects/archives enter this build.
cp "$root/solver/wrapper.cpp" "$scratch/wrapper.cpp"
cp "$root/solver/build.sh" "$scratch/build.sh"
if [ "$verify" -eq 1 ]; then
  mkdir "$scratch/expected"
  for asset in cadical.mjs cadical.wasm; do
    test -f "$root/public/$asset" && test ! -L "$root/public/$asset"
    cp "$root/public/$asset" "$scratch/expected/$asset"
  done
fi
export CCACHE_DISABLE=1 EM_CACHE="$scratch/em-cache"
unset EMCC_CFLAGS CFLAGS CXXFLAGS LDFLAGS
printf 'source revision: %s\n' "$actual"
shasum -a 256 "$scratch/build.sh" "$scratch/wrapper.cpp"
for tool in emcc em++ emar; do
  printf 'tool path: %s\n' "$(command -v "$tool")"
  "$tool" --version
  shasum -a 256 "$(command -v "$tool")"
done

# Print actual arguments to retain the compilation recipe with verification logs.
run() { printf '%q ' "$@"; printf '\n'; "$@"; }
# __FILE__ strings in the shipped WASM identify this original source prefix.
# Map only captured upstream source paths; never require or modify that directory.
source_prefix_map="-ffile-prefix-map=$source_dir=/tmp/sat-break-cadical"
objects=()
for source in "$source_dir"/src/*.cpp; do
  name=$(basename "$source" .cpp)
  case "$name" in cadical|mobical) continue;; esac
  object="$build_dir/$name.o"
  run em++ -O2 -DNDEBUG -DNBUILD -DNCLOSEFROM "$source_prefix_map" -std=c++17 -I"$source_dir/src" -c "$source" -o "$object"
  objects+=("$object")
done
run emcc -O2 -DNDEBUG -DNBUILD -DNCLOSEFROM "$source_prefix_map" -I"$source_dir/src" -c "$source_dir/src/kitten.c" -o "$build_dir/kitten.o"
run em++ -O2 -DNDEBUG -DNBUILD -DNCLOSEFROM -std=c++17 -I"$source_dir/src" -c "$scratch/wrapper.cpp" -o "$build_dir/wrapper.o"
# The observed original archive orders library C++ objects first, then wrapper,
# then kitten. Recreate that inventory from fresh objects; never reuse its cache.
objects+=("$build_dir/wrapper.o" "$build_dir/kitten.o")
run emar rcs "$build_dir/libcadical.a" "${objects[@]}"
run em++ -O2 "$build_dir/wrapper.o" "$build_dir/libcadical.a" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH=1 -sNO_EXIT_RUNTIME=1 \
  -sEXPORTED_FUNCTIONS='["_sat_new","_sat_delete","_sat_add","_sat_assume","_sat_solve","_sat_val","_sat_limit_conflicts"]' \
  -o "$output_dir/cadical.mjs"
shasum -a 256 "$output_dir/cadical.mjs" "$output_dir/cadical.wasm"
cmp -s "$root/solver/build.sh" "$scratch/build.sh"
cmp -s "$root/solver/wrapper.cpp" "$scratch/wrapper.cpp"
if [ "$verify" -eq 1 ]; then
  for asset in cadical.mjs cadical.wasm; do
    cmp -s "$root/public/$asset" "$scratch/expected/$asset"
  done
  # Optional evidence export may only create a new directory. Refuse to replace
  # anything that already exists, including a previous run or shipped public/.
  if [ -n "${SOLVER_BUILD_OUTPUT_DIR:-}" ]; then
    mkdir "$SOLVER_BUILD_OUTPUT_DIR"
    cp "$output_dir/cadical.mjs" "$output_dir/cadical.wasm" "$SOLVER_BUILD_OUTPUT_DIR/"
  fi
  result=0
  for asset in cadical.mjs cadical.wasm; do
    if cmp -s "$output_dir/$asset" "$scratch/expected/$asset"; then
      printf 'MATCH public/%s\n' "$asset"
    else
      printf 'MISMATCH public/%s\n' "$asset" >&2
      result=1
    fi
  done
  exit "$result"
fi
# Explicit regeneration remains available; verification above never replaces assets.
mkdir -p "$root/public"
cp "$output_dir/cadical.mjs" "$output_dir/cadical.wasm" "$root/public/"
cp "$source_dir/LICENSE" "$root/public/LICENSE.cadical.txt"
shasum -a 256 "$root/public/cadical.mjs" "$root/public/cadical.wasm"
