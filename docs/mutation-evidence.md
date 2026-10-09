# Mutation evidence

Each owner passed before mutation. Each concrete patch built successfully, changed the production bundle, was served from the project subpath, and made its owner fail. The original source was restored after each run.

| Mutation | Mutated asset SHA-256 prefix | Owner failed |
| --- | --- | --- |
| Flip an S-box output literal | `1aee83ac4a0c` | Yes |
| Use separate master-key variables for later pairs | `49e16eb47312` | Yes |
| Hard-wire direct verification to accept | `6c6e5faee7bc` | Yes |
| Check observed pairs instead of withheld pairs | `84024c7661de` | Yes |
| Drop the master-key blocking clause | `8a26cb41290a` | Yes |
| Treat UNKNOWN as UNSAT | `93bfdf9c4a7a` | Yes |
| Claim original key after withheld success | `8b5ae6ba8136` | Yes |
| Delete the visible equivalence limitation | `c389fc347928` | Yes |
| Accept a result from a retired job | `c722fe929c92` | Yes |

Baseline: Tests  45 passed (45); 9 passed (9.7s).
