declare module "@chenglou/pretext" {
  interface PreparedText {
    readonly __brand: unique symbol;
  }

  interface PreparedTextWithSegments {
    readonly __brand: unique symbol;
  }

  interface LayoutCursor {
    segmentIndex: number;
    graphemeIndex: number;
  }

  interface LayoutLine {
    text: string;
    width: number;
    start: LayoutCursor;
    end: LayoutCursor;
  }

  interface LayoutResult {
    height: number;
    lineCount: number;
  }

  interface PrepareOptions {
    whiteSpace?: "normal" | "pre-wrap";
  }

  export function prepare(
    text: string,
    font: string,
    options?: PrepareOptions,
  ): PreparedText;

  export function layout(
    prepared: PreparedText,
    maxWidth: number,
    lineHeight: number,
  ): LayoutResult;

  export function prepareWithSegments(
    text: string,
    font: string,
    options?: PrepareOptions,
  ): PreparedTextWithSegments;

  export function layoutWithLines(
    prepared: PreparedTextWithSegments,
    maxWidth: number,
    lineHeight: number,
  ): LayoutResult & { lines: LayoutLine[] };
}
