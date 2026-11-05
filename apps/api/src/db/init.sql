CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (name, description, price, stock)
VALUES 
    ('Laptop ASUS ROG Zephyrus', 'Gaming laptop 16GB RAM RTX 4050', 1250.50, 10),
    ('Mouse Gamer RGB', 'Mouse optico de alta precision', 45.00, 25),
    ('Teclado Mecanico RGB', 'Teclado switch azul silencioso', 85.00, 15)
ON CONFLICT DO NOTHING;
