export interface PreparedText {
  readonly __brand: unique symbol;
}

export interface PreparedTextWithSegments {
  readonly __brand: unique symbol;
}

export interface LayoutCursor {
  segmentIndex: number;
  graphemeIndex: number;
}

export interface LayoutLine {
  text: string;
  width: number;
  start: LayoutCursor;
  end: LayoutCursor;
}

export interface LayoutResult {
  height: number;
  lineCount: number;
}

export interface PrepareOptions {
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

export interface LineRange {
  start: LayoutCursor;
  end: LayoutCursor;
}

export function walkLineRanges(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  onLine: (line: LineRange) => void,
): number;

export function layoutNextLine(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLine | null;

export function clearCache(): void;
export function setLocale(locale: string): void;
