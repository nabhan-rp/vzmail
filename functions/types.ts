export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface KVNamespace {
  get(key: string, type?: 'text' | 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
}

export interface CloudflareEnv {
  DB?: D1Database;
  PORTAL_KV?: KVNamespace;
  ASSETS_BUCKET?: R2Bucket;
  APP_DOMAIN?: string;
  AUTH0_DOMAIN?: string;
  ACCOUNT_DASHBOARD_URL?: string;
  SPONSOR_DOMAIN?: string;
}

export interface PagesContext {
  request: Request;
  env: CloudflareEnv;
  params: Record<string, string | string[]>;
  next: () => Promise<Response>;
}

export type PagesFunction = (context: PagesContext) => Promise<Response>;
