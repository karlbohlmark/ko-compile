PATH:=$(PWD)/node_modules/.bin:$(PATH)

test:
	npm test

.PHONY: test
