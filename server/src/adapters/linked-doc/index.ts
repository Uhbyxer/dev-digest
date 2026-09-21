export { fetchLinkedDoc, type FetchedDoc } from './fetcher.js';

/** Small interface so the container/tests can inject a fake fetcher. */
export interface LinkedDocFetcher {
  fetchLinkedDoc(url: string): Promise<{ text: string } | undefined>;
}
