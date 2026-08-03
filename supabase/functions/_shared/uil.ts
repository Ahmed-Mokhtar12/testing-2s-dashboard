import { graphFetch, GRAPH_BASE, LIST_IDS } from './graph.ts';
import { mapUilItemToTrainer, dedupeAndSortTrainers } from './uil-mapper.ts';
import type { TrainerEntry } from './directory.ts';

// The SharePoint site's hidden User Information List (UIL): everyone the site can
// already file a training against.
//
// WHY IT LIVES IN _shared. Two functions need it — sp-read-trainers, to union it
// with the staff directory, and sp-search-directory, to tell the truth about whether
// a wider-search match can be recorded. Each function's deploy archives only its own
// directory plus _shared (scripts/deploy-sp-function.sh), so importing this from a
// sibling function's index.ts would ship a broken module — and worse, importing that
// index.ts would execute its Deno.serve in the wrong isolate.
//
// Being in this list IS the fact that decides recordability, so entries are built
// with inSite: true by construction rather than by a later assignment that could be
// forgotten.
export async function fetchTrainersFromUil(token: string, siteId: string): Promise<TrainerEntry[]> {
  const mapped: Array<ReturnType<typeof mapUilItemToTrainer>> = [];

  // Deliberately no $select on fields: UIL internal field names vary by tenant and
  // $select on a missing field can error, so fetch the full field set and read
  // defensively in uil-mapper (mirrors sp-submit-training).
  let url: string | null =
    `${GRAPH_BASE}/sites/${siteId}/lists/${LIST_IDS.uil}/items?$top=500&$expand=fields`;

  while (url) {
    const data = await graphFetch<{
      value: Array<{ id: string; fields: Record<string, unknown> }>;
      '@odata.nextLink'?: string;
    }>(token, url);

    for (const item of data.value) {
      mapped.push(mapUilItemToTrainer(item.id, item.fields));
    }

    url = data['@odata.nextLink'] ?? null;
  }

  const persons = mapped.filter((t): t is NonNullable<typeof t> => t !== null);
  return dedupeAndSortTrainers(persons).map((t) => ({
    displayName: t.displayName,
    email: t.mail,
    inSite: true,
  }));
}
