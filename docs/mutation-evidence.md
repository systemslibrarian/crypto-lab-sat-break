# Mutation evidence

Each owner passed before mutation. Each concrete patch built successfully, changed the production bundle, was served from the project subpath, and made its owner fail. The original source was restored after each run.

| Mutation | Mutated asset SHA-256 prefix | Owner failed |
| --- | --- | --- |
| Flip an S-box output literal | `bf6d2a62ee4e` | Yes |
| Use separate master-key variables for later pairs | `d59566cd6fa0` | Yes |
| Hard-wire direct verification to accept | `55440ab99439` | Yes |
| Check observed pairs instead of withheld pairs | `6cb5ce7d4e7a` | Yes |
| Drop the master-key blocking clause | `767362fd7530` | Yes |
| Treat UNKNOWN as UNSAT | `567ce748a5ac` | Yes |
| Claim original key after withheld success | `c63bffe7ebdd` | Yes |
| Delete the visible equivalence limitation | `8b79f9a601af` | Yes |
| Accept a result from a retired job | `ecb198fd04fc` | Yes |
| cube oracle v1v2 key term | `f70e6edeacb5` | Yes |
| cube face XOR reduction | `40642367dce1` | Yes |
| cube superpoly Mobius transform | `b0092e3aa2c4` | Yes |
| cube nonlinear degree gate | `1a2ddce8d25d` | Yes |
| cube affine constant moved to rhs | `2558ecd5235f` | Yes |
| cube heldout candidate prediction | `e5052d29bc35` | Yes |

Baseline: Tests  71 passed (71); 13 passed (8.3s).
