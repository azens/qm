import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

function inlineScripts(node: DefaultTreeAdapterTypes.ParentNode): DefaultTreeAdapterTypes.Element[] {
  const found: DefaultTreeAdapterTypes.Element[] = [];
  for (const child of node.childNodes) {
    if (child.nodeName === "script" && !child.attrs.some((attr) => attr.name === "src")) found.push(child);
    else if ("childNodes" in child) found.push(...inlineScripts(child));
  }
  return found;
}

export function adminScriptHash(html: string): string {
  const scripts = inlineScripts(parse(html.replace(/\r\n?/g, "\n")));
  if (scripts.length !== 1) {
    throw new Error(`admin document must hold exactly one inline script, found ${scripts.length}`);
  }
  const source = scripts[0]!.childNodes.map((node) => ("value" in node ? node.value : "")).join("");
  return createHash("sha256").update(source).digest("base64");
}