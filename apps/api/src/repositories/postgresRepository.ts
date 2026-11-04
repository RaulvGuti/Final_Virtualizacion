import { Pool } from 'pg';
import { Item, ItemInput, ItemRepository } from '../types';

interface ItemRow {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  price: string; // NUMERIC llega como string desde pg
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, name, description, quantity, price, created_at, updated_at';

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    price: Number(row.price),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresItemRepository implements ItemRepository {
  readonly kind = 'postgres' as const;

  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<Item[]> {
    const { rows } = await this.pool.query<ItemRow>(`SELECT ${COLUMNS} FROM items ORDER BY id`);
    return rows.map(toItem);
  }

  async findById(id: number): Promise<Item | null> {
    const { rows } = await this.pool.query<ItemRow>(`SELECT ${COLUMNS} FROM items WHERE id = $1`, [id]);
    return rows[0] ? toItem(rows[0]) : null;
  }

  async create(input: ItemInput): Promise<Item> {
    const { rows } = await this.pool.query<ItemRow>(
      `INSERT INTO items (name, description, quantity, price)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.name, input.description ?? null, input.quantity ?? 0, input.price ?? 0],
    );
    return toItem(rows[0]);
  }

  async update(id: number, input: ItemInput): Promise<Item | null> {
    const { rows } = await this.pool.query<ItemRow>(
      `UPDATE items
          SET name = $2, description = $3, quantity = $4, price = $5, updated_at = NOW()
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [id, input.name, input.description ?? null, input.quantity ?? 0, input.price ?? 0],
    );
    return rows[0] ? toItem(rows[0]) : null;
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM items WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
