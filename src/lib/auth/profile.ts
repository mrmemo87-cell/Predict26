import type { User } from "@supabase/supabase-js";

const getDisplayName = (user: User) => {
  const metadata = user.user_metadata ?? {};

  return (
    metadata.full_name ??
    metadata.name ??
    metadata.display_name ??
    user.email?.split("@")[0] ??
    "Predict26 Player"
  );
};

const getAvatarUrl = (user: User) => {
  const metadata = user.user_metadata ?? {};

  return metadata.avatar_url ?? metadata.picture ?? null;
};

export const getDefaultUsername = (userId: string) => `user_${userId.slice(0, 8)}`;

export const getProfilePayload = (user: User) => ({
  id: user.id,
  email: user.email ?? null,
  display_name: getDisplayName(user),
  avatar_url: getAvatarUrl(user),
  username: getDefaultUsername(user.id),
});
