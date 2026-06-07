import type { User } from "@supabase/supabase-js";

type ProfilePayload = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  username: string;
};

function getStringMetadataValue(
  metadata: User["user_metadata"],
  keys: string[]
) {
  for (const key of keys) {
    const value = metadata?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export const getDefaultUsername = (userId: string) =>
  `user_${userId.slice(0, 8)}`;

export const getProfilePayload = (user: User): ProfilePayload => {
  const displayName =
    getStringMetadataValue(user.user_metadata, [
      "full_name",
      "name",
      "display_name",
    ]) ??
    user.email?.split("@")[0] ??
    "Predict26 Player";
  const avatarUrl = getStringMetadataValue(user.user_metadata, [
    "avatar_url",
    "picture",
  ]);
  const email =
    user.email ?? getStringMetadataValue(user.user_metadata, ["email"]);
  const username =
    getStringMetadataValue(user.user_metadata, [
      "user_name",
      "preferred_username",
      "username",
    ]) ?? getDefaultUsername(user.id);

  return {
    id: user.id,
    email,
    display_name: displayName,
    avatar_url: avatarUrl,
    username,
  };
};
