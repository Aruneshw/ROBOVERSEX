import { z } from "zod";

const envSchema = z.object({
  // External APIs
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  
  // App Config
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  
  // Judge Config
  JUDGE_URL: z.string().url().default("http://localhost:8080"),
  
  // Environment
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  JUDGE_URL: process.env.JUDGE_URL,
  NODE_ENV: process.env.NODE_ENV,
});
