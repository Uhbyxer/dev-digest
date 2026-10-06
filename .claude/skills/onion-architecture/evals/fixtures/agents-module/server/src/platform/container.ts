import type { Notifier, SecretsProvider } from '@devdigest/shared';
import type { Db } from '../db/client.js';
import { EmailNotifier } from '../adapters/notify/email.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';

export interface ContainerOverrides {
  secrets?: SecretsProvider;
  notifier?: Notifier;
}

export interface Container {
  db: Db;
  secrets: SecretsProvider;
  notifier: Notifier;
}

export function buildContainer(db: Db, overrides: ContainerOverrides = {}): Container {
  const secrets = overrides.secrets ?? new LocalSecretsProvider();
  const notifier =
    overrides.notifier ?? new EmailNotifier(secrets.get('SMTP_URL'), secrets.get('NOTIFY_TO'));
  return { db, secrets, notifier };
}
