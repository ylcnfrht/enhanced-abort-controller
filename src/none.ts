/** A signal nobody can abort: its controller is unreachable. .NET's `CancellationToken.None`. @internal */
export const none: AbortSignal = new AbortController().signal;
