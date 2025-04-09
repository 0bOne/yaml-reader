module.exports = {
    NEW_STATE: {
          input: null,
          length: 0,
          schema: null,
          implicitTypes: [
                {tag: "null", kind: "scalar"},
                {tag: "bool", kind: "scalar"},
                {tag: "int", kind: "scalar"},
                {tag: "float", kind: "scalar"},
                {tag: "timestamp",kind: "scalar"},
                {tag: "merge",kind: "scalar"}
            ],
          typeMap: {
                scalar: {
                    null: {tag: "null", kind: "scalar"},
                    bool: {tag: "bool", kind: "scalar"},
                    int: {tag: "int", kind: "scalar"},
                    float: {tag: "float", kind: "scalar"},
                    timestamp: {tag: "timestamp", kind: "scalar"},
                    merge: {tag: "merge", kind: "scalar"},
                    str: {tag: "str", kind: "scalar"},
                    binary: {tag: "binary", kind: "scalar"}
                },
                sequence: {
                    seq: {tag: "seq", kind: "sequence"},
                    omap: {tag: "omap", kind: "sequence"},
                    pairs: {tag: "pairs", kind: "sequence"}
                },
                mapping: {
                    map: {tag: "map", kind: "mapping"},
                    set: {tag: "set", kind: "mapping"}
                },
                fallback: {
                    null: {tag: "null", kind: "scalar"},
                    bool: {tag: "bool", kind: "scalar"},
                    int: {tag: "int", kind: "scalar"},
                    float: {tag: "float", kind: "scalar"},
                    timestamp: {tag: "timestamp", kind: "scalar"},
                    merge: {tag: "merge", kind: "scalar"},
                    str: {tag: "str", kind: "scalar"},
                    seq: {tag: "seq", kind: "sequence"},
                    map: {tag: "map", kind: "mapping"},
                    binary: {tag: "binary", kind: "scalar"},
                    omap: {tag: "omap", kind: "sequence"},
                    pairs: {tag: "pairs", kind: "sequence"},
                    set: {tag: "set", kind: "mapping"}
                }
            },
          json: false,
          position: 0,
          line: 0,
          lineStart: 0,
          lineIndent: 0,
          firstTabInLine: -1,
          documents: []
    },
    CONTEXT: {
        FLOW_IN: 1,
        FLOW_OUT: 2,
        BLOCK_IN: 3,
        BLOCK_OUT: 4
    },
    CHOMPING: {
        CLIP: 1,
        STRIP: 2,
        KEEP: 3
    },
    PATTERNS: {
        NON_PRINTABLE       : /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,
        NON_ASCII_LINE_BREAKS : /[\x85\u2028\u2029]/,
        FLOW_INDICATORS     : /[,\[\]\{\}]/,
        TAG_HANDLE          : /^(?:!|!!|![a-z\-]+!)$/i,
        TAG_URI             : /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i,
        FLOAT               : new RegExp(
                                // 2.5e4, 2.5 and integers
                                '^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?' +
                                // .2e4, .2
                                // special case, seems not from spec
                                '|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?' +
                                // .inf
                                '|[-+]?\\.(?:inf|Inf|INF)' +
                                // .nan
                                '|\\.(?:nan|NaN|NAN))$'),
        DATE                : new RegExp(
                                    '^([0-9][0-9][0-9][0-9])'          + // [1] year
                                    '-([0-9][0-9])'                    + // [2] month
                                    '-([0-9][0-9])$'                     // [3] day
                                ),
        TIMESTAMP           : new RegExp(
                                    '^([0-9][0-9][0-9][0-9])'          + // [1] year
                                    '-([0-9][0-9]?)'                   + // [2] month
                                    '-([0-9][0-9]?)'                   + // [3] day
                                    '(?:[Tt]|[ \\t]+)'                 + // ...
                                    '([0-9][0-9]?)'                    + // [4] hour
                                    ':([0-9][0-9])'                    + // [5] minute
                                    ':([0-9][0-9])'                    + // [6] second
                                    '(?:\\.([0-9]*))?'                 + // [7] fraction
                                    '(?:[ \\t]*(Z|([-+])([0-9][0-9]?)' + // [8] tz [9] tz_sign [10] tz_hour
                                    '(?::([0-9][0-9]))?))?$'             // [11] tz_minute
                            )   
    },
    CHARS: {
        BINARY: "01",
        OCTAL: "012345678",
        DECIMAL: "0123456789",
        HEXADECIMAL: "0123456789ABCDEFabcdef",
        EOLs: [
            0x0A, /* LF */
            0x0D/* CR */
        ],
        WHITE_SPACES: [
            0x09,/* Tab */
            0x20/* Space */
        ],
        FLOW_INDICATORS: [
            0x2C,/* , */
            0x5B,/* [ */
            0x5D,/* ] */
            0x7B,/* { */
            0x7D,/* } */
        ],
        NOT_SCALAR: [
            0x23,/* # */ 
            0x26, /* & */
            0x2A, /* * */ 
            0x21, /* ! */ 
            0x7C, /* | */
            0x3E, /* > */
            0x27, /* ' */
            0x22, /* " */
            0x25, /* % */
            0x40, /* @ */
            0x60, /* ` */
        ]
    },
    ESCAPE_MAP: {
        0x30: '\x00',  // 0
        0x61: '\x07',  // a
        0x62: '\x08',  // b
        0x74: '\x09',  // t
        0x09: '\x09',  // Tab
        0x6E: '\x0A',  // n
        0x76: '\x0B',  // v
        0x66: '\x0C',  // f
        0x72: '\x0D',  // r
        0x65: '\x1B',  // e
        0x20: ' ',     // space
        0x22: '"',     // "
        0x2F: '/',     // /
        0x5C: '\\',    // \
        0x4E: '\x85',  // N
        0x5F: '\xA0',  // _
        0x4C: '\u2028',// L
        0x50: '\u2029' // P
    },
    ESCAPE_CHECK: [
        0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,
        1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,
        0,1,1,0,0,1,1,0,0,0,0,0,0,0,1,0,
        0,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
    ],
    ESCAPE_MAP_EX: [
        "","","","","","","","","","\t","","","","","","",
        "","","","","","","","","","","","","","","","",
        " ","","\"","","","","","","","","","","","","","/",
        "\u0000","","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","\\","",""," ",
        "","\u0007","\b","","","\u001b","\f","","","","","","","","\n","",
        "","","\r","","\t","","\u000b","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","","","","","","","","","",
        "","","","","","","",""
    ],
    HexLengths: {
        0x78: 2,
        0x75: 4,
        0x55: 8
    },
    BASE64_MAP: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r',
    NULL_STRINGS: [
        "null",
        "Null",
        "NULL",
        "~"
    ],
    TRUE_STRINGS: [
        "true", 
        "True",
        "TRUE"
    ],
     FALSE_STRINGS:[
        "false",
        "False",
        "FALSE"
    ],
    RADIX_NAME_MAP: {
        b: "BINARY",
        x: "HEXADECIMAL",
        o: "OCTAL"
    },
    RADIX_MAP: {
        b: 2,
        x: 16,
        o: 8
    }
};
