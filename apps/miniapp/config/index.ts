import { defineConfig, type UserConfigExport } from "@tarojs/cli";

export default defineConfig(async (merge, { command, mode }) => {
  const base: UserConfigExport = {
    projectName: "heart-mirror",
    date: "2026-08-07",
    designWidth: 390,
    deviceRatio: {
      390: 2
    },
    sourceRoot: "src",
    outputRoot: "dist",
    framework: "react",
    compiler: "webpack5",
    cache: { enable: true },
    mini: {
      postcss: {
        pxtransform: { enable: true },
        cssModules: { enable: false }
      }
    }
  };

  if (process.env.NODE_ENV === "development") {
    return merge({}, base, { logger: { quiet: false, stats: true } });
  }
  return merge({}, base, { mini: { miniCssExtractPluginOption: { ignoreOrder: true } } });
});
