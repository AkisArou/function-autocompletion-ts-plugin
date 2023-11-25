import ts from "typescript/lib/tsserverlibrary";

export function getProxy(info: ts.server.PluginCreateInfo) {
  // Set up decorator object
  const proxy: ts.LanguageService = Object.create(null);
  for (const k of Object.keys(info.languageService) as Array<
    keyof ts.LanguageService
  >) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const x = info.languageService[k]!;
    // @ts-expect-error - JS runtime trickery which is tricky to type tersely
    proxy[k] = (...args: Array<object>) => x.apply(info.languageService, args);
  }

  return proxy;
}
