import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import {
  createRegistrationOptions,
  verifyRegistration,
} from './passkey';

dotenv.config();

const app = express();

const registrationChallenges = new Map<number, string>();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const port = Number(process.env.PORT) || 3000;

app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.pinpin.passkey_demo',
        sha256_cert_fingerprints: [
          'BE:05:87:B5:09:26:76:4D:D9:B3:CA:5A:5A:EB:C5:90:32:8A:1C:47:4E:5E:7E:26:72:28:0C:91:9C:A7:ED:76',
        ],
      },
    },
  ]);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
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

    // 暫存 challenge
    registrationChallenges.set(userId, options.challenge);

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

app.post("/passkey/register/verify", async (req, res) => {
  try {
    const { userId, response } = req.body;

    if (!userId || !response) {
      return res.status(400).json({
        error: "userId and response are required",
      });
    }

    const expectedChallenge =
      registrationChallenges.get(userId);

    if (!expectedChallenge) {
      return res.status(400).json({
        error: "Registration challenge not found",
      });
    }

    const verification = await verifyRegistration(
      response,
      expectedChallenge,
    );

    if (!verification.verified) {
      return res.status(400).json({
        verified: false,
      });
    }

    // 驗證成功後，challenge 就可以刪掉
    registrationChallenges.delete(userId);

    res.json({
      verified: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to verify registration",
    });
  }
});
