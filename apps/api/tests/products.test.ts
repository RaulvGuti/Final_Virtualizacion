import request from "supertest";
import app from "../src/app";

describe("Validaciones de POST /api/products", () => {
  it("rechaza un producto sin nombre", async () => {
    const response = await request(app)
      .post("/api/products")
      .send({ description: "Sin nombre", price: 10, stock: 1 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain(
      "El campo 'name' es obligatorio y no puede estar vacio"
    );
  });

  it("rechaza un producto con nombre vacio", async () => {
    const response = await request(app)
      .post("/api/products")
      .send({ name: "   ", price: 10 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain(
      "El campo 'name' es obligatorio y no puede estar vacio"
    );
  });

  it("rechaza un producto con precio negativo", async () => {
    const response = await request(app)
      .post("/api/products")
      .send({ name: "Producto invalido", price: -5 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain(
      "El campo 'price' no puede ser negativo"
    );
  });

  it("rechaza un producto sin precio", async () => {
    const response = await request(app)
      .post("/api/products")
      .send({ name: "Producto sin precio" });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain(
      "El campo 'price' es obligatorio y debe ser numerico"
    );
  });
});
