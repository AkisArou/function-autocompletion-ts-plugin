import ts, {
  CompletionEntryDetails,
  ScriptElementKind,
} from "typescript/lib/tsserverlibrary";
import { makeLogger } from "./logger";
import { getProxy } from "./get-proxy";

type ReplacementActionSpan = {
  start: number;
  length: number;
};

type ReplacementAction = {
  replacementSpan: ReplacementActionSpan;
  timestamp: number;
};

const actions: Record<string, ReplacementAction> = {};

function registerActionCleanup() {
  setInterval(() => {
    const currentTimestamp = Date.now();
    const allowedTimestamp = currentTimestamp - 15_000;

    for (const actionIdentifier in actions) {
      const action = actions[actionIdentifier];

      if (action.timestamp < allowedTimestamp) {
        delete actions[actionIdentifier];
      }
    }
  }, 15_000);
}

registerActionCleanup();

function setAction(identifier: string, span: ReplacementActionSpan) {
  actions[identifier] = {
    replacementSpan: span,
    timestamp: Date.now(),
  };
}

function makeActionIdentifier(
  fileName: string,
  position: number,
  entryName: string
) {
  return `${fileName}:${position}:${entryName}`;
}

function getAction(identifier: string): ReplacementAction | undefined {
  return actions[identifier];
}

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

    proxy.getCompletionEntryDetails = (
      fileName,
      position,
      entryName,
      formatOptions,
      source,
      preferences,
      data
    ) => {
      const prior = info.languageService.getCompletionEntryDetails(
        fileName,
        position,
        entryName,
        formatOptions,
        source,
        preferences,
        data
      );

      const action = getAction(
        makeActionIdentifier(fileName, position, entryName)
      );

      if (action) {
        const c: CompletionEntryDetails = {
          codeActions: [],
          name: entryName,
          kind: ScriptElementKind.functionElement,
          displayParts: [],
          kindModifiers: "",
        };

        c.codeActions!.push({
          commands: [],
          description: "Gia na doume",
          changes: [
            {
              isNewFile: false,
              fileName,
              textChanges: [
                {
                  span: action.replacementSpan,
                  newText: "",
                },
              ],
            },
          ],
        });

        return c;
      }

      return prior;
    };

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
                        .map((param, idx) =>
                          param.type?.getText() === type
                            ? varName
                            : `\${${idx}}`
                        )
                        .join(", ");

                      const insertText = `${functionName}(${args})`;

                      setAction(
                        makeActionIdentifier(fileName, position, functionName),
                        {
                          start: quickInfo.textSpan.start,
                          length: quickInfo.textSpan.length + 1,
                        }
                      );

                      return prior.entries.push({
                        kind: ts.ScriptElementKind.functionElement,
                        name: functionName,
                        isSnippet: true,
                        sortText: "zzz",
                        hasAction: true,
                        insertText,
                      });
                    }
                  });
                }
              });
            }

            // Arrow functions (Possibly will be slow? Because we have to check if it is a variable statement)
            else if (ts.isVariableStatement(node)) {
              node.forEachChild((statementChild) => {
                statementChild.forEachChild((c) => {
                  let functionName = "";

                  c.forEachChild((arrowFunction) => {
                    if (ts.isIdentifier(arrowFunction)) {
                      functionName = arrowFunction.getText();
                      return;
                    }

                    if (ts.isArrowFunction(arrowFunction)) {
                      arrowFunction.forEachChild((c) => {
                        if (ts.isParameter(c)) {
                          c.forEachChild((paramChild) => {
                            if (
                              ts.isTypeReferenceNode(paramChild) &&
                              paramChild.getText() === type
                            ) {
                              const args = arrowFunction.parameters
                                .map((param, idx) =>
                                  param.type?.getText() === type
                                    ? varName
                                    : `\${${idx}}`
                                )
                                .join(", ");

                              const insertText = `${functionName}(${args})`;

                              setAction(
                                makeActionIdentifier(
                                  fileName,
                                  position,
                                  functionName
                                ),
                                {
                                  start: quickInfo.textSpan.start,
                                  length: quickInfo.textSpan.length + 1,
                                }
                              );
                              return prior.entries.push({
                                kind: ts.ScriptElementKind.variableElement,
                                name: functionName,
                                sortText: "zzz",
                                insertText,
                                hasAction: true,
                                // data: { dadada: ":):):)" },
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                });
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
