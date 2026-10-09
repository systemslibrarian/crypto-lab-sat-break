# SAT Break

## What It Is

SAT Break is a browser lab for encoding an 8-bit, 16-bit-key teaching SPN as Boolean clauses and asking the real CaDiCaL CDCL solver for consistent master keys. The target reuses the Heys S-box and the fleet's four-round cipher from Biham Lens and Return Path, with Return Path's one-to-six-round extension. It is **not production cryptography**: the entire 65,536-key space can be scanned directly.

A satisfying assignment fits the observed plaintext/ciphertext pairs. It does not by itself establish that the key is unique, that it passes withheld checks, or that its bits equal the original key.

## Exhibits

1. **Meet the cipher.** Follow the short challenge and round-structure map, then choose a fixed four-round fixture, a one-round equivalent-key fixture, or a fresh random experiment. Inspect the public pairs and a separate visible-key round trace. Add up to eight distinct observations.
2. **Inspect the circuit.** Select an actual XOR, S-box, or final key-mixing gate. Change proposed bit values to see the gate's expected result and which clauses become false. Export the base public formula as DIMACS.
3. **Solve.** Find one key, find another, check a supplied key, or enumerate in batches of up to 512. The real WASM solver runs in a worker and the UI distinguishes SAT, UNSAT, incomplete, load failure, timeout, and cancellation.
4. **Verify.** Re-encrypt observed and withheld pairs directly, compare all 256 plaintexts for functional equivalence, reveal original key bits only when requested, and compare a completed SAT key set with an independent exhaustive scan.
5. **Measure.** Explicitly run five fresh measured repetitions after a warmup for either first match or complete candidate set, with identical public observations for SAT and exhaustive search. Inspect measured load, clause, solve, model, verification, and scan stages separately from the trial totals.

The four-round fixture uses original key `1234`: `00 → 0C` admits 262 keys, adding `3A → 33` leaves `1234` and `7615`, and adding `5C → C7` leaves `1234`. Supplied candidate `003F` fits the first pair but encrypts `3A` to `26`, which fails the withheld `33`. In the one-round fixture, `1034` and `1234` have different bits but identical outputs for all 256 plaintexts. The visible limitation remains: every encryption check can pass without identifying the original master-key bits.

## When to Use It

Use this lab to study bit-level constraint encoding, model verification, evidence growth, key enumeration, and the difference between function recovery and key identity. Do **not** use its timings or toy cipher to make a claim about attacking AES or about SAT generally outperforming exhaustive search.

## Live Demo

The deployed lab is [SAT Break](https://systemslibrarian.github.io/crypto-lab-sat-break/). The GitHub Actions gate builds, tests, and publishes it to GitHub Pages.

## What Can Go Wrong

- A SAT model can fit the observed pairs and fail a withheld pair. That is insufficient evidence, not a solver defect.
- Passing sampled withheld checks is weaker than comparing all 256 plaintexts.
- A different one-round master key can implement the exact same function. Even a complete codebook match does not prove original bits.
- Reaching a cap, Stop, UNKNOWN, or timeout does not prove all keys have been found. Only a blocking query returning UNSAT or an explicitly identified exhaustive scan can establish completeness.
- A candidate that fails a direct observed-pair check signals an internal encoding, solver, or decoding problem; the page suppresses recovery claims in that state.

## Real-World Usage

SAT encodings are used to analyze precisely specified constraints, including cryptographic problems. This lab shows the mechanics on a deliberately exhaustive teaching target. Its plain CNF build does not include native XOR constraints or Gaussian elimination, and it makes no performance prediction for larger ciphers. See the [CaDiCaL project](https://github.com/arminbiere/cadical) and [solver provenance](docs/solver-build.md).

## How to Run Locally

Use Node 22 or newer:

```sh
npm ci
npm run dev
```

The pinned WASM artifacts are checked in. To reproduce them with Emscripten, run `bash solver/build.sh`; see [solver provenance](docs/solver-build.md). For a production build, run `npm run build` then `npm run preview -- --port 4216 --strictPort` and visit `/crypto-lab-sat-break/` under the preview origin.

## Related Demos

- [Biham Lens](https://github.com/systemslibrarian/crypto-lab-biham-lens) attacks the four-round target with differential cryptanalysis.
- [Return Path](https://github.com/systemslibrarian/crypto-lab-return-path) supplies the one-to-six-round target semantics and studies impossible differentials and boomerangs.
- [Matsui Line](https://github.com/systemslibrarian/crypto-lab-matsui-line) studies linear cryptanalysis on a related toy SPN.
- [Feistel Forge](https://github.com/systemslibrarian/crypto-lab-feistel-forge) explores candidate keys and additional evidence on a different target.

## Build & Verify

`npm test` runs the cipher and CNF unit suite, including all 16 fixed four-round known-answer vectors, a separately written compatibility reference, gate truth tables, count formulas, and public-query isolation. `npm run test:claims` drives the real WASM adapter through the built page. `npm run test:a11y` runs axe and painted contrast checks at desktop and phone width through the actual teaching states. The deploy workflow blocks publication until all three suites and the build pass. The exact executed counts belong in the completion report, not a hard-coded promise here.

The source cipher files were copied with attribution from Return Path repository revision `544d941c94ee6dd394e34adf9bfc9eb7ab78748e`. Its `spn.ts` has Git blob `d3687258f9a5cf115425c16935bcbf697e0e3d54`. The catalog standard was read at revision `57e0d1dd3587762eb3f64444e81813aca1718fa4`. The overlap check found no SAT/CNF solver entry in the current local catalog and no such implementation in the plausible sibling sources inspected; this is a bounded check, not a claim that every lab was searched.

## Performance

Measurements are local to the selected browser, fixture, rounds, pair count, and task. The lab displays sample count and spread, including worker startup and direct SAT candidate verification in trial totals. CNF encoding is timed once when evidence changes and shown separately because it is excluded from trial totals. Stage medians are measured separately and need not add to the total median. Additional observations shrink the mathematical candidate set for a fixed experiment but do not guarantee faster solve time. No speedup ratio is shown when timing is below resolution.

MIT licensed. CaDiCaL retains its [upstream MIT notice](solver/LICENSE.cadical).

So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31
