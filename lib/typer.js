
const Metadata = require("./metadata");

class BaseObjectType {
    static Resolve(data) {
        return true;
    }
    static Construct(data) {
        return data ?? {};
    }
}

class BaseArrayType extends BaseObjectType {
    static Construct(data) {
        return data ?? [];
    }
}

class NullType {
    static Resolve(data) {
        return (data === null) || Metadata.NULL_STRINGS.includes(data);
    }

    static Construct(data) {
        return null;
    }
}

class BinaryType {

    static Resolve(data) {
        if (data == null) return false;
    
        let bitlen = 0;
        for (let i = 0; i < data.length; i++) {
          const code = Metadata.BASE64_MAP.indexOf(data[i]);
          if (code === -1) return false;     // invalid character
          if (code > 64) continue;           // CR/LF/padding
          bitlen += 6;
        }
        return bitlen % 8 === 0;
    }

    static Construct(data) {
        const input = data.replace(/[\r\n=]/g, '');
        const result = [];
        let bits = 0;
    
        for (let i = 0; i < input.length; i++) {
          if (i > 0 && i % 4 === 0) {
            result.push((bits >> 16) & 0xFF, (bits >> 8) & 0xFF, bits & 0xFF);
          }
          bits = (bits << 6) | Metadata.BASE64_MAP.indexOf(input[i]);
        }
    
        const rem = (input.length % 4) * 6;
        if (rem === 18) {
          result.push((bits >> 10) & 0xFF, (bits >> 2) & 0xFF);
        } else if (rem === 12) {
          result.push((bits >> 4) & 0xFF);
        } else if (rem === 0 && input.length) {
          result.push((bits >> 16) & 0xFF, (bits >> 8) & 0xFF, bits & 0xFF);
        }
    
        return new Uint8Array(result);
    }
}

class BooleanType {
    static Resolve(data) {
        if (data === null) return false;
        return Metadata.TRUE_STRINGS.includes(data) || Metadata.FALSE_STRINGS.includes(data);
    } 
    static Construct(data) {
        return Metadata.TRUE_STRINGS.includes(data);
    }
}

class FloatType {
    static Resolve(data) {
        return typeof data === 'string' &&
               Metadata.PATTERNS.FLOAT.test(data) &&
               data[data.length - 1] !== '_';
    }
      
    static Construct(data) {
        let value = data.replace(/_/g, '').toLowerCase();
        const sign = value.startsWith('-') ? -1 : 1;
        if (value[0] === '-' || value[0] === '+') value = value.slice(1);
    
        if (value === '.inf') return sign * Infinity;
        if (value === '.nan') return NaN;
        return sign * parseFloat(value);
    }  
}

class IntType {  
    static Resolve(data) {
        if (data === null) return false;
        let max = data.length, index = 0, hasDigits = false, ch;
        if (!max) return false;

        ch = data[index];

        // sign
        if (ch === '-' || ch === '+') {
            ch = data[++index];
        }

        //base
        let radixChars;
        
        if (ch === '0') {
            // 0
            if (index + 1 === max) return true;
            ch = data[++index];
            const radixName = Metadata.RADIX_NAME_MAP[ch];
            radixChars = Metadata.CHARS[radixName];
        }

        if (radixChars) {
            index++;
        } else {
            radixChars = Metadata.CHARS.DECIMAL;
        }

        for (; index < max; index++) {
            ch = data[index];
            if (ch === '_') continue;
            if (!radixChars.includes(data.charAt(index))) return false;
            hasDigits = true;
        }

        return hasDigits && ch !== '_';
    }
  
    static Construct(data) {
        var value = data, sign = 1, ch;

        if (value.indexOf('_') !== -1) {
            value = value.replace(/_/g, '');
        }

        ch = value[0];

        if (ch === '-' || ch === '+') {
            if (ch === '-') sign = -1;
            value = value.slice(1);
            ch = value[0];
        }

        if (value === '0') return 0;

        let radix = 10;
        if (ch === '0') {            
            radix = Metadata.RADIX_MAP[value[1]];
            if (radix) {
                value = value.slice(2);
            }
        }
        return sign * parseInt(value, radix);
    }
}

class TimestampType {

    static Resolve(data) {
        return typeof data === 'string' &&
          (Metadata.PATTERNS.DATE.test(data) || Metadata.PATTERNS.TIMESTAMP.test(data));
    }
  
    static Construct(data) {
        const match = Metadata.PATTERNS.DATE.exec(data) || Metadata.PATTERNS.TIMESTAMP.exec(data);
        if (!match) throw new Error('Date resolve error');
    
        const year = +match[1];
        const month = +match[2] - 1;
        const day = +match[3];
    
        if (!match[4]) {
          // Only date
          return new Date(Date.UTC(year, month, day));
        }
    
        const hour = +match[4];
        const minute = +match[5];
        const second = +match[6];
    
        let fraction = match[7] || '';
        fraction = +(fraction + '000').slice(0, 3); // pad to 3 digits
    
        let delta = 0;
        if (match[9]) {
          const tzSign = match[9] === '-' ? -1 : 1;
          const tzHour = +match[10];
          const tzMinute = +(match[11] || 0);
          delta = tzSign * (tzHour * 60 + tzMinute) * 60000;
        }
    
        const utc = Date.UTC(year, month, day, hour, minute, second, fraction);
        return new Date(utc - delta);
    }
}

class MergeType extends BaseObjectType {
    static Resolve(data) {
        return data === '<<' || data === null;
    }
}

class MapType extends BaseObjectType{};

class OMapType extends BaseArrayType {
    static Resolve(data) {
      if (data === null) return true;
      if (!Array.isArray(data)) return false;
  
      const seenKeys = new Set();
  
      for (const pair of data) {
        if (typeof pair !== 'object' || pair === null || Array.isArray(pair)) return false;
  
        const keys = Object.keys(pair);
        if (keys.length !== 1) return false;
  
        const key = keys[0];
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
      }
  
      return true;
    }
}
  
class PairsType {
    static Resolve(data) {
      if (data === null) return true;
      if (!Array.isArray(data)) return false;
  
      return data.every(pair =>
        typeof pair === 'object' &&
        pair !== null &&
        !Array.isArray(pair) &&
        Object.keys(pair).length === 1
      );
    }
  
    static Construct(data) {
      if (data === null) return [];
  
      return data.map(pair => {
        const [key] = Object.keys(pair);
        return [key, pair[key]];
      });
    }
}
  
class SetType extends BaseObjectType {
    static Resolve(data) {
      if (data === null) return true;
      return Object.entries(data).every(([_, value]) => value === null);
    }
}
 
class SeqType extends BaseArrayType {}

const Types = {
    null: NullType,
    binary: BinaryType,
    bool: BooleanType,
    float: FloatType,
    int: IntType,
    timestamp: TimestampType,
    merge: MergeType,
    map: MapType,
    omap: OMapType,
    pairs: PairsType,
    set: SetType,
    seq: SeqType
}

module.exports = class Typer {
    static Resolve(yamlType, data) {
        const t = Types[yamlType.tag];
        return t.Resolve(data)
    }

    static Construct(yamlType, data) {
        const t = Types[yamlType.tag];
        return t.Construct(data);
    }
}