# Mutation evidence

Each owner passed before mutation. Each concrete patch built successfully, changed the production bundle, was served from the project subpath, and made its owner fail. The original source was restored after each run.

| Mutation | Mutated asset SHA-256 prefix | Owner failed |
| --- | --- | --- |
| Flip an S-box output literal | `1e118b79c11b` | Yes |
| Use separate master-key variables for later pairs | `f9210e4c91d8` | Yes |
| Hard-wire direct verification to accept | `eae7954fdede` | Yes |
| Check observed pairs instead of withheld pairs | `98cf7f746f89` | Yes |
| Drop the master-key blocking clause | `f4a6bb53748f` | Yes |
| Treat UNKNOWN as UNSAT | `c2f78b0d93db` | Yes |
| Claim original key after withheld success | `69bc2745e615` | Yes |
| Delete the visible equivalence limitation | `709d8987498f` | Yes |
| Accept a result from a retired job | `99b5b6920cb2` | Yes |

Baseline: Tests  45 passed (45); 10 passed (13.3s).
