# Server failure logging

[Back to the main guide](../server-errors.md)

## Failure log

`logServerFailure({ source, error })` tries to log a multiline string in a
single argument of `console.error`:

1. The fixed message of the source, such as
   `[middleware] Unexpected failure; private details omitted`. The text stays
   the same byte for byte, because the E2E tests count the lines that contain
   it.
2. Only when `error instanceof Error`, the class name, read once from
   `Object.getPrototypeOf(error).constructor.name` and written only if it is a
   string with a simple identifier of up to 64 characters. Other values are not
   converted to text. Neither `error.name` nor an own `constructor` property is
   used.
3. Up to 10 stack frames, one per line.

The frames are read only when `error.stack` starts with the header that V8
builds from the current `name` and message: `<name>: <message>` followed by a
line break, or only the name when the message is empty. The name of the header
has to be the whole current `error.name`, a simple identifier of up to 64
characters, or, for an internal Node error, that name followed by the `code`, as
in `TypeError [ERR_INVALID_ARG_TYPE]`. A `name` or `code` with a line break,
which would leave header lines shaped like a frame, also leaves the log without
frames. The whole header is dropped, including the lines of a message with line
breaks. An overwritten stack, or a `name` or a message changed after the first
read of the stack, leaves the log without frames, because there is no way to
know where the header ends.

After the header, only lines `    at <function> (<location>)` or
`    at <location>` pass, with the location in `file://`, `node:` or an absolute
path, without spaces, parentheses or control or format characters (Unicode
category `C`, such as the ESC of terminal sequences and U+202E, which reverses
the text direction), and ending in `:line:column`. A real frame in `file://`
carries those characters encoded. The function accepts the `async` and `new`
prefixes, `<anonymous>` and the `[as name]` alias; the form without a function
accepts only the `async` prefix, of anonymous async functions. Because of the
parentheses, a frame that points to a source file in a route group folder, such
as `src/routes/(seo)/`, is dropped. The other lines, such as
`async Promise.all (index 0)`, `eval` frames and HTTP URLs, are dropped without
stopping the read. The read stops at 50 lines, and a line over 1024 characters
is dropped before the regular expressions, which are anchored and have no nested
repetition.

The log leaves out the message, the `cause`, the own properties, `error.name`
and any data of a value that is not an `Error`. A failure during the inspection,
such as a getter that throws or a hostile Proxy, leaves only the fixed line. If
building or writing the line fails, the logger tries once to log only the fixed
message, without inspecting the error again. A failure of that second attempt is
dropped. The logger is synchronous and does not propagate failures of
inspection, building or access to the destination. The consumers keep the public
response even without a log. If the destination writes and then throws, the
fixed message can appear twice.

On the development server, the `configureServerErrors` hook returns `undefined`,
and the runtime sends the browser the error it received. Three callers pass
`shouldPrintOriginal: true`, and the logger prints the original error in a
second `console.error` call, after the filtered line:

- The `configureServerErrors` hook. With the hook installed, the runtime stops
  printing these failures, and without this request the message would only reach
  the browser.
- `protectServerOperation`, which serves the wrapper and `requestJson`. It
  replaces the failure with the public error before the runtime, and the hook
  receives only that error, without logging.
- The sitemap, which answers 503 without going through the runtime.

Inside a publication (Markdown, sitemap, indexes), `protectServerOperation` does
not log the rejection that is the reason the publication signal was aborted,
such as the read of a source cancelled by the deadline or by the client
disconnecting. The operation still ends in the public error. Any other error,
even with the signal already aborted, is a real failure and produces the
`[server-operation]` line.

The `[middleware]` and `[error-page]` sources do not make the request, because
in development the containment rethrows the exception before logging. Solid's
development diagnostics also print the message, such as the one for an error
contained by `<Errored>`. The logger checks `import.meta.env.DEV` on its own and
ignores the request in production. A failure to format the original error is
dropped.

Known limits:

- A forged stack that imitates the header and the grammar passes the filter. The
  same goes for a message or a `name` replaced by a prefix of the original value
  after the first read of the stack, and for a `name` getter that returns one
  value in the V8 formatting and another, simple one, in the check. These cases
  need code that changes the error in the same process; a `name` or `code`
  received only as data does not reach the log.
- The `[as name]` alias of a frame shows the property used in the call, which
  may have been chosen at run time.
- Another `Error.prepareStackTrace`, such as the one of the Vite module runner
  that Vitest installs, may build the header without the code of Node errors or
  as `Error: ` when the message is empty; in the second case the log has no
  frames. Frames with a relative path or with spaces are dropped too.
