# Mutation evidence

Each owner passed before mutation. Each concrete patch built successfully, changed the production bundle, was served from the project subpath, and made its owner fail. The original source was restored after each run.

| Mutation | Mutated asset SHA-256 prefix | Owner failed |
| --- | --- | --- |
| Flip an S-box output literal | `a4f1eb509b39` | Yes |
| Use separate master-key variables for later pairs | `e0397f817c54` | Yes |
| Hard-wire direct verification to accept | `b8ef7d01d20d` | Yes |
| Check observed pairs instead of withheld pairs | `5ce29d93ed8e` | Yes |
| Drop the master-key blocking clause | `d19e6073afe0` | Yes |
| Treat UNKNOWN as UNSAT | `faa98830f1f1` | Yes |
| Claim original key after withheld success | `58569ecc5ee2` | Yes |
| Delete the visible equivalence limitation | `4e0c2b750950` | Yes |
| Accept a result from a retired job | `8901bf3238d4` | Yes |

Baseline: Tests  45 passed (45); 9 passed (13.7s).
