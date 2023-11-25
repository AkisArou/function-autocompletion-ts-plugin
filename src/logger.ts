import ts from "typescript/lib/tsserverlibrary";

export type Logger = ReturnType<typeof makeLogger>;

export function makeLogger(info: ts.server.PluginCreateInfo) {
  return (text: string) => {
    info.project.projectService.logger.info(
      `Function autocompletion ts language service plugin: ${text}`
    );
  };
}
