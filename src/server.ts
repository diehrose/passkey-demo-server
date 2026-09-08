import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { createRegistrationOptions } from './passkey';

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      status: "ok",
      database: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: "error",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});


app.post("/passkey/register/options", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        error: "username is required",
      });
    }

    const { options, userId } =
      await createRegistrationOptions(pool, username);

    res.json({
      ...options,
      userId,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create registration options",
    });
  }
});