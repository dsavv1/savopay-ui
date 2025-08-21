const { db } = require("./db");
const rows = db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
console.log(rows);
