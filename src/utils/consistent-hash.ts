import Farm from 'farmhash';

interface Node {
  id: string;
  virtualNodes: number[];
}
export class ConsistentHash {
  private nodes: Node[] = [];
  private ring: string[] = [];
  private ringSize: number = 0;
  private virtualNodesPerNode: number = 10;
  private hashFn = (key: string) => Farm.hash32(key);
  private lookupTable: Map<number, string> = new Map();

  constructor(nodes: string[], virtualNodesPerNode: number = 10) {
    this.virtualNodesPerNode = virtualNodesPerNode;
    this.addNodes(nodes);
  }
  private addNodes(nodeIds: string[]) {
    this.nodes = nodeIds.map((nodeId) => ({
      id: nodeId,
      virtualNodes: Array.from({ length: this.virtualNodesPerNode }, (_, i) =>
        this.hashFn(`${nodeId}-${i}`),
      ),
    }));
    this.rebuildRing();
  }

  private rebuildRing() {
    this.ring = this.nodes.reduce((acc, node) => {
      node.virtualNodes.forEach((virtualNode) => {
        acc.push(`${virtualNode}-${node.id}`);
      });
      return acc;
    }, []);

    this.ring.sort((a, b) => {
      const aHash = Number(a.split('-')[0]);
      const bHash = Number(b.split('-')[0]);
      return aHash - bHash;
    });
    this.ringSize = this.ring.length;
    this.createLookupTable();
  }

  private createLookupTable() {
    this.lookupTable = new Map();
    for (const entry of this.ring) {
      const hash = Number(entry.split('-')[0]);
      this.lookupTable.set(hash, entry);
    }
  }

  getNode(key: string): string {
    if (this.nodes.length === 0) {
      throw new Error('No nodes in consistent hash');
    }

    const hash = this.hashFn(key);

    let node = this.lookupTable.get(hash);
    if (node) {
      return node.split('-')[1];
    }

    let low = 0;
    let high = this.ringSize - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const ringHash = Number(this.ring[mid].split('-')[0]);

      if (ringHash === hash) {
        node = this.ring[mid];
        break;
      } else if (ringHash < hash) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (!node) {
      node = this.ring[0];
    }
    return node.split('-')[1];
  }
}
