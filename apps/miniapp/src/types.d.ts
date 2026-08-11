declare namespace NodeJS {
  interface ProcessEnv {
    readonly TARO_APP_API_BASE_URL?: string;
    readonly TARO_APP_USE_CLOUDBASE?: string;
    readonly TARO_APP_CLOUDBASE_ENV?: string;
    readonly TARO_APP_CLOUDBASE_SERVICE?: string;
  }
}

declare const process: {
  readonly env: NodeJS.ProcessEnv;
};
