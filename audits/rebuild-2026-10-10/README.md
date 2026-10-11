# SAT Break clean rebuild evidence — 2026-10-10

Current inspected main: `22cf78e9dd3e1f1d3dcd9901b0dbed3bd1972508`. Pinned CaDiCaL: `c60730422e758ef1cebe7aeddf2dda31c996bf04`; wrapper bytes remain unchanged. Recipe commits and full actual commands, compiler paths/versions/hashes, source archive/tree identity, times, exit codes and logs are in [report.json](report.json).

The clean rebuilds match the shipped JavaScript SHA-256 `2f070595a1bc8877effc74012a440588bf277c5b1ef0830da192c5d7a5a952cc`. Earlier clean recipes did **not** reproduce the shipped WASM SHA-256 `459622b6fdf1e2d0eaac2189274a0bd96b9ef362f30724ab6e0c4f461addfff5`. Earlier official SDK 6.0.10 and installed Homebrew 6.0.10-git builds, with source-prefix normalization but lexical archive ordering, produced `65e887c5d2e834581e5eebeb062968d97ed2bd8dcb795fcafc116e4625c3437a`. Every mismatch returns exit 1 and preserves the shipped assets; expected hashes were not replaced. Prior unnormalized/other-order mismatches remain in the logs.

The earlier mismatch was an observed reproduction gap, not evidence of a broken cryptographic algorithm. The section comparison shows differences in type, function, element and code sections, so a metadata-only explanation is unsupported. The original compiler’s immutable build identity remains unknown; a matching version label does not authenticate it.

The repair prevents timestamp-cache or stale-archive contamination, captures immutable Git source, uses fresh compiler caches, snapshots recipe/wrapper/expected assets, fails on changed evidence and supports read-only comparison. Offline mock-tool regression tests establish build hygiene and failure handling, not real solver provenance. Application browser checks execute the unchanged shipped WASM, not the mismatching rebuild. Raw C/C++ and WASM scanner coverage limits remain.

## Verified exact reproduction

At `a736ddf618b030b3c98da92319f2b40280da4abb`, a fresh build using the authenticated pinned Git source and installed Homebrew `6.0.10-git` matches **both** shipped artifacts byte for byte, returning exit 0. The actual original local archive inventory was recovered read-only: library C++ objects, then `wrapper.o`, then `kitten.o`. Its ordering was reproduced using newly compiled objects, never cached objects or the old archive. Source paths are normalized to the evidenced `/tmp/sat-break-cadical` prefix. The earlier mismatches and compiler identities remain recorded in full.

This establishes current pinned-source-to-byte correspondence in the measured environment. It does not authenticate the historical compiler, which remains null, or prove full cryptographic correctness or constant-time behavior. Raw C/C++ and WASM static-scanner limitations remain. The new CI gate selects an independently pinned official SDK and requires both exact comparisons before deployment or Dependabot merge. The official SDK clean rebuild at `621b64ae0eff49120eede79df6cb471c076d9876` also matched both assets (exit 0, 56.43 seconds). Its complete actual receipt is [official-sdk-clean-rebuild.json](official-sdk-clean-rebuild.json). Final-head CI receipts supplement these independently measured Mac reproductions.

Next action: review/integrate the focused repair after its exact-head gates pass. Batch forbids merge/deployment; no such action occurred. Fleet item `f5076bf0-3183-49e6-8a44-93942c55b773`.
