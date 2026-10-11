# CaDiCaL WebAssembly build

This lab runs [CaDiCaL](https://github.com/arminbiere/cadical), a real CDCL SAT solver, inside a single-threaded browser worker. The shipped files are `public/cadical.mjs` and `public/cadical.wasm`; the solver is not fetched from a runtime CDN. The bridge source is [`solver/wrapper.cpp`](../solver/wrapper.cpp), under this repository's MIT license. CaDiCaL's own MIT notice is [`solver/LICENSE.cadical`](../solver/LICENSE.cadical) and is also served beside the binaries.

## Pinned inputs

| Input | Revision / version |
| --- | --- |
| Upstream CaDiCaL | `c60730422e758ef1cebe7aeddf2dda31c996bf04` |
| Emscripten (`emcc`, `em++`, `emar`) | `6.0.10-git` on macOS arm64 |
| Bridge | [`solver/wrapper.cpp`](../solver/wrapper.cpp) in this repository |
| Build script | [`solver/build.sh`](../solver/build.sh) in this repository |

From the repository root, run `bash solver/build.sh --verify` for a clean rebuild and exact comparison of both shipped assets. Use `bash solver/build.sh` only for intentional artifact regeneration. An optional final argument selects an existing CaDiCaL Git cache. The script fetches the pinned revision into ignored `.solver-src/` without checking out, resetting or reading that cache’s working files, then extracts immutable Git source into fresh scratch space. Every run compiles all library C++ files plus `kitten.c` with `-O2 -DNDEBUG -DNBUILD -DNCLOSEFROM`, links the bridge with modular ES module output, and uses a fresh Emscripten system-library cache with compiler-object caching disabled. No old `.solver-build` objects or archives are reused. Intentional regeneration also copies the upstream license. It excludes the standalone CaDiCaL and Mobical command-line frontends. `-DNCLOSEFROM` selects upstream's fallback because Emscripten does not provide `closefrom`. The link uses `-sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 -sNO_EXIT_RUNTIME=1` and exports only the seven bridge functions. No pthreads or cross-origin isolation are needed.

The checked-in artifacts produced in this environment have SHA-256 checksums:

```text
2f070595a1bc8877effc74012a440588bf277c5b1ef0830da192c5d7a5a952cc  public/cadical.mjs
459622b6fdf1e2d0eaac2189274a0bd96b9ef362f30724ab6e0c4f461addfff5  public/cadical.wasm
```

`--verify` never replaces the checked-in JavaScript, WASM or license. It returns nonzero for either byte mismatch, missing output, upstream/compiler failure, unexpected source origin or revision, or changes to the captured wrapper, recipe or expected assets during execution. Both comparison results are reported when output is readable. Scratch paths are canonicalized so macOS `/var` aliases agree with Emscripten’s system-library paths. Actual compiler executable paths, versions, script hashes, compile/link arguments and rebuilt artifact hashes are printed for evidence retention. Offline subprocess regression fixtures test these failure paths; mock compiler success is not reproduction evidence.

The historical `6.0.10-git` label above does not authenticate the original compiler revision. The independently selected official SDK 6.0.10 uses Emscripten `d6c521a7f05449857c76bd99e396895583cf2083`, SDK commit `a2b92777574c2feda07994cd4f1079a3dfc151f8`, and release `666337b525e673e769121856d175f6f52b8ead64`. Keep the historical label, selected environment and actual measured reproduction results distinct. No claim of original compiler identity follows from a version string or matching fingerprints.

The shipped WASM contains `__FILE__` strings `/tmp/sat-break-cadical/src/solver.cpp` and `/tmp/sat-break-cadical/src/external.cpp`. The clean recipe preserves lexical archive order and maps the captured upstream source prefix to `/tmp/sat-break-cadical` with `-ffile-prefix-map`. This records an observable artifact input without requiring that directory, reusing its contents, or inferring the original compiler. Builds before this path mapping remain recorded mismatches rather than being relabelled successful.

Builds with a different Emscripten revision may produce different bytes. `shasum -a 256 public/cadical.mjs public/cadical.wasm` records the output of a new build. The generated `.mjs` is about 66 KiB and `.wasm` about 879 KiB in this build.

`npm test` checks that both documented digests contain exactly 64 hexadecimal characters and match the checked-in asset bytes. Update these checksums when intentionally rebuilding the assets. This gate checks documentation consistency; it does not establish compiler or binary provenance.

## Adapter contract

`sat_new` freezes master-key variables 1–16 because later incremental blocking clauses can mention every bit. `sat_add` takes signed literals and a zero terminates each clause. `sat_assume` constrains only the next solve. The [CaDiCaL API](https://github.com/arminbiere/cadical/blob/master/src/cadical.hpp) documents solve return values `10` (SAT), `20` (UNSAT), and `0` (UNKNOWN); the worker handles all three. After SAT, `sat_val(i)` returns a signed literal or zero if unresolved. In this pinned build, a frozen but unconstrained bit receives the default negative phase. The worker identifies genuinely free bits from clause incidence and explicitly completes them as zero; if a used bit is unresolved, it asks the solver for a satisfiable completion. It never interprets an arbitrary missing bit as false.

Each UI query creates a worker. Enumeration adds a clause excluding only the returned 16-bit master key after each model, then solves again on the same native instance. An UNSAT response after blocking proves completion for that public query. A cap, UNKNOWN, timeout, or Stop leaves a partial result. The main thread can terminate a synchronous worker after 30 seconds or when evidence changes; late messages are ignored by job ID. Startup, clause loading, solve, model extraction, and total elapsed times are recorded separately where measurable.

The [Emscripten modularized output documentation](https://emscripten.org/docs/compiling/Modularized-Output.html) describes the async factory used by the worker. The JavaScript/WASM assets are loaded using the Vite project base path, so GitHub Pages can serve them under `/crypto-lab-sat-break/`.

The browser claims suite runs this actual WASM binary. It checks a satisfiable candidate, a wrong supplied candidate, incremental enumeration, one-round equivalent keys, and SAT/exhaustive set equality. A JavaScript mock would not establish those claims.
