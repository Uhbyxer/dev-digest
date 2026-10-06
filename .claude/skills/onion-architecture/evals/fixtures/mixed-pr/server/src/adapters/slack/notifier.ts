import type { Notifier, NotifierMessage } from '@devdigest/shared';

export class SlackNotifier implements Notifier {
  constructor(private readonly webhookUrl: string) {}

  async send(msg: NotifierMessage): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `*${msg.title}*\n${msg.body}` }),
    });
    if (!res.ok) throw new Error(`Slack webhook failed: ${res.status}`);
  }
}
