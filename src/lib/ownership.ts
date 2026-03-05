import { queryOne } from "./db";

/** Check if user is the author of a novel */
export async function checkOwnership(
  novelId: string,
  userId: string
): Promise<boolean> {
  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  return novel?.author_id === userId;
}
