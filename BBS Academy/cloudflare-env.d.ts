declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ACADEMY_ADMIN_EMAIL?: string;
    ACADEMY_QUIZ_ANSWERS?: string;
  }
}
