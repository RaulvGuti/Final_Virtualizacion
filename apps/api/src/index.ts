import "dotenv/config";
import app from "./app";
import { initDatabase } from "./db/init";

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`KubeLab API escuchando en el puerto ${PORT}`);
  void initDatabase();
});
