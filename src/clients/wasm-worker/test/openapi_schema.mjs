// Loads openapi.yaml and turns its component schemas into plain, self-contained JSON Schema
// documents (all `$ref: "#/components/schemas/X"` inlined) that ajv can compile directly,
// without needing ajv's own $ref/$id resolution machinery for a handful of small, acyclic
// schemas.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadOpenApiDocument() {
  const text = readFileSync(path.join(packageDir, "openapi.yaml"), "utf8");
  return parse(text);
}

const REF_PREFIX = "#/components/schemas/";

function inline(node, schemas, seen) {
  if (Array.isArray(node)) return node.map((n) => inline(n, schemas, seen));
  if (node === null || typeof node !== "object") return node;

  if (typeof node.$ref === "string" && node.$ref.startsWith(REF_PREFIX)) {
    const name = node.$ref.slice(REF_PREFIX.length);
    if (seen.has(name)) {
      throw new Error(`cyclic $ref through ${name} — inline() doesn't support that`);
    }
    return inline(schemas[name], schemas, new Set(seen).add(name));
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = inline(value, schemas, seen);
  }
  return out;
}

/// Returns a self-contained (no `$ref`) JSON Schema for `components.schemas[name]`, wrapped in
/// `{type: "array", items: ...}` since every response in this API is a JSON array.
export function responseArraySchema(doc, name) {
  const schemas = doc.components.schemas;
  return {
    type: "array",
    items: inline(schemas[name], schemas, new Set()),
  };
}
