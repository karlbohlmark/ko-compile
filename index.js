var fs = require("fs");
var util = require("util");
var inspect = util.inspect;
var esparser = require("acorn");
var parse5 = require("parse5");
var estraverse = require("estraverse");
var escodegen = require("escodegen").generate;
var b = require('ast-types').builders;

var Parser = parse5.Parser;

var traverse = require("./traverse");
var ScopeChain = require("./scope-chain");
var BindingAccessor = require("./binding-accessor");

//var parser2 = new parse5.Parser(parse5.TreeAdapters.htmlparser2);

module.exports = compile;
module.exports.domRewrite = domRewrite;
module.exports.parse = parse;

function compile (tmpl, templateLocator) {
    //process.stderr.write(tmpl)
    var doc = parse(tmpl);
    doc = domRewrite(doc, templateLocator);
    intermediateResult(doc, "dom");

    // 2) Compile - Create rendering AST from DOM
    var ast = toJavaScriptAST(doc);

    qualifyModelPropertyAccess(ast.body[1]);
    intermediateResult(ast, "ast");

    //process.exit()
    return escodegen(ast);
}

function domRewrite(doc, templateReader) {
    // 1) Pre process DOM
    // 1.1) Parse data-bindings and expand into attributes.
    //      data-bind="text: myText" -> data-bind-text="myText"
    doc = traverse(doc, parseBindings);
    // 1.2) Expand foreach-bindings into separate nodes.
    doc = traverse(doc, expandTemplates.bind(null, templateReader));
    doc = traverse(doc, expandForeach);
    doc = traverse(doc, expandTextBinding);
    doc = traverse(doc, removeCircularRefs);
    //doc = traverse(doc, removeDataBindAttributes);
    return doc;
}

function removeDataBindAttributes (doc) {
    if (!doc.attrs) return;

    doc.attrs = doc.attrs.filter(isDataBindAttribute)
}

function parse (tmpl) {
    var p = new Parser();
    var doc = p.parseFragment(tmpl);
    return doc;
}


function parentScope(astNode) {
    var node = astNode.parent;
    while(!node.scope && (node = node.parent))
        ;
    if (node) return node;
}

function qualifyIdentifier (scopeName, identifier) {
    // Turn the `identifier` AST node into a MemberExpression.
    console.log("QUALIFY", identifier)
    identifier.property = JSON.parse(JSON.stringify(identifier));
    identifier.object = b.identifier(scopeName);
    identifier.type = "MemberExpression";
    delete identifier.name;
}

function qualifyModelPropertyAccess(ast, rootModelVarName) {
    if (!rootModelVarName) {
        rootModelVarName = 'model';
    }
    var scope = new ScopeChain([rootModelVarName]);
    var parent = null;

    function qualifyIfUndeclared(node) {
        if (!scope.contains(node.name)) {
            qualifyIdentifier(rootModelVarName, node);
        }
    }

    estraverse.traverse(ast, {
        enter: function (node, parent) {
            if (node.type == 'FunctionExpression' || node.type == 'FunctionDeclaration') {
                scope.enter(node.params.map(function (id) { return id.name; }));
            }

            if (node.type == 'VariableDeclarator') {
                scope.append(node.id.name)
            }

            if (node.type == "Identifier" && (!parent || 
                parent.type != "VariableDeclarator" &&
                parent.type != "FunctionDeclaration" &&
                parent.type != "MemberExpression")) {
                qualifyIfUndeclared(node);
            }

            if (node.type == "MemberExpression" && (!parent || parent.type != "MemberExpression")) {
                var obj = getMemberExpressionRoot(node);
                qualifyIfUndeclared(obj);
            }

        },
        leave: function (node, parent) {
            if (node.type == 'FunctionExpression' || node.type == 'FunctionDeclaration') {
                scope.exit(node.params.map(function (id) { return id.name; }));
            }
        }
    });
}

module.exports.qualifyModelPropertyAccess = qualifyModelPropertyAccess


function getMemberExpressionRoot (node) {
    var obj = node.object;
    while (obj.type == "MemberExpression" && (obj = obj.object))
        ;
    return obj;
}

function removeCircularRefs(node) {
    delete node.parentNode;
    delete node.namespaceURI;
}

// AST utils
var bufferVarName = "buffer";

