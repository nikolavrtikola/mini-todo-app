const express = require("express");
const { Pool } = require("pg");
const client = require("prom-client");

const app = express();

app.use(express.json());

const PORT = 3000;

const requiredEnv = ["DB_HOST", "DB_USER", "DB_PASSWORD"];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432) ,
  user: process.env.DB_USER ,
  password: process.env.DB_PASSWORD ,
  database: process.env.DB_NAME || "todo"
});

// Prometheus metrics
client.collectDefaultMetrics();

const httpRequests = new client.Counter({
  name: "todo_http_requests_total",
  help: "Total number of HTTP requests"
});

app.use((req, res, next) => {
  httpRequests.inc();
  next();
});

// Initialize database
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE
    )
  `);
}

// Get all todos
app.get("/api/todos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM todos ORDER BY id"
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Database error"
    });
  }
});

// Create todo
app.post("/api/todos", async (req, res) => {
  try {
    const { title } = req.body;

    const result = await pool.query(
      "INSERT INTO todos (title) VALUES ($1) RETURNING *",
      [title]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Database error"
    });
  }
});

// Delete todo
app.delete("/api/todos/:id", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM todos WHERE id = $1",
      [req.params.id]
    );

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Database error"
    });
  }
});

// Prometheus endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);

  res.end(await client.register.metrics());
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

async function start() {
  try {
    await initDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

start();