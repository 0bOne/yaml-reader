const Typer = require("./typer.js");
const Metadata = require("./metadata.js");

class Utils {
  static _hasOwnProperty = Object.prototype.hasOwnProperty;

  static _class(obj) {
    return Object.prototype.toString.call(obj);
  }

  static is_WS_OR_EOL(c) {
    return (
      Metadata.CHARS.EOLs.includes(c) || Metadata.CHARS.WHITE_SPACES.includes(c)
    );
  }

  static fromHexCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    c |= 0x20;
    if (c >= 97 && c <= 102) return c - 87;
    return -1;
  }

  static escapedHexLen(c) {
    return Metadata.HexLengths[c] || 0;
  }

  static fromDecimalCode(c) {
    if (0x30 /* 0 */ <= c && c <= 0x39 /* 9 */) {
      return c - 0x30;
    }
    return -1;
  }

  static charFromCodepoint(c) {
    if (c <= 0xffff) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      ((c - 0x010000) >> 10) + 0xd800,
      ((c - 0x010000) & 0x03ff) + 0xdc00
    );
  }

  static isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }

  static EnsureFinalNewline(input) {
    if (
      input.charCodeAt(input.length - 1) !== 0x0a /* LF */ &&
      input.charCodeAt(input.length - 1) !== 0x0d /* CR */
    ) {
      input += "\n";
    }
    return input;
  }

  static StripBOM(input) {
    if (input.charCodeAt(0) === 0xfeff) {
      input = input.slice(1);
    }
    return input;
  }

  static TerminateWithNull(input) {
    input += "\0";
    return input;
  }
}

class Guard {
  static Against(condition, message, state) {
    if (condition) {
      this.Throw(message, state);
    }
  }

  static AgainstNullByte(state) {
    var nullpos = state.input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      this.Throw("null byte is not allowed in input", state);
    }
  }

  static Warn(condition, message, state) {
    if (condition) {
      console.warn(message, state);
    }
  }

  static Throw(message, state) {
    const column = state.position - state.lineStart;

    if (state) {
      const LINES_BEFORE = 3;
      const LINES_AFTER = 2;
      const lines = state.input.replaceAll("\r", "").split("\n");
      const firstLine = Math.max(0, state.line - LINES_BEFORE);
      const lastLine = Math.min(lines.length - 1, state.line + LINES_AFTER);
      const snippetLines = [];
      for (let l = firstLine; l <= lastLine; l++) {
        snippetLines.push(lines[l]);
        if (l === state.line) {
          const column = state.position - state.lineStart;
          const errorMarker = " ".repeat(column) + "^";
          snippetLines.push(errorMarker);
        }
      }
      message += ":\n" + snippetLines.join("\n");
      message += "\n(" + (state.line + 1) + ":" + (column + 1) + ")";
    }

    throw new Error(message);
  }
}

