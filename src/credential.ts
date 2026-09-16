import { Router } from "express";
import { Pool } from "pg";

const router = Router();

export function createCredentialRouter(
  pool: Pool,
) {
  /**
   * GET /passkey/credentials
   *
   * 取得指定使用者的所有 Passkey
   */
  router.get(
    "/",
    async (req, res) => {
      try {
        const { userId } = req.query;

        if (!userId) {
          return res.status(400).json({
            error: "userId is required",
          });
        }

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
            [userId],
          );

        return res.json({
          userId,
          credentials: credentialResult.rows,
        });
      } catch (error) {
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
   * 刪除指定使用者的 Passkey
   */
  router.delete(
    "/:credentialId",
    async (req, res) => {
      try {
        const { credentialId } = req.params;
        const { userId } = req.query;

        if (!userId || !credentialId) {
          return res.status(400).json({
            error:
              "userId and credentialId are required",
          });
        }

        const deleteResult =
          await pool.query(
            `
            DELETE FROM passkey_credentials
            WHERE user_id = $1
              AND credential_id = $2
            RETURNING id
            `,
            [
              userId,
              credentialId,
            ],
          );

        if (
          deleteResult.rows.length === 0
        ) {
          return res.status(404).json({
            error:
              "Passkey credential not found",
          });
        }

        return res.json({
          deleted: true,
        });
      } catch (error) {
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