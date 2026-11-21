// A faster drop-in for csv-reader 1.0.0: run(input) returns, for every case's input
// {text, header}, exactly the answer the reference returns: {columns, rows, errors}.
// It reads the text once, left to right, with the reference's own broken-row policy:
//
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended as
//     it stands (quote_junk, when the field ends); a quote that never closes is a
//     literal character, and the text after it is read again as unquoted
//     (unterminated_quote); a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row) or cut (long_row) to the
//     first record's width; each error is {code, line, row} in the order met, a
//     record's short_row or long_row when it ends: line the 1-based line its record
//     starts on, row its record's index in rows, null for the header.
//
// Speed comes from reading in bulk: the reference walks one character at a time and
// builds every field a character at a time, while this reader jumps from one
// delimiter to the next and takes each field's run of plain characters as one slice.
// Two things keep the jump cheap: the delimiter search uses RegExp.test, which only
// reports whether a delimiter follows (its lastIndex, a match being one character,
// names the match) instead of exec, which builds a match array per field; and a
// field's reading writes its value, ending and kept count into three slots instead
// of allocating a result object per field. Only a broken field pays for extra work,
// and broken fields are rare.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and the characters kept.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // The next delimiter at or after a position: a comma, CR or LF outside quotes, a quote, CR or LF inside them.
  // Each matches one character, so after a test that finds one, lastIndex is one past it.
  const UNQUOTED = /[,\r\n]/g;
  const QUOTED = /["\r\n]/g;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Leaves the field in fValue, fEnded and fAdded, the characters kept in the last.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      UNQUOTED.lastIndex = pos;
      if (!UNQUOTED.test(text)) {
        if (pos < n) {
          value += text.slice(pos, n);
          added += n - pos;
        }
        pos = n;
        fValue = value;
        fEnded = END;
        fAdded = added;
        return;
      }
      const i = UNQUOTED.lastIndex - 1;
      if (i > pos) {
        value += text.slice(pos, i);
        added += i - pos;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        pos = i + 1;
        fValue = value;
        fEnded = COMMA;
        fAdded = added;
        return;
      }
      if (c === 10) {
        pos = i + 1;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = added;
        return;
      }
      // A CR: a line break with the LF that follows it, else a stray one, dropped.
      if (text.charCodeAt(i + 1) === 10) {
        pos = i + 2;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = added;
        return;
      }
      error('stray_cr');
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Leaves the field in fValue, fEnded and fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    for (;;) {
      QUOTED.lastIndex = pos;
      if (!QUOTED.test(text)) break;
      const i = QUOTED.lastIndex - 1;
      if (i > pos) value += text.slice(pos, i);
      const c = text.charCodeAt(i);
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          value += '"';
          pos = i + 2;
          continue;
        }
        pos = i + 1;
        closed = true;
        break;
      }
      // A CR or LF inside quotes is one LF, and the line moves on.
      value += '\n';
      line += 1;
      pos = c === 13 && text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      readUnquoted('"');
      return;
    }
    if (pos >= n) {
      fValue = value;
      fEnded = END;
      fAdded = 0;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      fAdded = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      fAdded = 0;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      fAdded = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    readUnquoted(value);
    if (fAdded > 0) error('quote_junk');
  }

  for (;;) {
    // Lines with no characters are no records.
    for (;;) {
      if (pos >= n) break;
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
