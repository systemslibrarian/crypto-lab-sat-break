import { describe, expect, it } from 'vitest';
import { encode, toDimacs, blockingClause, xorClauses } from './encode.ts';
import { fourRoundExample, publicEvidence, oneRoundExample } from '../experiment.ts';
import { encrypt, generateKey } from '../crypto/spn.ts';
import { getSbox } from '../crypto/sbox.ts';

const truth = (clause: readonly number[], values: Map<number, boolean>): boolean =>
  clause.some(lit => values.get(Math.abs(lit)) === (lit > 0));

describe('the CNF is the displayed circuit', () => {
  it('uses shared 16 key variables and the exact count formulas', () => {
    for (let rounds = 1; rounds <= 6; rounds++) for (const n of [1,2,8]) {
      const pairs = publicEvidence({ ...fourRoundExample(), rounds }, n).observed;
      const f = encode(pairs, rounds);
      expect(f.variableCount).toBe(16 + n * (16 * rounds - 8));
      expect(f.clauses).toHaveLength(n * (160 * rounds - 16));
      expect(f.wires.slice(1,17)).toEqual(Array.from({length:16},(_,i)=>`master key bit ${i}`));
      expect(new Set(f.wires).size).toBe(f.wires.length);
      for (const clause of f.clauses) for (const lit of clause) expect(Math.abs(lit)).toBeLessThanOrEqual(f.variableCount);
    }
  });

  it('encodes the full XOR truth table, including signed input literals', () => {
    const f = encode(publicEvidence(fourRoundExample(), 1).observed, 4);
    const xor = f.gates.find(g => g.kind === 'xor')!;
    const clauses = f.clauses.slice(xor.clauseStart, xor.clauseStart+xor.clauseCount);
    for (const a of [0,1]) for (const b of [0,1]) for (const z of [0,1]) {
      const values = new Map<number,boolean>([[Math.abs(xor.inputs[0]),Boolean(a)===(xor.inputs[0]>0)], [Math.abs(xor.inputs[1]),Boolean(b)===(xor.inputs[1]>0)], [xor.outputs[0],Boolean(z)]]);
      expect(clauses.every(c=>truth(c,values))).toBe(z === (a ^ b));
    }
    const signed = encode([{plain:1,cipher:0}],4).gates.find(g=>g.kind==='sbox' && g.inputs.some(lit=>lit<0));
    expect(signed).toBeDefined();
    for(const signA of [-1,1]) for(const signB of [-1,1]){
      const direct=xorClauses(signA*1,signB*2,3);
      for(const a of [0,1]) for(const b of [0,1]) for(const z of [0,1]){
        const values=new Map<number,boolean>([[1,Boolean(a)===(signA>0)],[2,Boolean(b)===(signB>0)],[3,Boolean(z)]]);
        expect(direct.every(c=>truth(c,values))).toBe(z===(a^b));
      }
    }
  });

  it('accepts precisely the 16 valid S-box input/output combinations', () => {
    const f = encode([{plain:0,cipher:0}],1);
    const gate = f.gates.find(g=>g.kind==='sbox')!;
    const clauses = f.clauses.slice(gate.clauseStart, gate.clauseStart+64);
    const sbox = getSbox('weak').table;
    for(let input=0;input<16;input++) for(let output=0;output<16;output++){
      const values = new Map<number,boolean>();
      gate.inputs.forEach((lit,i)=>values.set(Math.abs(lit),Boolean((input>>i)&1)===(lit>0)));
      gate.outputs.forEach((lit,i)=>values.set(lit,Boolean((output>>i)&1)));
      expect(clauses.every(c=>truth(c,values))).toBe(output===sbox[input]);
    }
  });

  it('keeps the final XOR output polarity for ciphertext 0 and 1', () => {
    for(const cipher of [0,1]){
      const f=encode([{plain:0,cipher}],1);
      const gate=f.gates.find(g=>g.kind==='final')!;
      const clauses=f.clauses.slice(gate.clauseStart,gate.clauseStart+2);
      for(const a of [0,1]) for(const b of [0,1]){
        const values=new Map<number,boolean>([[gate.inputs[0],Boolean(a)],[gate.inputs[1],Boolean(b)]]);
        expect(clauses.every(c=>truth(c,values))).toBe((a^b)===cipher);
      }
    }
  });

  it('exports valid public-only DIMACS and blocks exactly one master key', () => {
    const example = fourRoundExample();
    const { observed } = publicEvidence(example, 1);
    const f=encode(observed,4);
    const dimacs=toDimacs(f);
    expect(dimacs).toContain('p cnf 72 624\n');
    const data=dimacs.split('\n').filter(line=>line && !line.startsWith('c ') && !line.startsWith('p '));
    expect(data).toHaveLength(624);
    expect(data.every(line=>line.endsWith(' 0'))).toBe(true);
    expect(dimacs).not.toContain('1234');
    const block=blockingClause(0x1034);
    expect(block).toHaveLength(16);
    for(const key of [0x1034,0x1234,0xffff,0]){
      const satisfied=block.some(lit=>Boolean((key>>(Math.abs(lit)-1))&1)===(lit>0));
      expect(satisfied).toBe(key!==0x1034);
    }
  });

  it('does not serialize hidden metadata or withheld checks into the public query', () => {
    const example=oneRoundExample();
    const initial=publicEvidence(example,1);
    const changed={...example,hiddenKey:0x1034,plaintextOrder:[0,...example.plaintextOrder.slice(1).reverse()]};
    const other=publicEvidence(changed,1);
    expect(initial.observed).toEqual(other.observed);
    expect(JSON.stringify(encode(initial.observed,1).clauses)).toBe(JSON.stringify(encode(other.observed,1).clauses));
    expect(encrypt(0,generateKey(0x1034),getSbox('weak'),1)).toBe(initial.observed[0].cipher);
  });
});
