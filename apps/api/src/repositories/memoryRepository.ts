import { Item, ItemInput, ItemRepository } from '../types';

/**
 * Repositorio en memoria usado como fallback cuando PostgreSQL no está disponible.
 * Los datos NO persisten entre reinicios del pod.
 */
export class MemoryItemRepository implements ItemRepository {
  readonly kind = 'memory' as const;
  private items = new Map<number, Item>();
  private nextId = 1;

  async findAll(): Promise<Item[]> {
    return [...this.items.values()].sort((a, b) => a.id - b.id);
  }

  async findById(id: number): Promise<Item | null> {
    return this.items.get(id) ?? null;
  }

  async create(input: ItemInput): Promise<Item> {
    const now = new Date().toISOString();
    const item: Item = {
      id: this.nextId++,
      name: input.name,
      description: input.description ?? null,
      quantity: input.quantity ?? 0,
      price: input.price ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(item.id, item);
    return item;
  }

  async update(id: number, input: ItemInput): Promise<Item | null> {
    const current = this.items.get(id);
    if (!current) return null;
    const updated: Item = {
      ...current,
      name: input.name,
      description: input.description ?? null,
      quantity: input.quantity ?? 0,
      price: input.price ?? 0,
      updatedAt: new Date().toISOString(),
    };
    this.items.set(id, updated);
    return updated;
  }

  async remove(id: number): Promise<boolean> {
    return this.items.delete(id);
  }
}
