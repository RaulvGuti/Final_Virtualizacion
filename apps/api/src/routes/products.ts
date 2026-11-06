import { Router, Request, Response } from "express";
import { pool } from "../config/db";

const router = Router();

interface ProductBody {
  name?: unknown;
  description?: unknown;
  price?: unknown;
  stock?: unknown;
}

interface ProductRow {
  id: number;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  created_at: string;
}

function serializeProduct(row: ProductRow) {
  return {
    ...row,
    price: Number(row.price),
  };
}

function validateProduct(body: ProductBody, partial = false): string[] {
  const errors: string[] = [];
  const has = (key: keyof ProductBody) =>
    Object.prototype.hasOwnProperty.call(body ?? {}, key);

  if (!partial || has("name")) {
    if (typeof body?.name !== "string" || body.name.trim() === "") {
      errors.push("El campo 'name' es obligatorio y no puede estar vacio");
    }
  }

  if (!partial || has("price")) {
    if (typeof body?.price !== "number" || Number.isNaN(body.price)) {
      errors.push("El campo 'price' es obligatorio y debe ser numerico");
    } else if (body.price < 0) {
      errors.push("El campo 'price' no puede ser negativo");
    }
  }

  if (has("stock")) {
    if (
      typeof body?.stock !== "number" ||
      !Number.isInteger(body.stock) ||
      body.stock < 0
    ) {
      errors.push("El campo 'stock' debe ser un entero no negativo");
    }
  }

  if (
    has("description") &&
    body?.description !== null &&
    typeof body?.description !== "string"
  ) {
    errors.push("El campo 'description' debe ser texto");
  }

  return errors;
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<ProductRow>(
      "SELECT * FROM products ORDER BY id ASC"
    );
    res.json(result.rows.map(serializeProduct));
  } catch (err) {
    res.status(500).json({ error: "Error al obtener los productos" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "El id debe ser un entero positivo" });
    return;
  }

  try {
    const result = await pool.query<ProductRow>(
      "SELECT * FROM products WHERE id = $1",
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    res.json(serializeProduct(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Error al obtener el producto" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as ProductBody;
  const errors = validateProduct(body);

  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const { name, description = null, price, stock = 0 } = body;

  try {
    const result = await pool.query<ProductRow>(
      `INSERT INTO products (name, description, price, stock)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [(name as string).trim(), description, price, stock]
    );

    res.status(201).json(serializeProduct(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Error al crear el producto" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "El id debe ser un entero positivo" });
    return;
  }

  const body = (req.body ?? {}) as ProductBody;
  const errors = validateProduct(body, true);

  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    values.push((body.name as string).trim());
    fields.push(`name = $${values.length}`);
  }
  if (body.description !== undefined) {
    values.push(body.description);
    fields.push(`description = $${values.length}`);
  }
  if (body.price !== undefined) {
    values.push(body.price);
    fields.push(`price = $${values.length}`);
  }
  if (body.stock !== undefined) {
    values.push(body.stock);
    fields.push(`stock = $${values.length}`);
  }

  if (fields.length === 0) {
    res.status(400).json({ error: "No se enviaron campos para actualizar" });
    return;
  }

  values.push(id);

  try {
    const result = await pool.query<ProductRow>(
      `UPDATE products SET ${fields.join(", ")} WHERE id = $${
        values.length
      } RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    res.json(serializeProduct(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar el producto" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "El id debe ser un entero positivo" });
    return;
  }

  try {
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar el producto" });
  }
});

export default router;
