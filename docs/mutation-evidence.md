# Mutation evidence

Each owner passed before mutation. Each concrete patch built successfully, changed the production bundle, was served from the project subpath, and made its owner fail. The original source was restored after each run.

| Mutation | Mutated asset SHA-256 prefix | Owner failed |
| --- | --- | --- |
| Flip an S-box output literal | `0e6d7e172b49` | Yes |
| Use separate master-key variables for later pairs | `dac53088bd59` | Yes |
| Hard-wire direct verification to accept | `bc43b94f7034` | Yes |
| Check observed pairs instead of withheld pairs | `1ce7238d50ed` | Yes |
| Drop the master-key blocking clause | `faacd4cd25f9` | Yes |
| Treat UNKNOWN as UNSAT | `22dec8639203` | Yes |
| Claim original key after withheld success | `5d5901a975a7` | Yes |
| Delete the visible equivalence limitation | `f22d3c4ced81` | Yes |
| Accept a result from a retired job | `d159f1346f80` | Yes |

Baseline: Tests  45 passed (45); 11 passed (14.2s).
