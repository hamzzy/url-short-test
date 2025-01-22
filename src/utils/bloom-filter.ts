import { Injectable } from '@nestjs/common';
import Farm from 'farmhash';
import { Worker } from 'worker_threads';
import { createHash } from 'crypto';

@Injectable()
export class EnhancedBloomFilter {
  private readonly bitSet: Uint8Array;
  private readonly bitSetSize: number;
  private readonly numHashFunctions: number;
  private readonly countingArray: Uint32Array; // For counting bloom filter capability
  private readonly workers: Worker[] = [];
  private readonly useParallel: boolean;

  constructor(
    capacity: number,
    falsePositiveRate: number = 0.01,
    options: {
      counting?: boolean;
      parallel?: boolean;
      numWorkers?: number;
    } = {},
  ) {
    // Optimize bit set size calculation for better accuracy
    this.bitSetSize = this.calculateOptimalBitSize(capacity, falsePositiveRate);
    this.numHashFunctions = this.calculateOptimalHashFunctions(capacity);

    // Use ArrayBuffer for better memory efficiency
    const buffer = new ArrayBuffer(Math.ceil(this.bitSetSize / 8));
    this.bitSet = new Uint8Array(buffer);

    // Initialize counting array if counting bloom filter is requested
    if (options.counting) {
      this.countingArray = new Uint32Array(this.bitSetSize);
    }

    // Setup parallel processing if requested
    this.useParallel = options.parallel && options.numWorkers > 1;
    if (this.useParallel) {
      this.initializeWorkers(options.numWorkers || 4);
    }
  }

  private calculateOptimalBitSize(
    capacity: number,
    falsePositiveRate: number,
  ): number {
    // More precise calculation using the optimal bits per element
    const bitsPerElement = Math.ceil(
      -(Math.log(falsePositiveRate) / (Math.log(2) * Math.log(2))),
    );
    return Math.ceil(capacity * bitsPerElement);
  }

  private calculateOptimalHashFunctions(capacity: number): number {
    // Optimize number of hash functions based on bit set size and capacity
    return Math.max(1, Math.round((this.bitSetSize / capacity) * Math.log(2)));
  }