function declareEmptyBuffer() {
    return b.variableDeclaration('var', [
        b.variableDeclarator(
            b.identifier(bufferVarName),
            b.literal("")
        )
    ])
}

function concatBuffer(node) {
    return  b.expressionStatement(
                b.assignmentExpression(
                    '+=',
                    b.identifier('buffer'),
                    node
                )
            )
}

function renderBindingAttr (attr) {
    var attrStart = b.literal(' ' + attr.name.replace('data-bind-', '') + '="');
    console.log("binding expr", attr.bindingExpression)
    var attrValue = attr.bindingExpression;
    var attrRenderAst = b.binaryExpression('+', attrStart, attrValue);

    return concatBuffer(b.binaryExpression('+', attrRenderAst, b.literal('"')));
}

function renderAttr (attr) {
    if (attr.bindingExpression) return renderBindingAttr(attr);
    return concatBuffer(b.literal(' ' + attr.name + '=' + '"' + attr.value + '"'))
}

function isDataBindAttribute (attr) {
    return attr.name.indexOf('data-bind') != 0;
}

function not(pred) {
    return function (object) {
        return !pred(object);
    }
}

var loopVars = {};
var loopVarCount = 0;

function nextLoopVarName() {
    loopVarCount++;
    return "ko_foreach_i" + (loopVarCount == 1 ? '' : loopVarCount);
}

var nodeTypes = {}
nodeTypes.tag =  function compileTag(node) {
    var tagName = node.tagName;
    var beginOpenTag = concatBuffer(b.literal('<' + tagName));
    
    var attributes = (node.attrs || [])
        .map(renderAttr);
    
    var endOpenTag = concatBuffer(b.literal('>'));
    var closeTag = concatBuffer(b.literal('</' + tagName + '>'))
    attributes.unshift(beginOpenTag);
    attributes.push(endOpenTag);
    
    var inv = (node.childNodes || []).filter(function (n) {
        return !n.nodeName;
    })

    var statements = attributes.concat(
        (node.childNodes || []).map(toJavaScriptAST)
    )
    statements = flatten(statements);
    statements.push(closeTag);
    return statements;
}
nodeTypes.text = function compileText(node) {
    return concatBuffer(b.literal(node.value));
}
nodeTypes.interpolation = function compileInterpolation(node) {
    return concatBuffer(node.expression);
}
nodeTypes.foreach = function compileForeach(node) {
    /*
        <foreach expression="item in items">
            <span data-bind-text="item.name"></span>
        </foreach>
        
        becomes:

        for (var i in model.items) {
            var item = model.items[i];
            buffer += .....
        }
    */
    var loopVarName = nextLoopVarName();
    var loopVarDecl = b.variableDeclaration('var', [
        b.variableDeclarator(
            b.identifier(loopVarName),
            null
        )
    ])

    var bodyNodes = flatten(node.childNodes.map(toJavaScriptAST));

    var itemVarDecl = b.variableDeclaration('var', [
        b.variableDeclarator(
            b.identifier(node.loopVar),
            indexedProperty(node.enumerable, b.identifier(loopVarName))
        )
    ])
    
    bodyNodes.unshift(itemVarDecl);
    var block = b.blockStatement(bodyNodes);
    return b.forInStatement(loopVarDecl, node.enumerable, block, false);
}
nodeTypes.documentFragment = function compileDocumentFragment(node) {
    var children = flatten(node.childNodes.map(toJavaScriptAST));
    children.unshift(declareEmptyBuffer())
    children.push(b.returnStatement(b.identifier(bufferVarName)));

    var fnDecl = b.functionDeclaration(
        b.identifier('render'),
        [b.identifier('model')],
        b.blockStatement(children)
    )

    var moduleExports = singleExport(b.identifier('render'));

    return b.program([moduleExports, fnDecl]);
}

module.exports.toJavaScriptAST = toJavaScriptAST

function singleExport(expression) {
    return b.expressionStatement(
        b.assignmentExpression('=',
            b.memberExpression(
                b.identifier('module'),
                b.identifier('exports'),
                false
            ),
            expression
        )
    )
}

function indexedProperty(object, property) {
    return b.memberExpression(
        object,
        property,
        true
    )
}

function flatten(arr) {
    return arr.reduce(function (acc, cur) {
        return acc.concat(cur)
    }, [])
}

