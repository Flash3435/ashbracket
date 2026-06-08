import { revalidatePath } from "next/cache";

/** After NHL series rows change (manual or automated). */
export function revalidateNhlPublicSurfaces(): void {
  revalidatePath("/nhl");
  revalidatePath("/nhl/standings");
  revalidatePath("/nhl/picks");
  revalidatePath("/nhl/admin/series");
  revalidatePath("/nhl/admin/bracket");
}
