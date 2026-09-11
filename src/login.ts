
import { Router } from "express";
import { Pool } from "pg";

import { createLoginOptions } from "./passkey";

const router = Router();

export function createLoginRouter(pool: Pool) {

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
          console.error(
            "[1] username is required",
          );

          return res.status(400).json({
            error: "username is required",
          });
        }

        /**
         * Find user
         */
        console.log(
          "[2] Looking up user",
        );

        const userResult = await pool.query(
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

        /**
         * Find user's Passkey credentials
         */
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

        /**
         * Create login options
         */
        console.log(
          "[4] Creating authentication options",
        );

        const options =
          await createLoginOptions(
            pool,
            user.id,
            username,
          );

        console.log(
          "[4] Login options created",
        );

        console.log(
          "challenge =",
          options.challenge,
        );

        /**
         * Store login challenge
         */
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

  return router;
}