module.exports = class Parser {
  static captureSegment(state, start, end, checkJson) {
    let _position, _length, _character, _result;

    if (start < end) {
      _result = state.input.slice(start, end);

      if (checkJson) {
        for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
          _character = _result.charCodeAt(_position);
          Guard.Against(!(_character === 0x09 || (0x20 <= _character && _character <= 0x10ffff)), "expected valid JSON character", state);
        }
      } else {
        Guard.Against(Metadata.PATTERNS.NON_PRINTABLE.test(_result), "the stream contains non-printable characters", state);
      }

      state.result += _result;
    }
  }

  static mergeMappings(state, destination, source, overridableKeys) {
    Guard.Against(!Utils.isObject(source), "cannot merge mappings; the provided source object is unacceptable", state);

    let key, index, quantity;
    let sourceKeys = Object.keys(source);

    for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      key = sourceKeys[index];
      if (!Utils._hasOwnProperty.call(destination, key)) {
        destination[key] = source[key];
        overridableKeys[key] = true;
      }
    }
  }

  static storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    let index, quantity;

    // The output is a plain object here, so keys can only be strings.
    // We need to convert keyNode to a string, but doing so can hang the process
    // (deeply nested arrays that explode exponentially using aliases).
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);

      for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        Guard.Against(Array.isArray(keyNode[index]), "nested arrays are not supported inside keys", state);

        if (typeof keyNode === "object" && Utils._class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }

    // Avoid code execution in load() via toString property
    if (typeof keyNode === "object" && Utils._class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }

    keyNode = String(keyNode);

    if (_result === null) {
      _result = {};
    }

    if (keyTag === "merge") {
      if (Array.isArray(valueNode)) {
        for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          this.mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        this.mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (
        !state.json && !Utils._hasOwnProperty.call(overridableKeys, keyNode) && Utils._hasOwnProperty.call(_result, keyNode)
      ) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        Guard.Throw("duplicated mapping key", state);
      }

      // used for this specific key only because Object.defineProperty is slow
      if (keyNode === "__proto__") {
        Object.defineProperty(_result, keyNode, {configurable: true, enumerable: true, writable: true, value: valueNode});
      } else {
        _result[keyNode] = valueNode;
      }
      delete overridableKeys[keyNode];
    }

    return _result;
  }

  static readLineBreak(state) {
    var ch;

    ch = state.input.charCodeAt(state.position);

    if (ch === 0x0a /* LF */) {
      state.position++;
    } else if (ch === 0x0d /* CR */) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 0x0a /* LF */) {
        state.position++;
      }
    } else {
      Guard.Throw("a line break is expected", state);
    }

    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }

  static skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);

    while (ch !== 0) {
      while (Metadata.CHARS.WHITE_SPACES.includes(ch)) {
        if (ch === 0x09 /* Tab */ && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }

      if (allowComments && ch === 0x23 /* # */) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0x0a /* LF */ && ch !== 0x0d /* CR */ && ch !== 0);
      }

      if (Metadata.CHARS.EOLs.includes(ch)) {
        this.readLineBreak(state);

        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;

        while (ch === 0x20 /* Space */) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }

    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      this.displayWarning("deficient indentation", state);
    }

    return lineBreaks;
  }

  static testDocumentSeparator(state) {
    var _position = state.position,
      ch;

    ch = state.input.charCodeAt(_position);

    // Condition state.position === state.lineStart is tested
    // in parent on each call, for efficiency. No needs to test here again.
    if (
      (ch === 0x2d /* - */ || ch === 0x2e) /* . */ &&
      ch === state.input.charCodeAt(_position + 1) &&
      ch === state.input.charCodeAt(_position + 2)
    ) {
      _position += 3;

      ch = state.input.charCodeAt(_position);

      if (ch === 0 || Utils.is_WS_OR_EOL(ch)) {
        return true;
      }
    }

    return false;
  }

  static writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += "\n".repeat(count - 1);
    }
  }

  static readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let preceding,
      following,
      captureStart,
      captureEnd,
      hasPendingContent,
      _line,
      _lineStart,
      _lineIndent,
      _kind = state.kind,
      _result = state.result,
      ch;

    ch = state.input.charCodeAt(state.position);

    if (Utils.is_WS_OR_EOL(ch) || Metadata.CHARS.FLOW_INDICATORS.includes(ch) || Metadata.CHARS.NOT_SCALAR.includes(ch)) {
      return false;
    }

    if (ch === 0x3f /* ? */ || ch === 0x2d /* - */) {
      following = state.input.charCodeAt(state.position + 1);

      if (
        Utils.is_WS_OR_EOL(following) || (withinFlowCollection && Metadata.CHARS.FLOW_INDICATORS.includes(following))) {
        return false;
      }
    }

    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;

    while (ch !== 0) {
      if (ch === 0x3a /* : */) {
        following = state.input.charCodeAt(state.position + 1);

        if (
          Utils.is_WS_OR_EOL(following) ||
          (withinFlowCollection &&
            Metadata.CHARS.FLOW_INDICATORS.includes(following))
        ) {
          break;
        }
      } else if (ch === 0x23 /* # */) {
        preceding = state.input.charCodeAt(state.position - 1);

        if (Utils.is_WS_OR_EOL(preceding)) {
          break;
        }
      } else if (
        (state.position === state.lineStart &&
          this.testDocumentSeparator(state)) ||
        (withinFlowCollection && Metadata.CHARS.FLOW_INDICATORS.includes(ch))
      ) {
        break;
      } else if (Metadata.CHARS.EOLs.includes(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        this.skipSeparationSpace(state, false, -1);

        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }

      if (hasPendingContent) {
        this.captureSegment(state, captureStart, captureEnd, false);
        this.writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }

      if (!Metadata.CHARS.WHITE_SPACES.includes(ch)) {
        captureEnd = state.position + 1;
      }

      ch = state.input.charCodeAt(++state.position);
    }

    this.captureSegment(state, captureStart, captureEnd, false);

    if (state.result) {
      return true;
    }

    state.kind = _kind;
    state.result = _result;
    return false;
  }

  static readSingleQuotedScalar(state, nodeIndent) {
    var ch, captureStart, captureEnd;

    ch = state.input.charCodeAt(state.position);

    if (ch !== 0x27 /* ' */) {
      return false;
    }

    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;

    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 0x27 /* ' */) {
        this.captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);

        if (ch === 0x27 /* ' */) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (Metadata.CHARS.EOLs.includes(ch)) {
        this.captureSegment(state, captureStart, captureEnd, true);
        this.writeFoldedLines(state, this.skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && this.testDocumentSeparator(state)) {
        Guard.Throw("unexpected end of the document within a single quoted scalar", state);
      } else {
        state.position++;
        captureEnd = state.position;
      }
    }

    Guard.Throw("unexpected end of the stream within a single quoted scalar", state);
  }

  static readDoubleQuotedScalar(state, nodeIndent) {
    var captureStart, captureEnd, hexLength, hexResult, tmp, ch;

    ch = state.input.charCodeAt(state.position);

    if (ch !== 0x22 /* " */) {
      return false;
    }

    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;

    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 0x22 /* " */) {
        this.captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 0x5c /* \ */) {
        this.captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);

        if (Metadata.CHARS.EOLs.includes(ch)) {
          this.skipSeparationSpace(state, false, nodeIndent);

          // TODO: rework to inline fn with no type cast?
        } else if (ch < 256 && Metadata.ESCAPE_CHECK[ch]) {
          state.result += Metadata.ESCAPE_MAP_EX[ch];
          state.position++;
        } else if ((tmp = Utils.escapedHexLen(ch)) > 0) {
          hexLength = tmp;
          hexResult = 0;

          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);

            if ((tmp = Utils.fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              Guard.Throw("expected hexadecimal character", state);
            }
          }

          state.result += Utils.charFromCodepoint(hexResult);
          state.position++;
        } else {
          Guard.Throw("unknown escape sequence", state);
        }

        captureStart = captureEnd = state.position;
      } else if (Metadata.CHARS.EOLs.includes(ch)) {
        this.captureSegment(state, captureStart, captureEnd, true);
        this.writeFoldedLines(state, this.skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && this.testDocumentSeparator(state)) {
        Guard.Throw("unexpected end of the document within a double quoted scalar", state);
      } else {
        state.position++;
        captureEnd = state.position;
      }
    }

    Guard.Throw("unexpected end of the stream within a double quoted scalar", state);
  }

  static readFlowCollection(state, nodeIndent) {
    let readNext = true,
      _line,
      _lineStart,
      _pos,
      _tag = state.tag,
      _result,
      _anchor = state.anchor,
      following,
      terminator,
      isPair,
      isExplicitPair,
      isMapping,
      overridableKeys = Object.create(null),
      keyNode,
      keyTag,
      valueNode,
      ch;

    ch = state.input.charCodeAt(state.position);

    if (ch === 0x5b /* [ */) {
      terminator = 0x5d; /* ] */
      isMapping = false;
      _result = [];
    } else if (ch === 0x7b /* { */) {
      terminator = 0x7d; /* } */
      isMapping = true;
      _result = {};
    } else {
      return false;
    }

    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }

    ch = state.input.charCodeAt(++state.position);

    while (ch !== 0) {
      this.skipSeparationSpace(state, true, nodeIndent);

      ch = state.input.charCodeAt(state.position);

      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else {
        Guard.Against(!readNext, "missed comma between flow collection entries", state);
        Guard.Against(!ch === 0x2c, "expected the node content, but found ','",state);
      }

      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;

      if (ch === 0x3f /* ? */) {
        following = state.input.charCodeAt(state.position + 1);

        if (Utils.is_WS_OR_EOL(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          this.skipSeparationSpace(state, true, nodeIndent);
        }
      }

      _line = state.line; // Save the current line.
      _lineStart = state.lineStart;
      _pos = state.position;
      this.composeNode(state, nodeIndent, Metadata.CONTEXT.FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      this.skipSeparationSpace(state, true, nodeIndent);

      ch = state.input.charCodeAt(state.position);

      if ((isExplicitPair || state.line === _line) && ch === 0x3a /* : */) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        this.skipSeparationSpace(state, true, nodeIndent);
        this.composeNode(state, nodeIndent, Metadata.CONTEXT.FLOW_IN, false, true);
        valueNode = state.result;
      }

      if (isMapping) {
        this.storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(this.storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }

      this.skipSeparationSpace(state, true, nodeIndent);

      ch = state.input.charCodeAt(state.position);

      if (ch === 0x2c /* , */) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }

    Guard.Throw("unexpected end of the stream within a flow collection", state);
  }

  static readBlockScalar(state, nodeIndent) {
    let captureStart,
      folding,
      chomping = Metadata.CHOMPING.CLIP,
      didReadContent = false,
      detectedIndent = false,
      textIndent = nodeIndent,
      emptyLines = 0,
      atMoreIndented = false,
      tmp,
      ch;

    ch = state.input.charCodeAt(state.position);

    if (ch === 0x7c /* | */) {
      folding = false;
    } else if (ch === 0x3e /* > */) {
      folding = true;
    } else {
      return false;
    }

    state.kind = "scalar";
    state.result = "";

    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);

      if (ch === 0x2b /* + */ || ch === 0x2d /* - */) {
        if (Metadata.CHOMPING.CLIP === chomping) {
          chomping = (ch === 0x2b) ? Metadata.CHOMPING.KEEP: Metadata.CHOMPING.STRIP;
        } else {
          Guard.Throw("repeat of a chomping mode identifier", state);
        }
      } else if ((tmp = Utils.fromDecimalCode(ch)) >= 0) {
        Guard.Against(tmp === 0, "bad explicit indentation width of a block scalar; it cannot be less than one", state);
        Guard.Against(!!detectedIndent, "repeat of an indentation width identifier", state);
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        break;
      }
    }

    if (Metadata.CHARS.WHITE_SPACES.includes(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (Metadata.CHARS.WHITE_SPACES.includes(ch));

      if (ch === 0x23 /* # */) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!Metadata.CHARS.EOLs.includes(ch) && ch !== 0);
      }
    }

    while (ch !== 0) {
      this.readLineBreak(state);
      state.lineIndent = 0;

      ch = state.input.charCodeAt(state.position);

      while (
        (!detectedIndent || state.lineIndent < textIndent) &&
        ch === 0x20 /* Space */
      ) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }

      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }

      if (Metadata.CHARS.EOLs.includes(ch)) {
        emptyLines++;
        continue;
      }

      // End of the scalar.
      if (state.lineIndent < textIndent) {
        // Perform the chomping.
        if (chomping === Metadata.CHOMPING.KEEP) {
          state.result += "\n".repeat(
            didReadContent ? 1 + emptyLines : emptyLines
          );
        } else if (chomping === Metadata.CHOMPING.CLIP) {
          if (didReadContent) {
            // i.e. only if the scalar is not empty.
            state.result += "\n";
          }
        }

        // Break this `while` cycle and go to the funciton's epilogue.
        break;
      }

      // Folded style: use fancy rules to handle line breaks.
      if (folding) {
        // Lines starting with white space characters (more-indented lines) are not folded.
        if (Metadata.CHARS.WHITE_SPACES.includes(ch)) {
          atMoreIndented = true;
          // except for the first content line (cf. Example 8.1)
          state.result += "\n".repeat(
            didReadContent ? 1 + emptyLines : emptyLines
          );

          // End of more-indented block.
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += "\n".repeat(emptyLines + 1);

          // Just one line break - perceive as the same line.
        } else if (emptyLines === 0) {
          if (didReadContent) {
            // i.e. only if we have already read some scalar content.
            state.result += " ";
          }

          // Several line breaks - perceive as different lines.
        } else {
          state.result += "\n".repeat(emptyLines);
        }

        // Literal style: just add exact number of line breaks between content lines.
      } else {
        // Keep all line breaks except the header line break.
        state.result += "\n".repeat(
          didReadContent ? 1 + emptyLines : emptyLines
        );
      }

      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      captureStart = state.position;

      while (!Metadata.CHARS.EOLs.includes(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }

      this.captureSegment(state, captureStart, state.position, false);
    }

    return true;
  }

  static readBlockSequence(state, nodeIndent) {
    let _line,
      _tag = state.tag,
      _anchor = state.anchor,
      _result = [],
      following,
      detected = false,
      ch;

    // there is a leading tab before this token, so it can't be a block sequence/mapping;
    // it can still be flow sequence/mapping or a scalar
    if (state.firstTabInLine !== -1) return false;

    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }

    ch = state.input.charCodeAt(state.position);

    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        Guard.Throw("tab characters must not be used in indentation", state);
      }

      if (ch !== 0x2d /* - */) {
        break;
      }

      following = state.input.charCodeAt(state.position + 1);

      if (!Utils.is_WS_OR_EOL(following)) {
        break;
      }

      detected = true;
      state.position++;

      if (this.skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }

      _line = state.line;
      this.composeNode(
        state,
        nodeIndent,
        Metadata.CONTEXT.BLOCK_IN,
        false,
        true
      );
      _result.push(state.result);
      this.skipSeparationSpace(state, true, -1);

      ch = state.input.charCodeAt(state.position);

      Guard.Against(
        (state.line === _line || state.lineIndent > nodeIndent) && ch !== 0,
        "bad indentation of a sequence entry",
        state
      );
      if (state.lineIndent < nodeIndent) {
        break;
      }
    }

    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }

  static readBlockMapping(state, nodeIndent, flowIndent) {
    let following,
      allowCompact,
      _line,
      _keyLine,
      _keyLineStart,
      _keyPos,
      _tag = state.tag,
      _anchor = state.anchor,
      _result = {},
      overridableKeys = Object.create(null),
      keyTag = null,
      keyNode = null,
      valueNode = null,
      atExplicitKey = false,
      detected = false;

    // there is a leading tab before this token, so it can't be a block sequence/mapping;
    // it can still be flow sequence/mapping or a scalar
    if (state.firstTabInLine !== -1) return false;

    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }

    let ch = state.input.charCodeAt(state.position);

    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        Guard.Throw("tab characters must not be used in indentation", state);
      }

      following = state.input.charCodeAt(state.position + 1);
      _line = state.line; // Save the current line.

      // Explicit notation case. There are two separate blocks:
      // first for the key (denoted by "?") and second for the value (denoted by ":")
      if ((ch === 0x3f /* ? */ || ch === 0x3a /*: */) && Utils.is_WS_OR_EOL(following)) {
        if (ch === 0x3f /* ? */) {
          if (atExplicitKey) {
            this.storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }

          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          // i.e. 0x3A/* : */ === character after the explicit key.
          atExplicitKey = false;
          allowCompact = true;
        } else {
          Guard.Throw("incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line",state);
        }

        state.position += 1;
        ch = following;

        // Implicit notation case. Flow-style node as the key first, then ":", and the value.
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;

        if (!this.composeNode(state, flowIndent, Metadata.CONTEXT.FLOW_OUT, false, true)) {
          // Neither implicit nor explicit notation. Reading is done. Go to the epilogue.
          break;
        }

        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);

          while (Metadata.CHARS.WHITE_SPACES.includes(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }

          if (ch === 0x3a /* : */) {
            ch = state.input.charCodeAt(++state.position);

            Guard.Against(!Utils.is_WS_OR_EOL(ch), "a whitespace character is expected after the key-value separator within a block mapping", state);

            if (atExplicitKey) {
              this.storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }

            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else {
            Guard.Against(detected, "can not read an implicit mapping pair; a colon is missed", state);
            state.tag = _tag;
            state.anchor = _anchor;
            return true; // Keep the result of `composeNode`.
          }
        } else {
          Guard.Against(detected, "can not read a block mapping entry; a multiline key may not be an implicit key", state);
          state.tag = _tag;
          state.anchor = _anchor;
          return true; // Keep the result of `composeNode`.
        }
      }

      // Common reading code for both explicit and implicit notations.
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }

        if (this.composeNode(state, nodeIndent, Metadata.CONTEXT.BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }

        if (!atExplicitKey) {
          this.storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }

        this.skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }

      Guard.Against((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0, "bad indentation of a mapping entry", state);
      if (state.lineIndent < nodeIndent) {
        break;
      }
    }

    // Special case: last mapping's node contains only the key in explicit notation.
    if (atExplicitKey) {
      this.storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }

    // Expose the resulting mapping.
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }

    return detected;
  }

  static readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;

    let ch = state.input.charCodeAt(state.position);

    if (ch !== 0x21 /* ! */) return false;

    Guard.Against(state.tag !== null, "duplication of a tag property", state);

    ch = state.input.charCodeAt(++state.position);

    if (ch === 0x3c /* < */) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 0x21 /* ! */) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }

    let _position = state.position;

    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 0x3e /* > */);

      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        Guard.Throw("unexpected end of the stream within a verbatim tag",state);
      }
    } else {
      while (ch !== 0 && !Utils.is_WS_OR_EOL(ch)) {
        if (ch === 0x21 /* ! */) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            Guard.Against(!Metadata.PATTERNS.TAG_HANDLE.test(tagHandle), "named tag handle cannot contain such characters", state);
            isNamed = true;
            _position = state.position + 1;
          } else {
            Guard.Throw("tag suffix cannot contain exclamation marks", state);
          }
        }

        ch = state.input.charCodeAt(++state.position);
      }

      tagName = state.input.slice(_position, state.position);
      Guard.Against(Metadata.PATTERNS.FLOW_INDICATORS.test(tagName), "tag suffix cannot contain flow indicator characters", state);
    }

    Guard.Against(tagName && !Metadata.PATTERNS.TAG_URI.test(tagName), "tag name cannot contain such characters: " + tagName, state);

    tagName = decodeURIComponent(tagName);

    if (isVerbatim) {
      state.tag = tagName;
    } else if (Utils._hasOwnProperty.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = tagName;
    } else {
      Guard.Throw('undeclared tag handle "' + tagHandle + '"', state);
    }

    return true;
  }

  static readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);

    if (ch !== 0x26 /* & */) return false;
    Guard.Against(state.anchor !== null, "duplication of an anchor property", state);

    ch = state.input.charCodeAt(++state.position);
    let _position = state.position;

    while (ch !== 0 && !Utils.is_WS_OR_EOL(ch) && !Metadata.CHARS.FLOW_INDICATORS.includes(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }

    Guard.Against(state.position === _position, "name of an anchor node must contain at least one character", state);

    state.anchor = state.input.slice(_position, state.position);
    return true;
  }

  static readAlias(state) {
    let _position, alias, ch;

    ch = state.input.charCodeAt(state.position);

    if (ch !== 0x2a /* * */) return false;

    ch = state.input.charCodeAt(++state.position);
    _position = state.position;

    while (ch !== 0 && !Utils.is_WS_OR_EOL(ch) && !Metadata.CHARS.FLOW_INDICATORS.includes(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    Guard.Against(state.position === _position, "name of an alias node must contain at least one character", state);

    alias = state.input.slice(_position, state.position);

    Guard.Against(!Utils._hasOwnProperty.call(state.anchorMap, alias), 'unidentified alias "' + alias + '"', state);

    state.result = state.anchorMap[alias];
    this.skipSeparationSpace(state, true, -1);
    return true;
  }

  static composeNode(state,parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockStyles,
      allowBlockScalars,
      allowBlockCollections,
      indentStatus = 1, // 1: this>parent, 0: this=parent, -1: this<parent
      atNewLine = false,
      hasContent = false,
      typeIndex,
      typeQuantity,
      typeList,
      type,
      flowIndent,
      blockIndent;

    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;

    allowBlockStyles = allowBlockScalars = allowBlockCollections = 
          Metadata.CONTEXT.BLOCK_OUT === nodeContext || Metadata.CONTEXT.BLOCK_IN === nodeContext;

    if (allowToSeek) {
      if (this.skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }

    if (indentStatus === 1) {
      while (this.readTagProperty(state) || this.readAnchorProperty(state)) {
        if (this.skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;

          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }

    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }

    if (indentStatus === 1 || Metadata.CONTEXT.BLOCK_OUT === nodeContext) {
      const extra =  (Metadata.CONTEXT.FLOW_IN === nodeContext || Metadata.CONTEXT.FLOW_OUT === nodeContext) ? 0: 1;
      flowIndent = parentIndent + extra;
    
      blockIndent = state.position - state.lineStart;

      if (indentStatus === 1) {
        if ((allowBlockCollections &&
                    (this.readBlockSequence(state, blockIndent) ||
                    this.readBlockMapping(state, blockIndent, flowIndent))) ||
                    this.readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          if ((allowBlockScalars && this.readBlockScalar(state, flowIndent)) ||
                    this.readSingleQuotedScalar(state, flowIndent) ||
                    this.readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (this.readAlias(state)) {
            hasContent = true;
            Guard.Against(state.tag !== null || state.anchor !== null, "alias node should not have any properties",state);
          } else if (this.readPlainScalar(state, flowIndent, Metadata.CONTEXT.FLOW_IN === nodeContext)) {
            hasContent = true;
            state.tag ??= "?";
          }

          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
        }
      } else if (indentStatus === 0) {
        // block sequences are allowed to have same indentation level as the parent.
        // http://www.yaml.org/spec/1.2/spec.html#id2799784
        hasContent = allowBlockCollections && this.readBlockSequence(state, blockIndent);
      }
    }

    if (state.tag === null) {
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    } else if (state.tag === "?") {
      for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity;typeIndex += 1) {
        type = state.implicitTypes[typeIndex];

        if (Typer.Resolve(type, state.result)) {
          // `state.result` updated in resolver if matched
          state.result = Typer.Construct(type, state.result);
          state.tag = type.tag;
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (
        Utils._hasOwnProperty.call(
          state.typeMap[state.kind || "fallback"],
          state.tag
        )
      ) {
        type = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        // looking for multi type
        type = null;
        typeList = state.typeMap.multi[state.kind || "fallback"];

        for (
          typeIndex = 0, typeQuantity = typeList.length;
          typeIndex < typeQuantity;
          typeIndex += 1
        ) {
          if (
            state.tag.slice(0, typeList[typeIndex].tag.length) ===
            typeList[typeIndex].tag
          ) {
            type = typeList[typeIndex];
            break;
          }
        }
      }

      Guard.Against(!type, "unknown tag !<" + state.tag + ">", state);
      Guard.Against(state.result !== null && type.kind !== state.kind,`unacceptable node kind for !<${state.tag}> tag; it should be "${type.kind}", not "${state.kind}"`,state);
      Guard.Against(!Typer.Resolve(type, state.result, state.tag), `cannot resolve a node with <${state.tag}> explicit tag`, state);
      state.result = Typer.Construct(type, state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }

    return state.tag !== null || state.anchor !== null || hasContent;
  }

  static readDocument(state) {
    let documentStart = state.position;
    let _position, directiveName, directiveArgs;
    let hasDirectives = false;
    let ch;

    state.tagMap = {};
    state.anchorMap = {};

    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      this.skipSeparationSpace(state, true, -1);

      ch = state.input.charCodeAt(state.position);

      if (state.lineIndent > 0 || ch !== 0x25 /* % */) {
        break;
      }

      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      _position = state.position;

      while (ch !== 0 && !Utils.is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }

      let directiveName = state.input.slice(_position, state.position);
      directiveArgs = [];

      Guard.Against(directiveName.length < 1, "directive name must not be less than one character in length", state);

      while (ch !== 0) {
        while (Metadata.CHARS.WHITE_SPACES.includes(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }

        if (ch === 0x23 /* # */) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !Metadata.CHARS.EOLs.includes(ch));
          break;
        }

        if (Metadata.CHARS.EOLs.includes(ch)) 
          break;

        _position = state.position;
        while (ch !== 0 && !Utils.is_WS_OR_EOL(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }

        directiveArgs.push(state.input.slice(_position, state.position));
      }

      if (ch !== 0) this.readLineBreak(state);

      if (Utils._hasOwnProperty.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        Guard.Warn('unknown document directive "' + directiveName + '"', state);
      }
    }

    this.skipSeparationSpace(state, true, -1);

    if (
      state.lineIndent === 0 &&
      state.input.charCodeAt(state.position) === 0x2d /* - */ &&
      state.input.charCodeAt(state.position + 1) === 0x2d /* - */ &&
      state.input.charCodeAt(state.position + 2) === 0x2d /* - */
    ) {
      state.position += 3;
      this.skipSeparationSpace(state, true, -1);
    } else {
      Guard.Against(hasDirectives, "directives end mark is expected", state);
    }

    this.composeNode(state, state.lineIndent - 1, Metadata.CONTEXT.BLOCK_OUT, false, true);
    this.skipSeparationSpace(state, true, -1);

    state.documents.push(state.result);

    if (state.position === state.lineStart && this.testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 0x2e /* . */) {
        state.position += 3;
        this.skipSeparationSpace(state, true, -1);
      }
      return;
    }
    Guard.Against(state.position < state.length - 1, "end of the stream or a document separator is expected", state);
  }

  static advanceToNonSpace(state) {
    while (state.input.charCodeAt(state.position) === 0x20 /* Space */) {
      state.lineIndent += 1;
      state.position += 1;
    }
  }

  static Parse(input) {
    input = String(input);

    if (input.length !== 0) {
      input = Utils.EnsureFinalNewline(input);
      input = Utils.StripBOM(input);
    }

    const state = Metadata.NEW_STATE;
    state.input = input;
    state.length = input.length;

    Guard.AgainstNullByte(state);
    state.input = Utils.TerminateWithNull(state.input);
    this.advanceToNonSpace(state);

    while (state.position < state.length - 1) {
      this.readDocument(state);
    }
    return state.documents;
  }
};
