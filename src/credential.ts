
import { Router } from "express";
import { Pool } from "pg";

const router = Router();

export function createCredentialRouter(
  pool: Pool,
) {

  /**
   * POST /passkey/credentials/list
   *
   * Request:
   * {
   *   "username": "test@example.com"
   * }
   *
   * 取得指定使用者的所有 Passkey
   */
 router.post("/list", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        error: "username is required",
      });
    }

    // 找 user
    const userResult = await pool.query(
      `
      SELECT id
      FROM users
      WHERE username = $1
      `,
      [username],
    );

    const user = userResult.rows[0];

    // User 不存在
    // → 不視為錯誤，直接回空的 credentials
    if (!user) {
      return res.json({
        userId: null,
        username,
        credentials: [],
      });
    }

    // User 存在，查詢 Passkey
    const credentialResult = await pool.query(
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

    return res.json({
      userId: user.id,
      username,
      credentials: credentialResult.rows,
    });

  } catch (error) {
    console.error(
      "GET credentials error:",
      error,
    );

    return res.status(500).json({
      error: "internal server error",
    });
  }
});


  /**
   * POST /passkey/credentials/delete
   *
   * Request:
   * {
   *   "username": "test@example.com",
   *   "credentialId": "xxx..."
   * }
   *
   * 刪除指定使用者的 Passkey
   */
  router.post(
    "/delete",
    async (req, res) => {
      try {
        console.log(
          "========== /passkey/credentials/delete START ==========",
        );

        const {
          username,
          credentialId,
        } = req.body;

        console.log("[1] Request received");

        console.log(
          "username =",
          username,
        );

        console.log(
          "credentialId =",
          credentialId,
        );

        if (!username) {
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
        console.log("[2] Looking up user");

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
         * Delete credential
         *
         * IMPORTANT:
         * user_id + credential_id
         *
         * 避免刪到其他使用者的 Credential
         */
        console.log(
          "[3] Deleting Passkey credential",
        );

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
          "========== /passkey/credentials/delete SUCCESS ==========",
        );

        return res.json({
          deleted: true,
        });

      } catch (error) {
        console.error(
          "========== /passkey/credentials/delete ERROR ==========",
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