#!/usr/bin/env bash
set -euo pipefail

revision=c60730422e758ef1cebe7aeddf2dda31c996bf04
root=$(cd "$(dirname "$0")/.." && pwd)
source_dir=${1:-"$root/.solver-src"}
mkdir -p "$source_dir"
if [ ! -d "$source_dir/.git" ]; then
  git clone https://github.com/arminbiere/cadical.git "$source_dir"
fi
git -C "$source_dir" fetch origin "$revision"
git -C "$source_dir" checkout --detach "$revision"
actual=$(git -C "$source_dir" rev-parse HEAD)
test "$actual" = "$revision"

build_dir="$root/.solver-build"
mkdir -p "$build_dir" "$root/public"
cp "$source_dir/LICENSE" "$root/public/LICENSE.cadical.txt"
for source in "$source_dir"/src/*.cpp; do
  name=$(basename "$source" .cpp)
  case "$name" in cadical|mobical) continue;; esac
  if [ -f "$build_dir/$name.o" ] && [ "$build_dir/$name.o" -nt "$source" ]; then continue; fi
  em++ -O2 -DNDEBUG -DNBUILD -DNCLOSEFROM -std=c++17 -I"$source_dir/src" -c "$source" -o "$build_dir/$name.o"
done
emcc -O2 -DNDEBUG -DNBUILD -DNCLOSEFROM -I"$source_dir/src" -c "$source_dir/src/kitten.c" -o "$build_dir/kitten.o"
em++ -O2 -DNDEBUG -DNBUILD -DNCLOSEFROM -std=c++17 -I"$source_dir/src" -c "$root/solver/wrapper.cpp" -o "$build_dir/wrapper.o"
emar rcs "$build_dir/libcadical.a" "$build_dir"/*.o
em++ -O2 "$build_dir/wrapper.o" "$build_dir/libcadical.a" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH=1 -sNO_EXIT_RUNTIME=1 \
  -sEXPORTED_FUNCTIONS='["_sat_new","_sat_delete","_sat_add","_sat_assume","_sat_solve","_sat_val","_sat_limit_conflicts"]' \
  -o "$root/public/cadical.mjs"
shasum -a 256 "$root/public/cadical.mjs" "$root/public/cadical.wasm"
