const PRIVATE_HOST_ALIAS_PREFIX = "~/";

function isPrivateHostSpecifier(value) {
  return typeof value === "string" && value.startsWith(PRIVATE_HOST_ALIAS_PREFIX);
}

function sourceValue(node) {
  return typeof node?.source?.value === "string" ? node.source.value : undefined;
}

function hasRuntimeImport(declaration) {
  if (declaration.importKind === "type") {
    return false;
  }

  const specifiers = declaration.specifiers ?? [];
  if (specifiers.length === 0) {
    return true;
  }

  return specifiers.some((specifier) => specifier.importKind !== "type");
}

function hasRuntimeExport(declaration) {
  if (declaration.exportKind === "type") {
    return false;
  }

  const specifiers = declaration.specifiers ?? [];
  if (specifiers.length === 0) {
    return true;
  }

  return specifiers.some((specifier) => specifier.exportKind !== "type");
}

function reportPrivateHostSpecifier(context, node, specifier) {
  context.report({
    node: node.source ?? node,
    messageId: "privateHostImport",
    data: { specifier },
  });
}

const plugin = {
  meta: {
    name: "daopk",
  },
  rules: {
    "no-private-host-imports": {
      meta: {
        type: "problem",
        docs: {
          description: "Prevent independently built apps from importing host-private modules.",
        },
        messages: {
          privateHostImport:
            "External app runtime code must not import host-private module '{{specifier}}'. Use @daopk/sdk, @daopk/kit, @daopk/ui, or app-local code instead.",
        },
        schema: [],
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            const specifier = sourceValue(node);
            if (isPrivateHostSpecifier(specifier) && hasRuntimeImport(node)) {
              reportPrivateHostSpecifier(context, node, specifier);
            }
          },
          ExportNamedDeclaration(node) {
            const specifier = sourceValue(node);
            if (isPrivateHostSpecifier(specifier) && hasRuntimeExport(node)) {
              reportPrivateHostSpecifier(context, node, specifier);
            }
          },
          ExportAllDeclaration(node) {
            const specifier = sourceValue(node);
            if (isPrivateHostSpecifier(specifier) && hasRuntimeExport(node)) {
              reportPrivateHostSpecifier(context, node, specifier);
            }
          },
          ImportExpression(node) {
            const specifier =
              typeof node.source?.value === "string" ? node.source.value : undefined;
            if (isPrivateHostSpecifier(specifier)) {
              context.report({
                node: node.source ?? node,
                messageId: "privateHostImport",
                data: { specifier },
              });
            }
          },
        };
      },
    },
  },
};

export default plugin;
