/// <reference path="typings/node/node.d.ts" />

import http = require("http");
import fs = require("fs");

var sax = require("sax");
var request = require('sync-request');

if (process.argv.length < 5) {
    console.error('parameter error.');
    process.exit(0);
}

var outPath = process.argv[2]; // -o
var moduleName = process.argv[3]; // -m
var wadlUrl = process.argv[4];

interface Node {
    name: string;
    attributes: {name: string; type: string; maxOccurs: string; path: string; element: string; base: string; href: string}
}

function capitalize(s: string) {
    return s && s[0].toUpperCase() + s.slice(1);
}

function uncapitalize(s: string) {
    return s && s[0].toLowerCase() + s.slice(1);
}

function convertType(type: string) {
    if (type === 'xs:short' || type === 'xs:int' || type === 'xs:long' || type === 'xs:float' || type === 'xs:double' || type === 'xs:decimal') {
        return 'number';
    } else if (type === 'xs:boolean') {
        return 'boolean';
    } else if (type === 'xs:string') {
        return 'string';
    } else if (type.indexOf("xs:") === 0) {
        return 'any';
    }
    return capitalize(type);
}

function indent(level: number): string {
    var result = '';
    for (var i=0; i<level; i++) {
        result += '  ';
    }
    return result;
}

function getTsByWadl(src: string): {wadlText: string; xsdPath: string} {
    var parser = sax.parser(true);
    var level = 0;
    var paths: string[] = [];
    var responseType: string = null;
    var result = '';
    var method: string = null;
    var sendObjectString: string = null;
    var baseUri: string = null; // ここって複数になるのかな。
    var xsdIncludeHref: string = null; // ここって複数になるのかな。

    parser.onopentag = (node: Node) => {
        if (node.name === 'resources') {
            baseUri = node.attributes.base;
            result += "export var baseUri = '" + baseUri + "';\n";
            result += 'export var x2js = new X2JS();\n';
        } else if (node.name === 'include') {
            xsdIncludeHref = node.attributes.href;
        } else if (node.name === 'resource') {
            paths[level] = node.attributes.path;
            result += indent(level) + 'export module ' + node.attributes.path + ' {\n';
            level++;
        } else if (node.name === 'method') {
            method = node.attributes.name;
            result += indent(level) + 'export function ' + method.toLowerCase() + '(';
            sendObjectString = '';
            level++;
        } else if (node.name === 'param') {
            result += node.attributes.name + ': ' + convertType(node.attributes.type) + ', ';
            sendObjectString += node.attributes.name + ': ' + node.attributes.name + ', ';
        } else if (node.name === 'ns2:representation') {
            responseType = capitalize(node.attributes.element);
        }
    };

    parser.onclosetag = (tagName: string) => {
        if (tagName === 'resource') {
            level--;
            result += indent(level) + '}\n';
        } else if (tagName === 'method') {
            level--;
            result += 'callback: (response: ' + responseType + ') => void, options: AjaxOptions = {}): void {\n';
            var url = '';
            for (var i=0; i < level; i++) {
                if (i !== 0) {
                    url += "/";
                }
                url += paths[i];
            }
            var reasonTypeUnCap = uncapitalize(responseType);
            result += indent(level+1) + `var settings = <JQueryAjaxSettings>options;\n`;
            result += indent(level+1) + `settings.dataType = 'xml';\n`;
            result += indent(level+1) + `settings.type = '${method}';\n`;
            result += indent(level+1) + `settings.url = baseUri + '${url}';\n`;
            result += indent(level+1) + `settings.data = {${sendObjectString}};\n`;
            result += indent(level+1) + `settings.success = (res: any)=>{callback(<${responseType}>((<any>x2js.xml2json(res)).${reasonTypeUnCap}));};\n`;
            result += indent(level+1) + `$.ajax(settings);\n`;
            result += indent(level) + '}\n';
        }
    }

    parser.write(src).close();

    return {wadlText: result, xsdPath: xsdIncludeHref};
}

function getTsByXsd(src: string): string {

    var isOpendComplexTag = false;
    var result = '';
    var parser = sax.parser(true);

    parser.onopentag = (node: Node) => {
        // console.info("# tag: " + JSON.stringify(node));
        if (node.name === 'xs:complexType') {
            result += 'export interface ' + capitalize(node.attributes.name) + ' {\n';
            isOpendComplexTag = true;
        } else if (node.name === 'xs:element' && isOpendComplexTag) {
            result += '  ' + node.attributes.name + ': '
                + convertType(node.attributes.type)
                + ((node.attributes.maxOccurs > '1' || node.attributes.maxOccurs === 'unbounded') ? '[]' : '')
                + ';\n';
        }
    };

    parser.onclosetag = (tagName: string) => {
        if (tagName === 'xs:complexType') {
            result += '}';
            isOpendComplexTag = false;
        }
    }

    parser.write(src).close();
    return result;
}

function readResource(path: string): string {
    var ret: string = null;

    if ((/^https?:\/\//).test(path)) {
        console.info(path);
        var res = request('GET', path);
        ret = res.getBody('UTF-8');
    } else {
        ret = fs.readFileSync(path, 'UTF-8');
    }

    return ret;
}

var wadlSet = getTsByWadl(readResource(wadlUrl));
var xsdPath: string = null;
if ((/^https?:\/\//).test(wadlSet.xsdPath)) {
    xsdPath = wadlUrl + wadlSet.xsdPath;
} else {
    xsdPath = wadlSet.xsdPath;
}
var xsdText = getTsByXsd(readResource(xsdPath));

var text = `
/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="typings/x2js/xml2json.d.ts" />

module ${moduleName} {

interface AjaxOptions {
    accepts?: any;
    async?: boolean;
    beforeSend? (jqXHR: JQueryXHR, settings: JQueryAjaxSettings): any;
    cache?: boolean;
    complete? (jqXHR: JQueryXHR, textStatus: string): any;
    contents?: { [key: string]: any; };
    contentType?: any;
    context?: any;
    converters?: { [key: string]: any; };
    crossDomain?: boolean;
    dataFilter? (data: any, ty: any): any;
    error? (jqXHR: JQueryXHR, textStatus: string, errorThrown: string): any;
    global?: boolean;
    headers?: { [key: string]: any; };
    ifModified?: boolean;
    isLocal?: boolean;
    jsonp?: any;
    jsonpCallback?: any;
    mimeType?: string;
    password?: string;
    processData?: boolean;
    scriptCharset?: string;
    statusCode?: { [key: string]: any; };
    timeout?: number;
    traditional?: boolean;
    type?: string;
    username?: string;
    xhr?: any;
    xhrFields?: { [key: string]: any; };
}

${xsdText}

${wadlSet.wadlText}

}
`;

var exists = fs.existsSync(outPath);
if (exists) {
    console.error('Already exists.');
} else {
    fs.writeFileSync(outPath, text, {encoding: 'UTF-8'});
    console.info('Success. generated.');
}


