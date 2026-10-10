import type { Notifier, NotifierMessage } from '@devdigest/shared';

export class EmailNotifier implements Notifier {
  constructor(
    private readonly smtpUrl: string,
    private readonly to: string,
  ) {}

  async send(msg: NotifierMessage): Promise<void> {
    const { createTransport } = await import('nodemailer');
    await createTransport(this.smtpUrl).sendMail({ to: this.to, subject: msg.title, text: msg.body });
  }
}
