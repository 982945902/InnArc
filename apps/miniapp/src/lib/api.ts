import Taro from "@tarojs/taro";

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? "http://127.0.0.1:8787";

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly category: string | undefined;
  readonly support: string | undefined;

  constructor(input: {
    readonly code: string;
    readonly message: string;
    readonly requestId?: string | undefined;
    readonly retryable?: boolean | undefined;
    readonly category?: string | undefined;
    readonly support?: string | undefined;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.code = input.code;
    this.requestId = input.requestId ?? "";
    this.retryable = input.retryable ?? false;
    this.category = input.category;
    this.support = input.support;
  }
}

type HttpMethod = "GET" | "POST";

const throwApiError = (body: unknown): never => {
  const error = body as {
    requestId?: string;
    code?: string;
    message?: string;
    retryable?: boolean;
    category?: string;
    support?: string;
  };
  throw new ApiClientError({
    code: error.code ?? "REQUEST_FAILED",
    message: error.message ?? "请求失败，请稍后重试。",
    requestId: error.requestId,
    retryable: error.retryable,
    category: error.category,
    support: error.support
  });
};

export const request = async <T>(method: HttpMethod, path: string, data?: unknown): Promise<T> => {
  if (process.env.TARO_APP_USE_CLOUDBASE === "true") {
    const response = await Taro.cloud.callContainer({
      config: { env: process.env.TARO_APP_CLOUDBASE_ENV ?? "" },
      path,
      method,
      ...(data === undefined ? {} : { data }),
      header: { "X-WX-SERVICE": process.env.TARO_APP_CLOUDBASE_SERVICE ?? "heart-mirror-api" }
    });
    if (response.statusCode >= 400) throwApiError(response.data);
    return response.data as T;
  }

  const response = await Taro.request<T | { code: string; message: string }>({
    url: `${API_BASE_URL}${path}`,
    method,
    ...(data === undefined ? {} : { data }),
    timeout: 30_000
  });
  if (response.statusCode >= 400) {
    throwApiError(response.data);
  }
  return response.data as T;
};
