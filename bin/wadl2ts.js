var fs = require("fs");
var sax = require("sax");
var request = require('sync-request');
if (process.argv.length < 5) {
    console.error('parameter error.');
    process.exit(0);
}
var outPath = process.argv[2];
var moduleName = process.argv[3];
var wadlUrl = process.argv[4];
function capitalize(s) {
    return s && s[0].toUpperCase() + s.slice(1);
}
function uncapitalize(s) {
    return s && s[0].toLowerCase() + s.slice(1);
}
function convertType(type) {
    if (type === 'xs:short' || type === 'xs:int' || type === 'xs:long' || type === 'xs:float' || type === 'xs:double' || type === 'xs:decimal') {
        return 'number';
    }
    else if (type === 'xs:boolean') {
        return 'boolean';
    }
    else if (type === 'xs:string') {
        return 'string';
    }
    else if (type.indexOf("xs:") === 0) {
        return 'any';
    }
    return capitalize(type);
}
function indent(level) {
    var result = '';
    for (var i = 0; i < level; i++) {
        result += '  ';
    }
    return result;
}
function getTsByWadl(src) {
    var parser = sax.parser(true);
    var level = 0;
    var paths = [];
    var responseType = null;
    var result = '';
    var method = null;
    var sendObjectString = null;
    var baseUri = null;
    var xsdIncludeHref = null;
    parser.onopentag = function (node) {
        if (node.name === 'resources') {
            baseUri = node.attributes.base;
            result += "export var baseUri = '" + baseUri + "';\n";
            result += 'export var x2js = new X2JS();\n';
        }
        else if (node.name === 'include') {
            xsdIncludeHref = node.attributes.href;
        }
        else if (node.name === 'resource') {
            paths[level] = node.attributes.path;
            result += indent(level) + 'export module ' + node.attributes.path + ' {\n';
            level++;
        }
        else if (node.name === 'method') {
            method = node.attributes.name;
            result += indent(level) + 'export function ' + method.toLowerCase() + '(';
            sendObjectString = '';
            level++;
        }
        else if (node.name === 'param') {
            result += node.attributes.name + ': ' + convertType(node.attributes.type) + ', ';
            sendObjectString += node.attributes.name + ': ' + node.attributes.name + ', ';
        }
        else if (node.name === 'ns2:representation') {
            responseType = capitalize(node.attributes.element);
        }
    };
    parser.onclosetag = function (tagName) {
        if (tagName === 'resource') {
            level--;
            result += indent(level) + '}\n';
        }
        else if (tagName === 'method') {
            level--;
            result += 'callback: (response: ' + responseType + ') => void, options: AjaxOptions = {}): void {\n';
            var url = '';
            for (var i = 0; i < level; i++) {
                if (i !== 0) {
                    url += "/";
                }
                url += paths[i];
            }
            var reasonTypeUnCap = uncapitalize(responseType);
            result += indent(level + 1) + "var settings = <JQueryAjaxSettings>options;\n";
            result += indent(level + 1) + "settings.dataType = 'xml';\n";
            result += indent(level + 1) + ("settings.type = '" + method + "';\n");
            result += indent(level + 1) + ("settings.url = baseUri + '" + url + "';\n");
            result += indent(level + 1) + ("settings.data = {" + sendObjectString + "};\n");
            result += indent(level + 1) + ("settings.success = (res: any)=>{callback(<" + responseType + ">((<any>x2js.xml2json(res))." + reasonTypeUnCap + "));};\n");
            result += indent(level + 1) + "$.ajax(settings);\n";
            result += indent(level) + '}\n';
        }
    };
    parser.write(src).close();
    return { wadlText: result, xsdPath: xsdIncludeHref };
}
function getTsByXsd(src) {
    var isOpendComplexTag = false;
    var result = '';
    var parser = sax.parser(true);
    parser.onopentag = function (node) {
        if (node.name === 'xs:complexType') {
            result += 'export interface ' + capitalize(node.attributes.name) + ' {\n';
            isOpendComplexTag = true;
        }
        else if (node.name === 'xs:element' && isOpendComplexTag) {
            result += '  ' + node.attributes.name + ': ' + convertType(node.attributes.type) + ((node.attributes.maxOccurs > '1' || node.attributes.maxOccurs === 'unbounded') ? '[]' : '') + ';\n';
        }
    };
    parser.onclosetag = function (tagName) {
        if (tagName === 'xs:complexType') {
            result += '}';
            isOpendComplexTag = false;
        }
    };
    parser.write(src).close();
    return result;
}
function readResource(path) {
    var ret = null;
    if ((/^https?:\/\//).test(path)) {
        console.info(path);
        var res = request('GET', path);
        ret = res.getBody('UTF-8');
    }
    else {
        ret = fs.readFileSync(path, 'UTF-8');
    }
    return ret;
}
var wadlSet = getTsByWadl(readResource(wadlUrl));
var xsdPath = null;
if ((/^https?:\/\//).test(wadlSet.xsdPath)) {
    xsdPath = wadlUrl + wadlSet.xsdPath;
}
else {
    xsdPath = wadlSet.xsdPath;
}
var xsdText = getTsByXsd(readResource(xsdPath));
var text = "\n/// <reference path=\"typings/jquery/jquery.d.ts\" />\n/// <reference path=\"typings/x2js/xml2json.d.ts\" />\n\nmodule " + moduleName + " {\n\ninterface AjaxOptions {\n    accepts?: any;\n    async?: boolean;\n    beforeSend? (jqXHR: JQueryXHR, settings: JQueryAjaxSettings): any;\n    cache?: boolean;\n    complete? (jqXHR: JQueryXHR, textStatus: string): any;\n    contents?: { [key: string]: any; };\n    contentType?: any;\n    context?: any;\n    converters?: { [key: string]: any; };\n    crossDomain?: boolean;\n    dataFilter? (data: any, ty: any): any;\n    error? (jqXHR: JQueryXHR, textStatus: string, errorThrown: string): any;\n    global?: boolean;\n    headers?: { [key: string]: any; };\n    ifModified?: boolean;\n    isLocal?: boolean;\n    jsonp?: any;\n    jsonpCallback?: any;\n    mimeType?: string;\n    password?: string;\n    processData?: boolean;\n    scriptCharset?: string;\n    statusCode?: { [key: string]: any; };\n    timeout?: number;\n    traditional?: boolean;\n    type?: string;\n    username?: string;\n    xhr?: any;\n    xhrFields?: { [key: string]: any; };\n}\n\n" + xsdText + "\n\n" + wadlSet.wadlText + "\n\n}\n";
var exists = fs.existsSync(outPath);
if (exists) {
    console.error('Already exists.');
}
else {
    fs.writeFileSync(outPath, text, { encoding: 'UTF-8' });
    console.info('Success. generated.');
}
