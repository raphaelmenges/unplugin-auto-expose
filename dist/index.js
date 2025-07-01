// src/preload.ts
import * as path from "node:path";
import { createUnplugin } from "unplugin";
import { MagicStringAST } from "magic-string-ast";

// src/parser.ts
import { parse } from "@babel/parser";
function getAST(code, sourceFilename) {
  return parse(code, {
    sourceType: "module",
    attachComment: false,
    createImportExpressions: true,
    sourceFilename,
    plugins: [
      "typescript",
      "topLevelAwait"
    ]
  });
}

// src/preload.ts
import {
  isArrayPattern,
  isExportNamespaceSpecifier,
  isExportSpecifier,
  isFunctionDeclaration,
  isIdentifier,
  isObjectPattern,
  isObjectProperty,
  isRestElement,
  isVariableDeclaration
} from "@babel/types";
import traverseModule from "@babel/traverse";
var traverse = traverseModule.default;
var preload = createUnplugin(
  () => {
    const __entries = /* @__PURE__ */ new Set();
    function normalizePath(id) {
      return path.normalize(id);
    }
    return {
      name: "unplugin-auto-expose-preload",
      enforce: "pre",
      resolveId(id, importer, options) {
        if (options.isEntry) {
          __entries.add(normalizePath(id));
        }
        return null;
      },
      transform(code, id) {
        if (!__entries.has(normalizePath(id))) {
          return;
        }
        const s = new MagicStringAST(code);
        const program = getAST(code, id);
        traverse(program, {
          ExportNamedDeclaration(path2) {
            handleExportNamedDeclaration(path2.node, s);
          },
          ExportDefaultDeclaration(path2) {
            handleExportDefaultDeclaration(path2.node, s);
          },
          ExportAllDeclaration(path2) {
            handleExportAllDeclaration(path2.node, s);
          }
        });
        s.prepend("import {contextBridge} from 'electron';\n");
        return {
          code: s.toString(),
          get map() {
            return s.generateMap({
              source: id,
              includeContent: true
            });
          }
        };
      }
    };
  }
);
var index = 0;
function getVarName(p = "") {
  return `d${++index}${p}`;
}
function getExposeInMainWorldCall(name, localName = null) {
  return `contextBridge.exposeInMainWorld('__electron_preload__${name}', ${localName || name})`;
}
function handleExportNamedDeclaration(node, code) {
  if (!node.loc) {
    return;
  }
  if (isVariableDeclaration(node.declaration)) {
    for (const declarator of node.declaration.declarations) {
      if (isIdentifier(declarator.id)) {
        applyExposingToNode(code, node, declarator.id.name);
        continue;
      }
      if (isObjectPattern(declarator.id) || isArrayPattern(declarator.id)) {
        const properties = isObjectPattern(declarator.id) ? declarator.id.properties : declarator.id.elements;
        for (const property of properties) {
          const identifier = isObjectProperty(property) ? property.value : isRestElement(property) ? property.argument : property;
          if (!isIdentifier(identifier)) {
            continue;
          }
          applyExposingToNode(code, node, identifier.name);
        }
        continue;
      }
    }
    return;
  }
  if (isFunctionDeclaration(node.declaration) && node.declaration?.id?.name) {
    applyExposingToNode(code, node, node.declaration.id.name);
    return;
  }
  if (node.specifiers.length) {
    for (const specifier of node.specifiers) {
      if (isExportSpecifier(specifier) && isIdentifier(specifier.exported)) {
        applyExposingToNode(code, node, specifier.exported.name, node.source ? null : specifier.local.name);
        continue;
      }
      if (isExportNamespaceSpecifier(specifier)) {
        applyExposingToNode(code, node, specifier.exported.name);
      }
    }
    if (node.source) {
      let exportDeclaration = ";" + code.slice(node.loc.start.index, node.loc.end.index) + ";";
      code.prependRight(node.loc.end.index, exportDeclaration.replace("export", "import"));
    }
    return;
  }
}
function handleExportDefaultDeclaration(node, code) {
  if (!node.declaration || !node.declaration.loc || !node.loc) {
    return;
  }
  const value = code.slice(node.declaration.loc.start.index, node.declaration.loc.end.index);
  const name = getVarName();
  code.overwriteNode(node, `;const ${name} = ${value};export default ${name};`);
  applyExposingToNode(code, node, "default", name);
}
function handleExportAllDeclaration(node, code) {
  if (!node.loc) {
    return;
  }
  const name = getVarName();
  code.appendRight(
    node.loc.end.index,
    `;import * as ${name} from '${node.source.value}';Object.keys(` + name + ").forEach(k => " + getExposeInMainWorldCall(`'+k+'`, name + "[k]") + ");"
  );
}
function applyExposingToNode(code, node, name, localName = null) {
  if (!node.loc) {
    return code;
  }
  code.appendRight(node.loc.end.index, ";" + getExposeInMainWorldCall(name, localName) + ";");
  return code;
}

// src/renderer.ts
import { createUnplugin as createUnplugin2 } from "unplugin";
import { scanExports } from "unimport";
var renderer = createUnplugin2(
  (options) => {
    const virtualModuleId = "#preload";
    const resolvedVirtualModuleId = "\0" + virtualModuleId.replace("#", "@");
    return {
      name: "unplugin-auto-expose-renderer",
      resolveId(source) {
        if (source === virtualModuleId) {
          return resolvedVirtualModuleId;
        }
      },
      /**
       *
       * @param {string} id
       * @returns {Promise<*>}
       */
      async load(id) {
        if (id === resolvedVirtualModuleId) {
          if (!options?.preloadEntry) {
            this.error(
              "Could not load preload module, did you forget to set preloadEntry in vite.config.ts?"
            );
            return;
          }
          const exp = await scanExports(options.preloadEntry, false);
          const names = new Set(exp.map((e) => e.name.replace(/^\.\.\./, "")));
          return [...names].reduce((code, name) => {
            const exportName = name === "default" ? "default" : `const ${name} =`;
            return code + `export ${exportName} globalThis.__electron_preload__${name};
`;
          }, "");
        }
      }
    };
  }
);
export {
  preload,
  renderer
};