  private initializeWorkers(numWorkers: number): void {
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        const Farm = require('farmhash');
        
        parentPort.on('message', ({ key, seed, bitSetSize }) => {
          const hash = Math.abs(Farm.hash32WithSeed(key, seed) % bitSetSize);
          parentPort.postMessage(hash);
        });
      `,
        { eval: true },
      );
      this.workers.push(worker);
    }
  }

  private hash(key: string, seed: number): number {
    // Use multiple hash functions for better distribution
    switch (seed % 3) {
      case 0:
        return Math.abs(Farm.hash32WithSeed(key, seed) % this.bitSetSize);
      case 1:
        return Math.abs(Farm.fingerprint32(key + seed) % this.bitSetSize);
      case 2:
        const md5 = createHash('md5')
          .update(key + seed)
          .digest();
        return Math.abs(md5.readUInt32LE(0) % this.bitSetSize);
    }
  }

  private async parallelHash(key: string): Promise<number[]> {
    const promises = this.workers.map(
      (worker, index) =>
        new Promise<number>((resolve) => {
          worker.once('message', resolve);
          worker.postMessage({ key, seed: index, bitSetSize: this.bitSetSize });
        }),
    );
    return Promise.all(promises);
  }

  async add(key: string): Promise<void> {
    if (this.useParallel) {
      const hashes = await this.parallelHash(key);
      hashes.forEach((bitPosition) => {
        this.setBit(bitPosition);
        if (this.countingArray) {
          this.countingArray[bitPosition]++;
        }
      });
    } else {
      for (let i = 0; i < this.numHashFunctions; i++) {
        const bitPosition = this.hash(key, i);
        this.setBit(bitPosition);
        if (this.countingArray) {
          this.countingArray[bitPosition]++;
        }
      }
    }
  }

  async test(key: string): Promise<boolean> {
    if (this.useParallel) {
      const hashes = await this.parallelHash(key);
      return hashes.every((bitPosition) => this.getBit(bitPosition));
    }

    for (let i = 0; i < this.numHashFunctions; i++) {
      const bitPosition = this.hash(key, i);
      if (!this.getBit(bitPosition)) {
        return false;
      }
    }
    return true;
  }

  private setBit(position: number): void {
    const byteIndex = Math.floor(position / 8);
    const bitOffset = position % 8;
    this.bitSet[byteIndex] |= 1 << bitOffset;
  }

  private getBit(position: number): boolean {
    const byteIndex = Math.floor(position / 8);
    const bitOffset = position % 8;
    return (this.bitSet[byteIndex] & (1 << bitOffset)) !== 0;
  }

  async remove(key: string): Promise<boolean> {
    if (!this.countingArray) {
      throw new Error(
        'Remove operation is only supported for counting Bloom filters',
      );
    }

    const hashes = this.useParallel
      ? await this.parallelHash(key)
      : Array.from({ length: this.numHashFunctions }, (_, i) =>
          this.hash(key, i),
        );

    // Check if element exists first
    if (!hashes.every((pos) => this.countingArray[pos] > 0)) {
      return false;
    }

    // Decrement counters
    hashes.forEach((pos) => {
      this.countingArray[pos]--;
      if (this.countingArray[pos] === 0) {
        const byteIndex = Math.floor(pos / 8);
        const bitOffset = pos % 8;
        this.bitSet[byteIndex] &= ~(1 << bitOffset);
      }
    });

    return true;
  }

  // Estimate current fill ratio
  getFillRatio(): number {
    let setBits = 0;
    for (let i = 0; i < this.bitSet.length; i++) {
      setBits += this.popCount(this.bitSet[i]);
    }
    return setBits / this.bitSetSize;
  }

  // Calculate number of 1 bits in a byte
  private popCount(x: number): number {
    x = x - ((x >> 1) & 0x55);
    x = (x & 0x33) + ((x >> 2) & 0x33);
    x = (x + (x >> 4)) & 0x0f;
    return x;
  }

  // Serialize the Bloom filter for persistence
  serialize(): Buffer {
    const headerSize = 16; // 4 bytes each for bitSetSize, numHashFunctions, options
    const dataSize = this.bitSet.length;
    const countingSize = this.countingArray ? this.countingArray.length * 4 : 0;

    const buffer = Buffer.alloc(headerSize + dataSize + countingSize);

    // Write header
    buffer.writeUInt32LE(this.bitSetSize, 0);
    buffer.writeUInt32LE(this.numHashFunctions, 4);
    buffer.writeUInt32LE(this.countingArray ? 1 : 0, 8);
    buffer.writeUInt32LE(dataSize, 12);

    // Write bit array
    buffer.set(this.bitSet, headerSize);

    // Write counting array if present
    if (this.countingArray) {
      const countingBuffer = Buffer.from(this.countingArray.buffer);
      buffer.set(countingBuffer, headerSize + dataSize);
    }

    return buffer;
  }

  // Create a Bloom filter from serialized data
  static deserialize(buffer: Buffer): EnhancedBloomFilter {
    const bitSetSize = buffer.readUInt32LE(0);
    const numHashFunctions = buffer.readUInt32LE(4);
    const hasCounting = buffer.readUInt32LE(8);
    const dataSize = buffer.readUInt32LE(12);

    const filter = new EnhancedBloomFilter(
      bitSetSize / numHashFunctions,
      0.01,
      {
        counting: hasCounting === 1,
      },
    );

    // Restore bit array
    const bitArray = buffer.slice(16, 16 + dataSize);
    filter.bitSet.set(bitArray);

    // Restore counting array if present
    if (hasCounting) {
      const countingArray = new Uint32Array(buffer.slice(16 + dataSize).buffer);
      filter.countingArray.set(countingArray);
    }

    return filter;
  }

  // Clean up workers on service shutdown
  destroy(): void {
    this.workers.forEach((worker) => worker.terminate());
  }
}
