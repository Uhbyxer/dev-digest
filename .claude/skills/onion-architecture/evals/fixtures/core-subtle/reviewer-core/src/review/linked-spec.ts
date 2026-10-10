import { request } from 'undici';

export async function fetchLinkedSpec(url: string): Promise<string | null> {
  const res = await request(url, { method: 'GET', headersTimeout: 5000 });
  if (res.statusCode !== 200) return null;
  const text = await res.body.text();
  return text.length > 20000 ? text.slice(0, 20000) : text;
}
