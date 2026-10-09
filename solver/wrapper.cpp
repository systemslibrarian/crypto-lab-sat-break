// Thin MIT-licensed bridge to CaDiCaL's documented incremental C++ API.
#include "cadical.hpp"

extern "C" {
CaDiCaL::Solver *sat_new() {
  auto *solver = new CaDiCaL::Solver();
  // Every key variable may appear in a later blocking clause. Keep them live.
  for (int bit = 1; bit <= 16; ++bit) solver->freeze(bit);
  return solver;
}
void sat_delete(CaDiCaL::Solver *solver) { delete solver; }
void sat_add(CaDiCaL::Solver *solver, int literal) { solver->add(literal); }
void sat_assume(CaDiCaL::Solver *solver, int literal) { solver->assume(literal); }
int sat_solve(CaDiCaL::Solver *solver) { return solver->solve(); }
int sat_val(CaDiCaL::Solver *solver, int variable) {
  // False means report 0 for a genuinely unused variable, rather than
  // silently manufacturing its default truth value.
  return solver->val(variable, false);
}
bool sat_limit_conflicts(CaDiCaL::Solver *solver, int conflicts) {
  return solver->limit("conflicts", conflicts);
}
}
