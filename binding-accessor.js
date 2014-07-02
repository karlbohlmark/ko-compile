var esparser = require('esprima');
//var escodegen = require('escodegen');

module.exports = BindingAccessor

function BindingAccessor (el) {
	if (!el.attrs) el.attrs = []
	this.attrs = el.attrs;
	this.parseBindings(el);
}

BindingAccessor.prototype.bindingAttributeName = 'data-bind';

BindingAccessor.prototype.getBindingAttribute = function () {
	return this.attrs.filter(function (a) {
		return a.name == this.bindingAttributeName;
	}).pop();
}

BindingAccessor.prototype.get = function (binding) {
	return this.bindings.filter(function (b) {
		return b.key == binding;
	}).pop();
}

BindingAccessor.prototype.set = function (val) {
	if (typeof val == 'object') {
		val = serializeBindingAttr(val)
	}
	return this.el.setAttribute(this.bindingAttributeName, val)
}

BindingAccessor.prototype.parseBindings = function () {
	var str = this.getBindingAttribute()

	if (!str) return [];
	
	var bindingExpression = '({' + str + '})'
	var ast = esparser.parse(bindingExpression)
	var bindingNodes = ast.body[0].expression.properties
	return this.bindings = bindingNodes.map(function (b) {
		b.key = b.key.name;
		b.raw = bindingExpression.substring(b.value.start, b.value.end)
		return b;
	})	
}

BindingAccessor.prototype.toJSON = function () {
	return this.bindings;
}

function serializeBindingAttr(bindings) {
	return bindings.map(function (b) {
		return b.key + ':' + escodegen.generate(b.value)
	}).join(', ')
}


module.exports.test = function () {
	var e = "text: name + 3, click: doStuff"
	
	console.log(parseBinding(e))
}