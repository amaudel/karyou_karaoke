import { betterAuth } from 'better-auth';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import path from 'node:path';

/** @param {{plugins?: any[], sendEmail?: (to: string, subject: string, link: string) => Promise<void>}} options */
export function crearAuth({ plugins = [], sendEmail } = {}) {
  const url = process.env.TURSO_DATABASE_URL || `file:${process.env.KARAOKE_DB || path.join(process.cwd(), 'data', 'karaoke.db')}`;
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  return betterAuth({
    appName: 'Karyou',
    secret,
    baseURL,
    database: { dialect: new LibsqlDialect({ url, authToken }), type: 'sqlite' },
    emailAndPassword: {
      enabled: true, minPasswordLength: 8, maxPasswordLength: 128,
      requireEmailVerification: true, revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url: link }) {
        await sendEmail(user.email, 'Recupera tu contraseña de Karyou', link);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      async sendVerificationEmail({ user, url: link }) {
        await sendEmail(user.email, 'Confirma tu correo de Karyou', link);
      },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 20 },
    plugins,
  });
}
