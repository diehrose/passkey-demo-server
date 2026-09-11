import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
} from '@simplewebauthn/server';
import { Pool } from 'pg';

const rpName = 'Passkey Demo';
const rpID = 'passkey-demo-server-1.onrender.com';

export async function createRegistrationOptions(
  pool: Pool,
  username: string,
) {
  // 1. 找使用者
  const userResult = await pool.query(
    'SELECT id, username FROM users WHERE username = $1',
    [username],
  );

  let userId: number;

  if (userResult.rows.length === 0) {
    // 使用者不存在就建立
    const insertResult = await pool.query(
      'INSERT INTO users (username) VALUES ($1) RETURNING id',
      [username],
    );

    userId = insertResult.rows[0].id;
  } else {
    userId = userResult.rows[0].id;
  }

  // 2. 找這個使用者已經存在的 Passkey
  const credentialResult = await pool.query(
    `
    SELECT credential_id
    FROM passkey_credentials
    WHERE user_id = $1
    `,
    [userId],
  );

  // 3. 組 excludeCredentials
  const excludeCredentials = credentialResult.rows.map(
    (row) => ({
      id: row.credential_id,
    }),
  );

  // 4. 產生 WebAuthn Registration Options
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: username,

    attestationType: 'none',

    excludeCredentials,

    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  return {
    options,
    userId,
  };
}

export async function verifyRegistration(
  response: any,
  expectedChallenge: string,
) {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: [
      'android:apk-key-hash:vgWHtQkmdk3Zs8paWuvFkDKKHEdOXn4mcigMkZyn7XY',
      'https://passkey-demo-server-1.onrender.com'
    ],
    expectedRPID: rpID,
  });

  return verification;
}


export async function createLoginOptions(
  pool: Pool,
  userId: number,
  username: string,
) {
  const credentialResult =
    await pool.query(
      `
      SELECT credential_id
      FROM passkey_credentials
      WHERE user_id = $1
      `,
      [userId],
    );

  const allowCredentials =
    credentialResult.rows.map(
      (row) => ({
        id: row.credential_id,
        type: "public-key" as const,
      }),
    );

  const options =
    await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    });

  return options;
}