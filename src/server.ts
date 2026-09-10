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

    // 存 challenge
    await pool.query(
        `
        INSERT INTO passkey_challenges
            (user_id, challenge, type, expires_at)
        VALUES
            ($1, $2, $3, NOW() + INTERVAL '5 minutes')
        `,
        [
            userId,
            options.challenge,
            "registration",
        ],
    );
    console.log(
      "[REGISTER OPTIONS] challenge stored",
      {
        userId,
        challenge: options.challenge,
      }
    );

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
    console.log("========== /passkey/register/verify START ==========");

    const { userId, response } = req.body;

    console.log("[1] Request received");
    console.log("userId =", userId);
    console.log("response exists =", !!response);

    if (!userId || !response) {
      console.error("[1] Missing userId or response");

      return res.status(400).json({
        error: "userId and response are required",
      });
    }

    console.log(
        "[2] Looking up registration challenge",
      );

    /**
       * Find the latest valid registration challenge.
       *
       * Challenge:
       * - belongs to this user
       * - must be registration type
       * - must not be expired
       */  
    const challengeResult = await pool.query(
        `
        SELECT id, challenge
        FROM passkey_challenges
        WHERE user_id = $1
          AND type = $2
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [
            userId,
            "registration",
        ],
    );

    const challengeRow = challengeResult.rows[0];

    console.log("[2] Challenge lookup result", {
        found: !!challengeRow,
        challengeId: challengeRow?.id,
    });

    if (!challengeRow) {
      console.error(
        "[2] Registration challenge NOT FOUND"
      );

      return res.status(400).json({
        error: "Registration challenge not found",
      });
    }

    console.log("[3] Calling verifyRegistration");

    const expectedChallenge =
        challengeRow.challenge;

    const verification = await verifyRegistration(
      response,
      expectedChallenge,
    );

    console.log("[3] Verification completed");
    console.log(
      "verified =",
      verification.verified
    );

    if (!verification.verified) {
      console.error(
        "[3] Passkey verification FAILED"
      );

      return res.status(400).json({
        verified: false,
      });
    }

    console.log(
      "[4] Verification SUCCESS - deleting challenge"
    );

    // 驗證成功後，challenge 就可以刪掉
     await pool.query(
        `
        DELETE FROM passkey_challenges
        WHERE id = $1
        `,
        [challengeRow.id],
      );

    console.log(
      "========== /passkey/register/verify SUCCESS =========="
    );

    res.json({
      verified: true,
    });
  } catch (error) {
    console.error(
      "========== /passkey/register/verify ERROR =========="
    );

    console.error(error);

    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : String(error),
    });
  }
});