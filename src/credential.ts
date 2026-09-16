
import { Router } from "express";
import { Pool } from "pg";

const router = Router();

export function createCredentialRouter(
  pool: Pool,
) {

  /**
   * GET /passkey/credentials
   *
   * Query:
   * ?username=test@example.com
   *
   * 取得指定使用者的所有 Passkey
   */
  router.get(
    "/",
    async (req, res) => {
      try {
        const { username } = req.query;

        console.log(
          "========== /passkey/credentials START ==========",
        );

        console.log(
          "[1] username =",
          username,
        );

        if (
          typeof username !== "string" ||
          !username
        ) {
          return res.status(400).json({
            error: "username is required",
          });
        }

        /**
         * Find user
         */
        const userResult =
          await pool.query(
            `
            SELECT
              id,
              username
            FROM users
            WHERE username = $1
            `,
            [username],
          );

        const user =
          userResult.rows[0];

        console.log(
          "[2] User lookup",
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
         * Find credentials
         */
        const credentialResult =
          await pool.query(
            `
            SELECT
              id,
              credential_id,
              counter
            FROM passkey_credentials
            WHERE user_id = $1
            ORDER BY id
            `,
            [user.id],
          );

        console.log(
          "[3] Credential count =",
          credentialResult.rows.length,
        );

        console.log(
          "========== /passkey/credentials SUCCESS ==========",
        );

        return res.json({
          userId: user.id,
          username: user.username,
          credentials:
            credentialResult.rows,
        });

      } catch (error) {
        console.error(
          "========== /passkey/credentials ERROR ==========",
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
   * DELETE /passkey/credentials/:credentialId
   *
   * Query:
   * ?username=test@example.com
   *
   * 刪除指定使用者的 Passkey
   */
  router.delete(
    "/:credentialId",
    async (req, res) => {
      try {
        const {
          credentialId,
        } = req.params;

        const {
          username,
        } = req.query;

        console.log(
          "========== /passkey/credentials DELETE START ==========",
        );

        console.log(
          "[1] username =",
          username,
        );

        console.log(
          "[1] credentialId =",
          credentialId,
        );

        if (
          typeof username !== "string" ||
          !username
        ) {
          return res.status(400).json({
            error: "username is required",
          });
        }

        if (!credentialId) {
          return res.status(400).json({
            error:
              "credentialId is required",
          });
        }

        /**
         * Find user
         */
        const userResult =
          await pool.query(
            `
            SELECT
              id
            FROM users
            WHERE username = $1
            `,
            [username],
          );

        const user =
          userResult.rows[0];

        console.log(
          "[2] User lookup",
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
         * Delete credential
         *
         * IMPORTANT:
         * user_id + credential_id
         *
         * 避免刪到其他使用者的 Credential
         */
        const deleteResult =
          await pool.query(
            `
            DELETE FROM passkey_credentials
            WHERE user_id = $1
              AND credential_id = $2
            RETURNING id
            `,
            [
              user.id,
              credentialId,
            ],
          );

        if (
          deleteResult.rows.length === 0
        ) {
          console.log(
            "[3] Credential NOT FOUND",
          );

          return res.status(404).json({
            error:
              "Passkey credential not found",
          });
        }

        console.log(
          "[3] Credential deleted",
          {
            id:
              deleteResult.rows[0].id,
          },
        );

        console.log(
          "========== /passkey/credentials DELETE SUCCESS ==========",
        );

        return res.json({
          deleted: true,
        });

      } catch (error) {
        console.error(
          "========== /passkey/credentials DELETE ERROR ==========",
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