module.exports = ScopeChain;

function ScopeChain(scopes) {
    this.scopes = scopes || []
}

ScopeChain.prototype.enter = function (names) {
    this.scopes.unshift(names)
}

ScopeChain.prototype.append = function (name) {
    var s = this.scopes[this.scopes.length-1];
    s.push(name);
}

ScopeChain.prototype.exit = function (names) {
    var out = this.scopes.shift();
    if (out.length < names.length) throw Error("Unexpected scope exit")
    var s = this.scopes[this.scopes.length-1];
    for (var i = 0; i<names.length; i++) {
        if (out[i] != names[i]) {
            throw Error("Unexpected scope exit")
        }
    }
}

ScopeChain.prototype.contains = function (name) {
    for(var i = 0; i<this.scopes.length; i++) {
        var s = this.scopes[i];
        if (s.indexOf(name)!==-1) {
            return true;
        }
    }
    return false;
}
