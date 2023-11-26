import ts from "typescript/lib/tsserverlibrary";
import { makeLogger } from "./logger";
import { getProxy } from "./get-proxy";

function init(modules: {
  typescript: typeof import("typescript/lib/tsserverlibrary");
}) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    const log = makeLogger(info);
    log(
      "Initializing function autocompletion typescript language service plugin"
    );

    const proxy = getProxy(info);

    const map = {
      const: {
        displayPart: "localName",
        type: "aliasName",
      },
      let: {
        displayPart: "localName",
        type: "aliasName",
      },
      parameter: {
        displayPart: "parameterName",
        type: "aliasName",
      },
    } as const;

    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      );

      if (!prior) {
        return;
      }

      if (!prior.isMemberCompletion) {
        return prior;
      }

      const quickInfo = info.languageService.getQuickInfoAtPosition(
        fileName,
        // move backwards before the . to the variable
        position - 2
      );

      if (!quickInfo?.displayParts) {
        return prior;
      }

      const foundElementKind: (typeof map)[keyof typeof map] | undefined =
        //@ts-expect-error -- TODO
        map[quickInfo.kind];

      if (!foundElementKind) {
        return prior;
      }

      const { varName, type } = quickInfo.displayParts.reduce<{
        varName: string | undefined;
        type: string | undefined;
      }>(
        (acc, cur) => {
          if (cur.kind === foundElementKind.displayPart) {
            acc.varName = cur.text;
          } else if (cur.kind === foundElementKind.type) {
            acc.type = cur.text;
          }

          return acc;
        },
        { varName: undefined, type: undefined }
      );

      if (!varName && !type) {
        return;
      }

      info.languageService
        .getProgram()
        ?.getSourceFiles()
        .forEach((sourceFile) => {
          if (sourceFile.isDeclarationFile) {
            return;
          }

          sourceFile.forEachChild((node) => {
            if (
              ts.isFunctionDeclaration(node) ||
              ts.isFunctionExpression(node)
            ) {
              let functionName = "";

              node.forEachChild((functionChild) => {
                if (ts.isIdentifier(functionChild)) {
                  functionName = functionChild.getText();
                  return;
                }

                if (ts.isParameter(functionChild)) {
                  functionChild.forEachChild((paramChild) => {
                    if (
                      ts.isTypeReferenceNode(paramChild) &&
                      paramChild.getText() === type
                    ) {
                      const args = node.parameters
                        .map((param) =>
                          param.type?.getText() === type
                            ? varName
                            : param.name.getText()
                        )
                        .join(", ");

                      const insertText = `${functionName}(${args})`;

                      prior.entries.push({
                        kind: ts.ScriptElementKind.functionElement,
                        name: functionName,
                        sortText: "zzz",
                        insertText,
                      });
                    }
                  });
                }
              });
            }
          });
        });

      return prior;
    };

    return proxy;
  }

  return { create };
}

export = init;
