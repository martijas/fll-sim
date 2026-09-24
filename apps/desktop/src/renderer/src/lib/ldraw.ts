// Loads the bundled LDraw part pack (+ catalog) in the renderer.
import { Library, type FileSource } from "@fll-sim/ldraw";

export interface CatalogPart { file: string; name: string; colors: Record<string, number>; rb: string[] }
export interface CatalogCategory { id: string; name: string; parts: CatalogPart[] }

let libPromise: Promise<{ lib: Library; catalog: CatalogCategory[] }> | null = null;

async function gunzipJson<T>(bytes: Uint8Array): Promise<T> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as T;
}

export function loadLibrary() {
  libPromise ??= (async () => {
    const [packBytes, catBytes] = await Promise.all([window.fllsim.readAsset("apps/desktop/resources/ldraw/pack.json.gz"), window.fllsim.readAsset("apps/desktop/resources/ldraw/catalog.json")]);
    if (!packBytes || !catBytes) throw new Error("LDraw part pack missing (run: pnpm --filter @fll-sim/ldraw-pack run build-pack)");
    const pack = await gunzipJson<{ files: Record<string, string>; shadow: Record<string, string> }>(packBytes);
    const files = new Map(Object.entries(pack.files).map(([k, v]) => [k.toLowerCase(), v]));
    const shadow = new Map(Object.entries(pack.shadow).map(([k, v]) => [k.toLowerCase(), v]));
    const src: FileSource = { read: (p) => files.get(p.toLowerCase()) ?? null };
    const sh: FileSource = { read: (p) => shadow.get(p.toLowerCase()) ?? null };
    const catalog = JSON.parse(new TextDecoder().decode(catBytes)) as CatalogCategory[];
    return { lib: new Library(src, sh), catalog };
  })();
  return libPromise;
}
