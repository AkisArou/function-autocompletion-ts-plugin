import ts from "typescript/lib/tsserverlibrary";
import { makeLogger } from "./logger";
import { getProxy } from "./get-proxy";
import { argv0 } from "process";

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

      const variable = quickInfo?.displayParts?.find(
        (dp) => dp.kind === "aliasName"
      );

      if (variable) {
        const variableName = quickInfo?.displayParts?.find(
          (dp) => dp.kind === "localName"
        );

        if (!variableName) {
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
                        paramChild.getText() === variable.text
                      ) {
                        const params = node.parameters
                          .map((param) =>
                            param.type?.getText() === variable.text
                              ? variableName.text
                              : param.name.getText()
                          )
                          .join(", ");

                        const insertText = `${functionName}(${params})`;

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
      }

      // log(`quickInfo ${JSON.stringify(quickInfo)}`);
      // log(`prior: ${JSON.stringify(prior)}`);
      //

      return prior;
    };

    return proxy;
  }

  return { create };
}

export = init;
