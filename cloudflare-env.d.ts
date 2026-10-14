declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CORPUS_IMPORT_TOKEN?: string;
  }
}
