import { Data } from "effect";

export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{
  readonly sessionId: string;
}> {}

export class ReadingTaskNotFound extends Data.TaggedError("ReadingTaskNotFound")<{
  readonly taskId: string;
}> {}

export class InvalidSessionState extends Data.TaggedError("InvalidSessionState")<{
  readonly message: string;
}> {}

export class InvalidDraw extends Data.TaggedError("InvalidDraw")<{
  readonly message: string;
}> {}

export class ContentBlocked extends Data.TaggedError("ContentBlocked")<{
  readonly message: string;
  readonly category: "reframe" | "professional" | "unsafe" | "crisis";
  readonly support?: string | undefined;
}> {}

export class AuthenticationRequired extends Data.TaggedError("AuthenticationRequired")<{
  readonly message: string;
}> {}

export class ConsentRequired extends Data.TaggedError("ConsentRequired")<{
  readonly message: string;
  readonly consentVersion: string;
}> {}

export class RateLimited extends Data.TaggedError("RateLimited")<{
  readonly message: string;
  readonly retryAfterSeconds: number;
}> {}

export class PersistenceFailure extends Data.TaggedError("PersistenceFailure")<{
  readonly operation: string;
  readonly message: string;
}> {}

export class OutputRejected extends Data.TaggedError("OutputRejected")<{
  readonly reason: string;
}> {}

export class AgentFailure extends Data.TaggedError("AgentFailure")<{
  readonly operation: string;
  readonly message: string;
}> {}

export type DomainError =
  | SessionNotFound
  | ReadingTaskNotFound
  | InvalidSessionState
  | InvalidDraw
  | ContentBlocked
  | AgentFailure
  | AuthenticationRequired
  | ConsentRequired
  | RateLimited
  | PersistenceFailure
  | OutputRejected;
