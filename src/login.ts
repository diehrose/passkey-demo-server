
import { Router } from "express";
import { Pool } from "pg";

import {
  createLoginOptions,
  verifyLogin,
} from "./passkey";

const router = Router();

export function createLoginRouter(
  pool: Pool,
) {

  /**
   * Passkey Login - Options
   */
  router.post(
    "/options",
    async (req, res) => {
      try {
        console.log(
          "========== /passkey/login/options START ==========",
        );

        const { username } = req.body;

        console.log("[1] Request received");
        console.log("username =", username);

        if (!username) {
          return res.status(400).json({
            error: "username is required",
          });
        }

        console.log("[2] Looking up user");

        const userResult =
          await pool.query(
            `
            SELECT id, username
            FROM users
            WHERE username = $1
            `,
            [username],
          );

        const user = userResult.rows[0];

        console.log(
          "[2] User lookup result",
          {
            found: !!user,
            userId: user?.id,
          },
        );

        if (!user) {
          return res.status(404).json({
            error: "User not found",
          });
        }

        console.log(
          "[3] Looking up Passkey credentials",
        );

        const credentialResult =
          await pool.query(
            `
            SELECT credential_id
            FROM passkey_credentials
            WHERE user_id = $1
            `,
            [user.id],
          );

        console.log(
          "[3] Passkey credential count =",
          credentialResult.rows.length,
        );

        if (
          credentialResult.rows.length === 0
        ) {
          return res.status(400).json({
            error:
              "No Passkey credential found",
          });
        }

        console.log(
          "[4] Creating authentication options",
        );

        const options =
          await createLoginOptions(
            pool,
            user.id,
          );

        console.log(
          "[4] Login options created",
        );

        console.log(
          "challenge =",
          options.challenge,
        );

        console.log(
          "[5] Storing login challenge",
        );

        await pool.query(
          `
          INSERT INTO passkey_challenges
            (
              user_id,
              challenge,
              type,
              expires_at
            )
          VALUES
            (
              $1,
              $2,
              $3,
              NOW() + INTERVAL '5 minutes'
            )
          `,
          [
            user.id,
            options.challenge,
            "authentication",
          ],
        );

        console.log(
          "[5] Login challenge stored",
        );

        console.log(
          "========== /passkey/login/options SUCCESS ==========",
        );

        return res.json({
          ...options,
          userId: user.id,
        });
      } catch (error) {
        console.error(
          "========== /passkey/login/options ERROR ==========",
        );

        console.error(error);

        return res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    },
  );

  /**
   * Passkey Login - Verify
   */
  router.post(
    "/verify",
    async (req, res) => {
      try {
        console.log(
          "========== /passkey/login/verify START ==========",
        );

        const {
          userId,
          response,
        } = req.body;

        console.log("[1] Request received");

        console.log(
          "userId =",
          userId,
        );

        console.log(
          "response exists =",
          !!response,
        );

        if (!userId || !response) {
          console.error(
            "[1] Missing userId or response",
          );

          return res.status(400).json({
            error:
              "userId and response are required",
          });
        }

        /**
         * Find latest valid authentication challenge
         */
        console.log(
          "[2] Looking up authentication challenge",
        );

        const challengeResult =
          await pool.query(
            `
            SELECT
              id,
              challenge
            FROM passkey_challenges
            WHERE user_id = $1
              AND type = $2
              AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [
              userId,
              "authentication",
            ],
          );

        const challengeRow =
          challengeResult.rows[0];

        console.log(
          "[2] Challenge lookup result",
          {
            found: !!challengeRow,
            challengeId:
              challengeRow?.id,
          },
        );

        if (!challengeRow) {
          console.error(
            "[2] Authentication challenge NOT FOUND",
          );

          return res.status(400).json({
            error:
              "Authentication challenge not found",
          });
        }

        /**
         * Find credential
         */
        console.log(
          "[3] Looking up Passkey credential",
        );

        const credentialResult =
          await pool.query(
            `
            SELECT
              credential_id,
              public_key,
              counter
            FROM passkey_credentials
            WHERE user_id = $1
              AND credential_id = $2
            `,
            [
              userId,
              response.id,
            ],
          );

        const credential =
          credentialResult.rows[0];

        console.log(
          "[3] Credential lookup result",
          {
            found: !!credential,
            credentialId:
              credential?.credential_id,
            counter:
              credential?.counter,
          },
        );

        if (!credential) {
          console.error(
            "[3] Passkey credential NOT FOUND",
          );

          return res.status(400).json({
            error:
              "Passkey credential not found",
          });
        }

        /**
         * Convert stored public key
         * from Base64 back to Buffer
         */
        const publicKey =
          Buffer.from(
            credential.public_key,
            "base64",
          );

        console.log(
          "[4] Calling verifyAuthenticationResponse",
        );

        const verification =
          await verifyLogin(
            response,
            challengeRow.challenge,
            publicKey,
            Number(credential.counter),
          );

        console.log(
          "[4] Verification completed",
        );

        console.log(
          "verified =",
          verification.verified,
        );

        if (!verification.verified) {
          console.error(
            "[4] Passkey login verification FAILED",
          );

          return res.status(400).json({
            verified: false,
          });
        }

        console.log(
          "[5] Passkey login verification SUCCESS",
        );

        /**
         * Update authenticator counter
         */
        const newCounter =
          verification.authenticationInfo.newCounter;

        console.log(
          "[5] Updating counter",
          {
            oldCounter:
              credential.counter,
            newCounter,
          },
        );

        await pool.query(
          `
          UPDATE passkey_credentials
          SET counter = $1
          WHERE user_id = $2
            AND credential_id = $3
          `,
          [
            newCounter,
            userId,
            credential.credential_id,
          ],
        );

        console.log(
          "[5] Counter updated",
        );

        /**
         * Delete used challenge
         */
        console.log(
          "[6] Deleting used login challenge",
        );

        await pool.query(
          `
          DELETE FROM passkey_challenges
          WHERE id = $1
          `,
          [challengeRow.id],
        );

        console.log(
          "[6] Login challenge deleted",
        );

        console.log(
          "========== /passkey/login/verify SUCCESS ==========",
        );

        return res.json({
          verified: true,
          userId,
        });
      } catch (error) {
        console.error(
          "========== /passkey/login/verify ERROR ==========",
        );

        console.error(error);

        return res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    },
  );

  return router;
}

export default router;