function toJavaScriptAST (node) {
    var type = nodeType(node);
    if (!(type in nodeTypes)) throw Error("Invallid nodeType: " + type);

    return nodeTypes[type](node);
}

function nodeType(node) {
    if (node.tagName) return "tag";
    if (node.nodeName == "#text") return "text";
    if (node.nodeName == "#document-fragment") return "documentFragment";
    if (!node.nodeName) {
        debug("ERRRR")
        debug(JSON.stringify(node))
        debug(node)
        throw new Error("No nodename")
    }
    return node.nodeName;
}

function expandForeach (node) {
    var foreachDecl = getBindingAttribute(node, 'foreach');
    if (!foreachDecl) return;
    var expr = foreachDecl.bindingExpression;

    node.attrs = node.attrs.filter(function (attr) {
        return attr !== foreachDecl;
    })

    return {
        nodeName: meta('foreach'),
        loopVar: expr.left.name,
        enumerable: expr.right,
        childNodes: [node]
    }
}

function expandTemplates (templateReader, node) {
    // This initial version will only be supporting constant (literal)
    // template expressions.
    // To support dynamic templates, probably rewrite into template meta-node.
    /*
    {
      "name": "data-bind-template",
      "value": "'sub-template'",
      "bindingExpression": {
        "type": "Literal",
        "start": 36,
        "end": 50,
        "value": "sub-template",
        "raw": "'sub-template'"
      }
    }
    */
    var templateDecl = getBindingAttribute(node, 'template');
    var dataDecl = getBindingAttribute(node, 'data');
    if (!templateDecl) return;

    node.attrs = node.attrs.filter(function (attr) {
        return attr !== templateDecl && attr != dataDecl;
    })

    var templateDataRootName = dataDecl.bindingExpression.name;
    var templateName = templateDecl.bindingExpression.value;
    var templateStr = templateReader(templateName);

    var templateDom = parse(templateStr);

    templateDom = traverse(templateDom, parseBindings);
    templateDom = traverse(templateDom, scopeGlobalPropertyAccess.bind(null, templateDataRootName));
    //templateDataRootName
    
    node.childNodes = templateDom.childNodes;
}

function scopeGlobalPropertyAccess (name, node) {
    if (!node.attrs) return;
    node.attrs.forEach(function (attr) {
        var expr = attr.bindingExpression;
        if (!expr) return;

        if (expr.type == "MemberExpression") {
            console.log("WEIRD BRANCH");
            var obj = getMemberExpressionRoot(expr);
            return
        }
        // TODO, handle expr not being an identifier

        qualifyModelPropertyAccess(expr, name);
        //qualifyIdentifier(name, expr);
    })
    
    //console.log("ADD SCOPE", expr)
}

function expandTextBinding (node) {
    var textDecl = getBindingAttribute(node, 'text');
    if (!textDecl) return;

    node.attrs = node.attrs.filter(function (attr) {
        return attr !== textDecl;
    })
    node.childNodes = [{
        nodeName: meta('interpolation'),
        expression: textDecl.bindingExpression
    }]
}

function parseBindings (node) {
    // Parse all `data-bind`-attributes into js objects.
    // Parse JavaScript expressions in values.
    if (!node.attrs) return;
    var bindingDecl = by('name', 'data-bind', node.attrs)[0];
    if (!bindingDecl) return;
    var bindingExpression = '({' + bindingDecl.value + '})';

    var ast = esparser.parse(bindingExpression);
    var bindingNodes = ast.body[0].expression.properties;
    bindingNodes.forEach(function (b) {
        node.attrs.push({
            name: 'data-bind-' + (b.key.name || b.key.value),
            value: bindingExpression.substring(b.value.start, b.value.end),
            bindingExpression: b.value
        })
    })
}

function getBindingAttribute (node, name) {
    if (!node.attrs) return;
    return by('name', 'data-bind-' + name, node.attrs)[0];
}

function by(property, value, arr) {
    // Return filtered array with items matching `property, value`
    return arr.filter(function (item) {
        return item[property] == value;
    })
}

function debug(s) {
    process.stderr.write(util.inspect(s) + '\n');

}

function intermediateResult(obj, name) {
    var res;
    try {
        res = JSON.stringify(obj);
    } catch (e) {
        res = util.inspect(obj, {depth: null})
    }
    fs.writeFileSync(name + ".json", res);
}

function meta (str) {
    return str;
}