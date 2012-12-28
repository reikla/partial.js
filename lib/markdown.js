var utils = require('./utils');
var fs = require('fs');

function Markdown() {

    this.block = '===';

    var regEmpty = new RegExp(/^\s/);
    var regFormat = /\*{1,2}.*?\*{1,2}|_{1,3}.*?_{1,3}/g;

    function Table(columnCount, width) {
        this.columnCount = columnCount || 0;
        this.width = width || 0;
        this.rows = [];
    };

    function Row(index) {
        this.index = index || 0;
        this.columns = [];
    };

    function Column(index, size, value) {
        this.index = index || 0;
        this.size = size || 0;
        this.value = value || '';
    };

    function UL(type, index, indent, value) {
        this.type = type || '';
        this.index = index || 0;
        this.indent = indent || 0;
        this.value = value || '';
    };

    // params -> type, string
    this.onLine = null;

    // params -> type, string[]
    this.onLines = null;

    // params -> UL[]
    this.onUL = null;

    // params -> Table
    this.onTable = null;

    // params –> name, url, return TAG
    this.onLink = null;

    // params -> type, value, return TAG
    this.onFormat = null;

    // params -> type, name, value, return TAG
    this.onKeyword = null;

    // params –> alt, url, width, height, return TAG
    this.onImage = null;

    function $isFill(text, c) {
        for (var i = 0; i < text.Length; i++) {
            if (text[i] != c)
                return false;
        }
        return true;
    };

    function $clean(text) {

        if (utils.isNullOrEmpty(text))
            return '';

        var buffer = [];
        for (var i = 0; i < text.length; i++) {

            var m = text.charCodeAt(i);
            if (m === 13 || m === 10)
                continue;

            buffer.push(text[i]);
        }

        return buffer.join('');
    };

    function $charCount(text, c) {
        
        var count = 0;
        for (var i = 0; i < text.Length; i++) {
            if (text[i] === c)
                count++;
        }

        return count;
    };

    function $nearest(text) {
        var c = text.match(/\w/);
        if (c == null)
            return ' ';
        return c.toString();
    };

    function $firstChar(text) {
        return text[0] || '\0';
    };

    function $isParagraph(c) {
        return c === '>' || c === '*' || c === '|' || c === '<';
    };

    function $isWhite(c) {
        return regEmpty.test(c);
    };

    function $isUL(text) {
        if (utils.isNullOrEmpty(text))
            return false;

        var c = $firstChar(text);

        if (c.match(/\W/) == null)
            c = $nearest(text);

        return (c === '-' || c === 'x' || c === '+') && text.indexOf(' ') > -1;
    };

    function $parse(text) {

        var index = 0;

        if (self.onLink != null) {
            text = $parseLink(text, function(value) {
                
                var url = '';
                index = value.indexOf("]:");
                
                if (index === -1) {
                    url = value.substring(1, value.length - 2);
                    return self.onLink(url, url);
                }

                var title = value.substring(1, index).trim();
                url = value.substring(index + 2).trim();
                return self.onLink(title, url);
            });
        }

        if (self.onImage != null) {
            text = $parseImage(text, function(value) {

                index = value.indexOf(']');
                var alt = value.substring(2, index - 2);
                var src = value.substring(index + 2);
                src = src.substring(0, src.length - 1);

                var width = 0;
                var height = 0;

                index = src.indexOf('#');
                if (index > 0) {
                    var arr = src.substring(index + 1).split('x');
                    width = arr[0] || 0;
                    height = arr[1] || 0;
                    src = src.substring(0, index);
                }

                return self.onImage(alt, src, width, height);
            });
        }

        if (self.onFormat != null) {
            text.match(regFormat, function(o) {
                
                if (o == null)
                    return;

                var m = o.toString();

                if (m.length < 3)
                    return;

                var max = 2;
                var isMax = false;

                switch (m[0]) {
                    case '*':
                        isMax = m.substring(0, 2) === "**";
                        
                        if (isMax)
                            max = m.length > 3 ? 4 : m.length;

                        text = text.replace(m, self.onFormat(isMax ? "**" : "*", isMax ? m.substring(2, max) : m.substring(1, m.length - 2)));
                        return;

                    case '_':
                        var count = m.substring(0, 3) === "___" ? 3 : m.substring(0, 2) === "__" ? 2 : 1;
                        text = text.replace(m, self.onFormat(m.substring(0, count), m.substring(count, m.length)));
                        return;
                }
            });
        }

        if (self.onKeyword != null) {
            text = $parseKeyword(text, function(val) {
                
                var key = val.substring(1);
                key = key.substring(0, key.length - 1);
                
                var value = "";

                index = key.indexOf('(');

                if (index > 0) {
                    value = key.substring(index + 1, key.length - (index + 2));
                    key = key.substring(0, index).trim();
                }

                var normal = val[0] == '[';
                return self.onKeyword(normal ? "[]" : "{}", key, value);
            });
        }

        return text.trim();
    };

    function $parseKeyword(text, cb) {

        if (utils.isNullOrEmpty(text))
            return text;

        var indexBegA = -1;
        var indexBegB = -1;
        var index = 0;
        var output = text;

        do {
            var c = text[index];
            switch (c) {
                case '[':
                    indexBegA = index;
                    indexBegB = -1;
                    break;
                case ']':
                    if (indexBegA > -1)
                    {
                        var value = text.substring(indexBegA, index + 1);
                        output = output.replace(value, cb(value));
                    }
                    break;

                case '{':
                    indexBegB = index;
                    indexBegA = -1;
                    break;

                case '}':
                    if (indexBegB > -1)
                    {
                        var value = text.substring(indexBegB, index + 1);
                        output = output.replace(value, cb(value));
                    }
                    break;
            }
            index++;
        } while (index < text.length);
        
        return output;
    };

    function $parseLink(text, cb) {

        if (utils.isNullOrEmpty(text))
            return text;

        var indexBeg = -1;
        var index = 0;
        var finded = false;

        var next = function(i) {
            return text[i] || '\0';
        };

        var prev = function(i) {
            return text[i - 1] || '\0';
        };

        var watch = function(c) {
            return c === '.' || c === ',' || c === '?' || c === '!';
        };

        var output = text;
        do {
            
            var c = text[index];
            switch (c) {
                case '[':
                    indexBeg = index;
                    finded = false;
                    break;

                case ']':
                    if (next(index + 1) == ':')
                    {
                        finded = true;
                        index++;
                        if (next(index + 1) == ' ')
                            index += 2;
                        continue;
                    }
                    break;
            }

            var isWhite = c === ' ' || c === '\t';
            var isEnd = index + 1 === text.length;
         
            if (finded && (isWhite || isEnd)) {
                var cp = prev(index - 1);

                if (watch(cp))
                    index -= 2;
                else if (isWhite)
                    index -= 1;
                else if (watch(c) && isEnd)
                    index--;

                var value = text.substring(indexBeg, index + 1);
                output = output.replace(value, cb(value));
                indexBeg = 0;
                finded = false;
            }

            index++;

        } while (index < text.length);

        index = 0;
        do {

            var c = text[index];

            switch (c)
            {
                case '<':
                    indexBeg = index;
                    break;
                case '>':
                    if (indexBeg > -1)
                    {
                        var value = text.substring(indexBeg, index + 1);
                        output = output.replace(value, cb(value));
                    }
                    break;
            }

            index++;
        } while (index < text.length);

        return output;
    };

    function $parseImage(text, cb) {

        if (utils.isNullOrEmpty(text))
            return text;

        var indexBeg = -1;
        var index = 0;
        var finded = false;

        var next = function(i) {
            return text[i] || '\0';
        };

        var isEnd = function(c) {
            var code = c.charCodeAt(0);
            return c === ' ' || c ==='\n' || c === '\t' || code === 13 || code == 10;
        };

        var output = text;

        do {

            var c = text[index];    
            switch (c) {

                case '!':
                    if (next(index + 1) === '[')
                        indexBeg = index;
                    break;
    
                case ']':
                    var nn = next(index + 1);
                    if (nn === '(' || nn === ' ') {
                        index++;
    
                        if (nn === ' ' && next(index + 1) === '(') {
                            index++;
                            finded = indexBeg > -1;
                        }
                        else if (nn === '(')
                            finded = indexBeg > -1;
    
                        continue;
                    }
                    break;
                case ')':
    
                    if (finded) {
                        var value = text.substring(indexBeg, index + 1);
                        output = output.replace(value, cb(value));
                        finded = false;
                    }
    
                    break;
            }          

            index++;
        } while (index < text.length);

        return output;
    };

    this.load = function(text) {

        var tmpTable = null;
        var tmpName = '';
        var tmp = [];
        var tmpUL = [];
        var lines = text.split('\n');
        
        var read = function(i) {
            return $clean(lines[i] || '');
        };

        var isBlock = false;
        var isTable = false;
        var skip = false;
        var index = 0;

        var flushUL = function() {
            if (self.onUL != null)
                self.onUL(tmpUL);
            else {
                tmpUL.forEach(function(o) {
                    self.onLine(null, o.value);
                });
            }

            tmpUL = [];
        };

        var flushParagraph = function() {
            isBlock = false;
            self.onLines(tmpName, tmp);
            tmp = [];
        };

        var blockLength = self.block.length;

        for (var i = 0; i < lines.length; i++)
        {
            var line = lines[i];

            // Kroky
            // 1. kontrola
            // 2. je blok?
            // 3. je tabuľka?
            // 4. je odsek, čiara?
            // 5. je UL?
            // 6. je paragraf?
            // 7. je nadpis?
            // 8. text

            if (skip)
            {
                skip = false;
                continue;
            }

            if (isBlock)
            {
                if (line.trim().substring(0, blockLength) === self.block)
                {
                    flushParagraph();
                    continue;
                }

                tmp.push(line);
                continue;
            }

            var m = $clean(line);

            if (m.length == 0) {
                self.onLine(null, "\n");
                continue;
            }

            var c = m[0] || '';

            // 2. je blok?
            if (line.substring(0, blockLength) === self.block)
            {
                index = m.lastIndexOf('=') + 1;
                if (index < m.length)
                {
                    tmpName = m.substring(index + 1).trim();
                    isBlock = true;
                    continue;
                }
            }

            // 3. je tabuľka?
            if (m.length > 1) {

                if (c === '|' && m[1] === '-' && m[m.length - 1] === '|') {
                    
                    isTable = !isTable;
                    if (isTable)
                    {
                        tmpTable = new Table();
                        tmpTable.columnCount = 0;
                        tmpTable.rows = [];
                    }
                    else
                    {
                        if (self.onTable != null && tmpTable != null)
                            self.onTable(tmpTable);
                    }
                    continue;
                }

                if (isTable)
                {
                    var columns = m.split('|');
                    var columnCount = columns.length - 2;
                    var row = new Row();

                    row.index = tmpTable.rows.length;
                    row.columns = [];

                    if (tmpTable.columnCount < columnCount)
                        tmpTable.columnCount = columnCount;

                    for (var j = 0; j < columns.length; j++)
                    {
                        var a = columns[j];
                        if (j > 0 && j < columns.length - 1)
                        {
                            row.columns.push(new Column(row.columns.length, a.length, $parse(a.trim())));
                            if (row.index === 0)
                                tmpTable.width += a.length;
                        }
                    }

                    tmpTable.rows.push(row);
                    continue;
                }
            }

            // 4. je odsek, čiara?
            if (m.length > 0 && (c === '*' || c === '-')) {

                if ($isFill(m, c)) {
                    self.onLine(c.toString(), m);
                    continue;
                }

            }

            var next = read(i + 1);

            // 5. je UL?
            if ($isUL(m)) {

                var value = m;
                var a = c;
                
                if ($isWhite(c)) {
                    a = $nearest(m);
                    value = value.substring(value.indexOf(a));
                }

                var ul = new UL(a, tmpUL.length, $charCount(m, c), $parse(value.substring(1)));
                tmpUL.push(ul);

                if (!$isUL(next))
                    flushUL();

                continue;
            }

            if (tmpUL.length > 0)
                flushUL();

            // 6. je paragraf?
            if ($isParagraph(c)) {

                if ($firstChar(tmpName) != c && tmp.length > 0)
                    flushParagraph();

                tmpName = c;
                tmp.push($parse(m.substring(1)));

                c = $firstChar(read(i + 1));

                if (!$isParagraph(c)) {
                    skip = true;
                    flushParagraph();
                }

                continue;
            }

            // 7. je nadpis?
            if (c === '#')
            {
                index = m.lastIndexOf(c);
                if (index != m.length)
                {
                    index++;
                    self.onLine(m.substring(0, index), m.substring(index, m.length).trim());
                    continue;
                }
            }

            // kontrola či nasledujíci riadok nie je čiara kvôli nadpisu
            if (m.length == next.length) {
                c = $firstChar(next);
                if (c === '-' || c === '=') {
                    self.onLine(c === '=' ? "#" : "##", m.trim());
                    skip = true;
                    continue;
                }
            }

            self.onLine(null, $parse(m));
        };
    };    

    var self = this;
};

exports.markdown = function() {
    return new Markdown();
};