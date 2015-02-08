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
            result += 'callback: (response: ' + responseType + ') => void): void {\n';
            var url = '';
            for (var i=0; i < level; i++) {
                if (i !== 0) {
                    url += "/";
                }
                url += paths[i];
            }
            var reasonTypeUnCap = uncapitalize(responseType);
            result += indent(level+1) + `$.ajax({dataType: 'xml', type: '${method}', url: baseUri + '${url}', data: {${sendObjectString}}, success: (res: any)=>{callback(<${responseType}>((<any>x2js.xml2json(res)).${reasonTypeUnCap}));}});\n`;
            result += indent(level) + '}\n';
        }
    }

    parser.write(src).close();

    var xsdPath = baseUri + xsdIncludeHref;
    return {wadlText: result, xsdPath: xsdPath};
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
        var res = request('GET', path);
        ret = res.getBody('UTF-8');
    } else {
        ret = fs.readFileSync(path, 'UTF-8');
    }

    return ret;
}

var wadlSet = getTsByWadl(readResource(wadlUrl));
var xsdText = getTsByXsd(readResource(wadlSet.xsdPath));

var text = `
/// <reference path="typings/jquery/jquery.d.ts" />
/// <reference path="typings/x2js/xml2json.d.ts" />

module ${moduleName} {

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

