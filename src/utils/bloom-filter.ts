import { Injectable } from '@nestjs/common';
import Farm from 'farmhash';

@Injectable()
export class BloomFilter {
  private bitSet: Uint8Array;
  private bitSetSize: number;
  private numHashFunctions: number;
  constructor(capacity: number, falsePositiveRate: number = 0.02) {
    this.bitSetSize = Math.ceil(
      (-capacity * Math.log(falsePositiveRate)) / (Math.log(2) * Math.log(2)),
    );
    this.numHashFunctions = Math.round(
      (this.bitSetSize / capacity) * Math.log(2),
    );
    this.bitSet = new Uint8Array(Math.ceil(this.bitSetSize / 8));
  }
  private hash(key: string, seed: number): number {
    return Math.abs(Farm.hash32(key + seed) % this.bitSetSize);
  }

  add(key: string): void {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const bitPosition = this.hash(key, i);
      this.bitSet[Math.floor(bitPosition / 8)] |= 1 << bitPosition % 8;
    }
  }
  test(key: string): boolean {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const bitPosition = this.hash(key, i);
      if (
        (this.bitSet[Math.floor(bitPosition / 8)] & (1 << bitPosition % 8)) ===
        0
      ) {
        return false;
      }
    }
    return true;
  }
}
