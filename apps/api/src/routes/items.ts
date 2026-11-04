import { NextFunction, Request, Response, Router } from 'express';
import { withRepository } from '../db';
import { ItemInput } from '../types';

export const itemsRouter = Router();

type Handler = (req: Request, res: Response) => Promise<void>;
const asyncHandler =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Valida el body y devuelve el input normalizado o una lista de errores. */
function validateItem(body: unknown): { value?: ItemInput; errors?: string[] } {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.name !== 'string' || b.name.trim() === '') errors.push('"name" es obligatorio y debe ser texto');
  else if (b.name.length > 255) errors.push('"name" no puede superar 255 caracteres');

  if (b.description !== undefined && b.description !== null && typeof b.description !== 'string')
    errors.push('"description" debe ser texto');

  if (b.quantity !== undefined && (!Number.isInteger(b.quantity) || (b.quantity as number) < 0))
    errors.push('"quantity" debe ser un entero >= 0');

  if (b.price !== undefined && (typeof b.price !== 'number' || !Number.isFinite(b.price) || b.price < 0))
    errors.push('"price" debe ser un número >= 0');

  if (errors.length) return { errors };
  return {
    value: {
      name: (b.name as string).trim(),
      description: (b.description as string | null | undefined) ?? null,
      quantity: (b.quantity as number | undefined) ?? 0,
      price: (b.price as number | undefined) ?? 0,
    },
  };
}

itemsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await withRepository((r) => r.findAll());
    res.json({ data: items, count: items.length });
  }),
);

itemsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const item = await withRepository((r) => r.findById(id));
    if (!item) {
      res.status(404).json({ error: `Item ${id} no encontrado` });
      return;
    }
    res.json({ data: item });
  }),
);

itemsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { value, errors } = validateItem(req.body);
    if (errors) {
      res.status(400).json({ error: 'Validación fallida', details: errors });
      return;
    }
    const item = await withRepository((r) => r.create(value!));
    res.status(201).location(`/api/v1/items/${item.id}`).json({ data: item });
  }),
);

itemsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const { value, errors } = validateItem(req.body);
    if (errors) {
      res.status(400).json({ error: 'Validación fallida', details: errors });
      return;
    }
    const item = await withRepository((r) => r.update(id, value!));
    if (!item) {
      res.status(404).json({ error: `Item ${id} no encontrado` });
      return;
    }
    res.json({ data: item });
  }),
);

itemsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const deleted = await withRepository((r) => r.remove(id));
    if (!deleted) {
      res.status(404).json({ error: `Item ${id} no encontrado` });
      return;
    }
    res.status(204).end();
  }),
);
