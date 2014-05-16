PATH:=$(PWD)/node_modules/.bin:$(PATH)

test:
	tap test/render/index.js

.PHONY: test
