const readEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
};

export const getSupabaseUrl = () => readEnv("NEXT_PUBLIC_SUPABASE_URL");
export const getSupabaseAnonKey = () => readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const getSupabaseServiceRoleKey = () => readEnv("SUPABASE_SERVICE_ROLE_KEY");
export const getBaseAppUrl = () => readEnv("NEXT_PUBLIC_SITE_URL");
