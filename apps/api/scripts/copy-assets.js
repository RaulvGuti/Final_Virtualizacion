const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "src", "db", "init.sql");
const destinationDir = path.join(__dirname, "..", "dist", "db");
const destination = path.join(destinationDir, "init.sql");

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);

console.log("init.sql copiado a dist/db");
