export interface Item {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  price: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemInput {
  name: string;
  description?: string | null;
  quantity?: number;
  price?: number;
}

export interface ItemRepository {
  readonly kind: 'postgres' | 'memory';
  findAll(): Promise<Item[]>;
  findById(id: number): Promise<Item | null>;
  create(input: ItemInput): Promise<Item>;
  update(id: number, input: ItemInput): Promise<Item | null>;
  remove(id: number): Promise<boolean>;
}
