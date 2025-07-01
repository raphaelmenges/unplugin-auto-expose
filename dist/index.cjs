"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { newObj[key] = obj[key]; } } } newObj.default = obj; return newObj; } } function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }// src/preload.ts
var _path = require('path'); var path = _interopRequireWildcard(_path);
var _unplugin = require('unplugin');
var _magicstringast = require('magic-string-ast');

// src/parser.ts
var _parser = require('@babel/parser');
function getAST(code, sourceFilename) {
  return _parser.parse.call(void 0, code, {
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










var _types = require('@babel/types');
var _traverse = require('@babel/traverse'); var _traverse2 = _interopRequireDefault(_traverse);
var traverse = _traverse2.default.default;
var preload = _unplugin.createUnplugin.call(void 0, 
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
        const s = new (0, _magicstringast.MagicStringAST)(code);
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
  if (_types.isVariableDeclaration.call(void 0, node.declaration)) {
    for (const declarator of node.declaration.declarations) {
      if (_types.isIdentifier.call(void 0, declarator.id)) {
        applyExposingToNode(code, node, declarator.id.name);
        continue;
      }
      if (_types.isObjectPattern.call(void 0, declarator.id) || _types.isArrayPattern.call(void 0, declarator.id)) {
        const properties = _types.isObjectPattern.call(void 0, declarator.id) ? declarator.id.properties : declarator.id.elements;
        for (const property of properties) {
          const identifier = _types.isObjectProperty.call(void 0, property) ? property.value : _types.isRestElement.call(void 0, property) ? property.argument : property;
          if (!_types.isIdentifier.call(void 0, identifier)) {
            continue;
          }
          applyExposingToNode(code, node, identifier.name);
        }
        continue;
      }
    }
    return;
  }
  if (_types.isFunctionDeclaration.call(void 0, node.declaration) && _optionalChain([node, 'access', _ => _.declaration, 'optionalAccess', _2 => _2.id, 'optionalAccess', _3 => _3.name])) {
    applyExposingToNode(code, node, node.declaration.id.name);
    return;
  }
  if (node.specifiers.length) {
    for (const specifier of node.specifiers) {
      if (_types.isExportSpecifier.call(void 0, specifier) && _types.isIdentifier.call(void 0, specifier.exported)) {
        applyExposingToNode(code, node, specifier.exported.name, node.source ? null : specifier.local.name);
        continue;
      }
      if (_types.isExportNamespaceSpecifier.call(void 0, specifier)) {
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

var _unimport = require('unimport');
var renderer = _unplugin.createUnplugin.call(void 0, 
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
          if (!_optionalChain([options, 'optionalAccess', _4 => _4.preloadEntry])) {
            this.error(
              "Could not load preload module, did you forget to set preloadEntry in vite.config.ts?"
            );
            return;
          }
          const exp = await _unimport.scanExports.call(void 0, options.preloadEntry, false);
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



exports.preload = preload; exports.renderer = renderer;
