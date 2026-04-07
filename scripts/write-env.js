const fs = require("fs");
const path = require("path");

const line =
  'DATABASE_URL="postgresql://tif:tif@localhost:5433/traffic_intel?schema=public"\n';
const out = path.join(__dirname, "..", ".env");
fs.writeFileSync(out, line, "utf8");
console.log("Wrote", out);
